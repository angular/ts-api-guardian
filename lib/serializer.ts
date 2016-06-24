import * as path from 'path';
import * as ts from 'typescript';

const baseTsOptions: ts.CompilerOptions = {
  // We don't want symbols from external modules to be resolved, so we use the
  // classic algorithm.
  moduleResolution: ts.ModuleResolutionKind.Classic
};

export interface SerializationOptions {
  /**
   * Removes all exports matching the regular expression.
   */
  stripExportPattern?: RegExp;
  /**
   * Whitelists these identifiers as modules in the output. For example,
   * ```
   * import * as angular from './angularjs';
   *
   * export class Foo extends angular.Bar {}
   * ```
   * will produce `export class Foo extends angular.Bar {}` and requires
   * whitelisting angular.
   */
  allowModuleIdentifiers?: string[];
  /**
   * Warns or errors if stability annotations are missing on an export.
   * Supports experimental, stable and deprecated.
   */
  onStabilityMissing?: string;  // 'warn' | 'error' | 'none'
}

export function publicApi(fileName: string, options: SerializationOptions = {}): string {
  return publicApiInternal(ts.createCompilerHost(baseTsOptions), fileName, baseTsOptions, options);
}

export function publicApiInternal(
    host: ts.CompilerHost, fileName: string, tsOptions: ts.CompilerOptions,
    options: SerializationOptions = {}): string {
  const entrypoint = path.normalize(fileName);

  if (!entrypoint.match(/\.d\.ts$/)) {
    throw new Error(`Source file "${fileName}" is not a declaration file`);
  }

  const program = ts.createProgram([entrypoint], tsOptions, host);
  return new ResolvedDeclarationEmitter(program, entrypoint, options).emit();
}

interface Diagnostic {
  type: string;  // 'warning' | 'error'
  message: string;
}

class ResolvedDeclarationEmitter {
  private program: ts.Program;
  private fileName: string;
  private typeChecker: ts.TypeChecker;
  private options: SerializationOptions;
  private diagnostics: Diagnostic[];

  constructor(program: ts.Program, fileName: string, options: SerializationOptions) {
    this.program = program;
    this.fileName = fileName;
    this.options = options;
    this.diagnostics = [];

    this.typeChecker = this.program.getTypeChecker();
  }

  emit(): string {
    const sourceFile = this.program.getSourceFiles().filter(sf => sf.fileName === this.fileName)[0];
    if (!sourceFile) {
      throw new Error(`Source file "${this.fileName}" not found`);
    }

    let output = '';

    const resolvedSymbols = this.getResolvedSymbols(sourceFile);
    // Sort all symbols so that the output is more deterministic
    resolvedSymbols.sort(symbolCompareFunction);

    for (const symbol of resolvedSymbols) {
      if (this.options.stripExportPattern && symbol.name.match(this.options.stripExportPattern)) {
        continue;
      }

      let decl: ts.Node = symbol.valueDeclaration || symbol.declarations && symbol.declarations[0];
      if (!decl) {
        this.diagnostics.push({
          type: 'warning',
          message: `${sourceFile.fileName}: error: No declaration found for symbol "${symbol.name}"`
        });
        continue;
      }

      // The declaration node may not be a complete statement, e.g. for var/const
      // symbols. We need to find the complete export statement by traversing
      // upwards.
      while (!(decl.flags & ts.NodeFlags.Export) && decl.parent) {
        decl = decl.parent;
      }
      if (decl.flags & ts.NodeFlags.Export) {
        // Make an empty line between two exports
        if (output) {
          output += '\n';
        }

        // Print stability annotation
        const sourceText = decl.getSourceFile().text;
        const trivia = sourceText.substr(decl.pos, decl.getLeadingTriviaWidth());
        const match = stabilityAnnotationPattern.exec(trivia);
        if (match) {
          output += `/** @${match[1]} */\n`;
        } else if (['warn', 'error'].indexOf(this.options.onStabilityMissing) >= 0) {
          this.diagnostics.push({
            type: this.options.onStabilityMissing,
            message: createErrorMessage(
                decl, `No stability annotation found for symbol "${symbol.name}"`)
          });
        }

        output += stripEmptyLines(this.emitNode(decl)) + '\n';
      } else {
        // This may happen for symbols re-exported from external modules.
        this.diagnostics.push({
          type: 'warning',
          message:
              createErrorMessage(decl, `No export declaration found for symbol "${symbol.name}"`)
        });
      }
    }

    if (this.diagnostics.length) {
      const message = this.diagnostics.map(d => d.message).join('\n');
      console.warn(message);
      if (this.diagnostics.some(d => d.type === 'error')) {
        throw new Error(message);
      }
    }

    return output;
  }

  private getResolvedSymbols(sourceFile: ts.SourceFile): ts.Symbol[] {
    const ms = (<any>sourceFile).symbol;
    const rawSymbols = ms ? (this.typeChecker.getExportsOfModule(ms) || []) : [];
    return rawSymbols.map(s => {
      if (s.flags & ts.SymbolFlags.Alias) {
        const resolvedSymbol = this.typeChecker.getAliasedSymbol(s);

        // This will happen, e.g. for symbols re-exported from external modules.
        if (!resolvedSymbol.valueDeclaration && !resolvedSymbol.declarations) {
          return s;
        }
        if (resolvedSymbol.name !== s.name) {
          throw new Error(
              `Symbol "${resolvedSymbol.name}" was aliased as "${s.name}". ` +
              `Aliases are not supported."`);
        }

        return resolvedSymbol;
      } else {
        return s;
      }
    });
  }

