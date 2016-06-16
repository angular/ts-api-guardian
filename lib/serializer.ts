import * as path from 'path';
import * as ts from 'typescript';

const baseTsOptions: ts.CompilerOptions = {
  // We don't want symbols from external modules to be resolved, so we use the
  // classic algorithm.
  moduleResolution: ts.ModuleResolutionKind.Classic
};

export function publicApi(fileName: string): string {
  return publicApiInternal(ts.createCompilerHost(baseTsOptions), fileName, baseTsOptions);
}

export function publicApiInternal(
    host: ts.CompilerHost, fileName: string, tsOptions: ts.CompilerOptions): string {
  const entrypoint = path.normalize(fileName);

  if (!entrypoint.match(/\.d\.ts$/)) {
    throw new Error(`Source file "${fileName}" is not a declaration file`);
  }

  const program = ts.createProgram([entrypoint], tsOptions, host);
  return emitResolvedDeclarations(program, entrypoint);
}

function emitResolvedDeclarations(program: ts.Program, fileName: string): string {
  const sourceFile = program.getSourceFiles().filter(sf => sf.fileName === fileName)[0];
  if (!sourceFile) {
    throw new Error(`Source file "${fileName}" not found`);
  }

  let output = '';

  const resolvedSymbols = getResolvedSymbols(program, sourceFile);
  // Sort all symbols so that the output is more deterministic
  resolvedSymbols.sort(symbolCompareFunction);
  for (const symbol of resolvedSymbols) {
    let decl: ts.Node = symbol.valueDeclaration || symbol.declarations && symbol.declarations[0];
    if (!decl) {
      console.warn(`No declaration found for symbol "${symbol.name}"`);
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
      output += stripEmptyLines(getSanitizedText(decl)) + '\n';
    } else {
      // This may happen for symbols re-exported from external modules.
      console.warn(`Warning: No export declaration found for symbol "${symbol.name}"`);
    }
  }

  return output;
}

function getResolvedSymbols(program: ts.Program, sourceFile: ts.SourceFile): ts.Symbol[] {
  const typeChecker = program.getTypeChecker();

  const ms = (<any>sourceFile).symbol;
  const rawSymbols = ms ? (typeChecker.getExportsOfModule(ms) || []) : [];
  return rawSymbols.map(s => {
    if (s.flags & ts.SymbolFlags.Alias) {
      const resolvedSymbol = typeChecker.getAliasedSymbol(s);

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

function symbolCompareFunction(a: ts.Symbol, b: ts.Symbol) {
  return a.name.localeCompare(b.name);
}

/**
 * Traverses the node tree to construct the text without comments and privates.
 */
function getSanitizedText(node: ts.Node): string {
  if (node.flags & ts.NodeFlags.Private) {
    return '';
  }

  const children = node.getChildren();
  if (children.length) {
    return node.getChildren().map(n => getSanitizedText(n)).join('');
  } else {
    const sourceText = node.getSourceFile().text;
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

function stripEmptyLines(text: string): string {
  return text.split('\n').filter(x => !!x.length).join('\n');
}