  emitNode(node: ts.Node) {
    if (node.flags & ts.NodeFlags.Private) {
      return '';
    }

    const firstQualifier: ts.Identifier = getFirstQualifier(node);

    if (firstQualifier) {
      if (!this.options.allowModuleIdentifiers ||
          this.options.allowModuleIdentifiers.indexOf(firstQualifier.text) < 0) {
        this.diagnostics.push({
          type: 'error',
          message: createErrorMessage(
              firstQualifier,
              `Module identifier "${firstQualifier.text}" is not allowed. Remove it ` +
                  `from source or whitelist it via --allowModuleIdentifiers.`)
        });
      }
    }

    let children = node.getChildren();
    const sourceText = node.getSourceFile().text;
    if (children.length) {
      // Sort declarations under a class or an interface
      if (node.kind === ts.SyntaxKind.SyntaxList) {
        switch (node.parent && node.parent.kind) {
          case ts.SyntaxKind.ClassDeclaration:
          case ts.SyntaxKind.InterfaceDeclaration: {
            // There can be multiple SyntaxLists under a class or an interface,
            // since SyntaxList is just an arbitrary data structure generated
            // by Node#getChildren(). We need to check that we are sorting the
            // right list.
            if (children.every(node => node.kind in memberDeclarationOrder)) {
              children = children.slice();
              children.sort((a: ts.Declaration, b: ts.Declaration) => {
                // Static after normal
                return compareFunction(
                           a.flags & ts.NodeFlags.Static, b.flags & ts.NodeFlags.Static) ||
                    // Our predefined order
                    compareFunction(
                           memberDeclarationOrder[a.kind], memberDeclarationOrder[b.kind]) ||
                    // Alphebetical order
                    // We need safe dereferencing due to edge cases, e.g. having two call signatures
                    compareFunction((a.name || a).getText(), (b.name || b).getText());
              });
            }
            break;
          }
        }
      }

      let output = children.map(n => this.emitNode(n)).join('');

      // Print stability annotation for fields
      if (node.kind in memberDeclarationOrder) {
        const trivia = sourceText.substr(node.pos, node.getLeadingTriviaWidth());
        const match = stabilityAnnotationPattern.exec(trivia);
        if (match) {
          // Add the annotation after the leading whitespace
          output = output.replace(/^(\n\s*)/, `$1/** @${match[1]} */ `);
        }
      }

      return output;
    } else {
      const ranges = ts.getLeadingCommentRanges(sourceText, node.pos);
      let tail = node.pos;
      for (const range of ranges || []) {
        if (range.end > tail) {
          tail = range.end;
        }
      }
      return sourceText.substring(tail, node.end);
    }
  }
}

function symbolCompareFunction(a: ts.Symbol, b: ts.Symbol) {
  return a.name.localeCompare(b.name);
}

function compareFunction<T>(a: T, b: T) {
  return a === b ? 0 : a > b ? 1 : -1;
}

const memberDeclarationOrder = {
  [ts.SyntaxKind.PropertySignature]: 0,
  [ts.SyntaxKind.PropertyDeclaration]: 0,
  [ts.SyntaxKind.GetAccessor]: 0,
  [ts.SyntaxKind.SetAccessor]: 0,
  [ts.SyntaxKind.CallSignature]: 1,
  [ts.SyntaxKind.Constructor]: 2,
  [ts.SyntaxKind.ConstructSignature]: 2,
  [ts.SyntaxKind.IndexSignature]: 3,
  [ts.SyntaxKind.MethodSignature]: 4,
  [ts.SyntaxKind.MethodDeclaration]: 4
};

const stabilityAnnotationPattern = /@(experimental|stable|deprecated)\b/;

function stripEmptyLines(text: string): string {
  return text.split('\n').filter(x => !!x.length).join('\n');
}

/**
 * Returns the first qualifier if the input node is a dotted expression.
 */
function getFirstQualifier(node: ts.Node): ts.Identifier {
  if (node.kind === ts.SyntaxKind.PropertyAccessExpression) {
    // For expression position
    let lhs: ts.Node = node;
    do {
      lhs = (<ts.PropertyAccessExpression>lhs).expression;
    } while (lhs && lhs.kind !== ts.SyntaxKind.Identifier);

    return <ts.Identifier>lhs;

  } else if (node.kind === ts.SyntaxKind.TypeReference) {
    // For type position
    let lhs: ts.Node = (<ts.TypeReferenceNode>node).typeName;
    do {
      lhs = (<ts.QualifiedName>lhs).left;
    } while (lhs && lhs.kind !== ts.SyntaxKind.Identifier);

    return <ts.Identifier>lhs;

  } else {
    return null;
  }
}

function createErrorMessage(node: ts.Node, message: string): string {
  const sourceFile = node.getSourceFile();
  let position;
  if (sourceFile) {
    const {line, character} = sourceFile.getLineAndCharacterOfPosition(node.getStart());
    position = `${sourceFile.fileName}(${line + 1},${character + 1})`;
  } else {
    position = '<unknown>';
  }

  return `${position}: error: ${message}`;
}
