import * as ts from 'typescript';

export abstract class Base<T> {
  abstract mapNode(n: ts.Node): T;

  mapNodes(nodes: ts.Node[]): T[] { return nodes ? nodes.map((n) => this.mapNode(n)) : []; }
}

export default class PublicApiAggregator extends Base<string[]> {
  mapNode(node: ts.Node): string[] {
    switch (node.kind) {
      case ts.SyntaxKind.VariableDeclaration:
        const varDecl = <ts.VariableDeclaration>node;
        const name = getName(node);
        const isConst = hasFlag(varDecl.parent, ts.NodeFlags.Const);
        const type = this.getColonType(node);
        return [`${isConst ? 'const' : 'var'} ${name}${type}`];

      case ts.SyntaxKind.ClassDeclaration:
        const classDecl = <ts.ClassDeclaration>node;
        return this.getClassLike('class', classDecl);

      case ts.SyntaxKind.EnumDeclaration:
        const enumDecl = <ts.ClassDeclaration>node;
        return this.getClassLike('enum', enumDecl);

      case ts.SyntaxKind.EnumMember:
        return ['.' + getName(node)];

      case ts.SyntaxKind.InterfaceDeclaration:
        const ifDecl = <ts.InterfaceDeclaration>node;
        return this.getClassLike('interface', ifDecl);

      case ts.SyntaxKind.MethodDeclaration:
        if (this.shouldBeSkipped(node)) return [];
        return [getSeparator(node) + this.getFunctionLike(<ts.MethodDeclaration>node) + getAccessModifier(node)];

      case ts.SyntaxKind.PropertyDeclaration:
        if (this.shouldBeSkipped(node)) return [];
        return [getSeparator(node) + this.getProperty(<ts.PropertyDeclaration>node) + getAccessModifier(node)];

      case ts.SyntaxKind.Constructor:
        return [
          '.' + this.getConstructor(<ts.ConstructorDeclaration>node),
          ...this.getConstructorProperties(<ts.ConstructorDeclaration>node)
        ];

      case ts.SyntaxKind.PropertySignature:
        return [getSeparator(node) + this.getProperty(<ts.PropertyDeclaration>node) + getAccessModifier(node)];

      case ts.SyntaxKind.MethodSignature:
        return [getSeparator(node) + this.getFunctionLike(<ts.MethodDeclaration>node) + getAccessModifier(node)];

      case ts.SyntaxKind.GetAccessor:
        if (this.shouldBeSkipped(node)) return [];
        return [getSeparator(node) + this.getGetter(<ts.AccessorDeclaration>node) + getAccessModifier(node)];

      case ts.SyntaxKind.SetAccessor:
        if (this.shouldBeSkipped(node)) return [];
        return [getSeparator(node) + this.getSetter(<ts.AccessorDeclaration>node) + getAccessModifier(node)];

      case ts.SyntaxKind.FunctionDeclaration:
        return [this.getFunctionLike(<ts.FunctionDeclaration>node)];

      default:
        return [];
    }
  }

  private shouldBeSkipped(decl: ts.Node): boolean {
    const name = (<any>decl).name;
    if (name.kind === ts.SyntaxKind.ComputedPropertyName) {
      return true;
    }
    const n = getName(decl);
    return hasFlag(decl.modifiers, ts.NodeFlags.Private) || n[0] == '_';
  }

  private getFunctionLike(node: ts.FunctionLikeDeclaration): string {
    const name = getName(node);
    const params = this.getParameters(node.parameters);
    const retType = this.getColonType(node);
    return `${name}(${params})${retType}`;
  }

  private getConstructor(node: ts.FunctionLikeDeclaration): string {
    const params = this.getParameters(node.parameters);
    return `constructor(${params})`;
  }

  private getConstructorProperties(node: ts.FunctionLikeDeclaration): string[] {
    const properties: string[] = [];
    node.parameters.forEach(p => {
      // only add a property if it explicitly has public or protected access modifier
      if (hasFlag(p, ts.NodeFlags.Public) || hasFlag(p, ts.NodeFlags.Protected)) {
        properties.push(`#${this.getParameter(p)}${getAccessModifier(p)}`.trim());
      }
    });
    return properties;
  }

  private getGetter(node: ts.AccessorDeclaration): string {
    const name = getName(node);
    const type = this.getColonType(node);
    return `${name}${type}`;
  }

  private getSetter(node: ts.AccessorDeclaration): string {
    const name = getName(node);
    const params = this.getParameters(node.parameters);
    return `${name}=(${params})`;
  }

  private getProperty(decl: ts.PropertyDeclaration): string {
    const name = getName(decl);
    const type = this.getColonType(decl);
    return `${name}${type}`;
  }

  private getParameters(nodes: ts.NodeArray<ts.ParameterDeclaration>): string {
    return nodes.map(p => this.getParameter(p)).join(', ');
  }

  private getParameter(node: ts.ParameterDeclaration): string {
    return `${getName(node)}${getOptional(node)}:${getType(node)}${getInitializer(node)}`;
  }

  private getClassLike(keyword: string, decl: ts.ClassDeclaration|ts.InterfaceDeclaration):
      string[] {
    const name = getName(decl);
    const typeParams = typesToString(decl.typeParameters);
    const nameWithTypes = typeParams ? `${name}<${typeParams}>` : name;
    const members = this.mapNodes(decl.members);
    return [nameWithTypes].concat(flatten(members).map(m => `${name}${m}`));
  }

  private getColonType(node: ts.Node): string {
    const type = getType(node);
    return type ? `:${type}` : '';
  }
}

class TypeExtract extends Base<string> {
  mapNode(node: ts.Node): string {
    switch (node.kind) {
      case ts.SyntaxKind.TypeLiteral:
        let members = (<ts.TypeLiteralNode>node).members;
        const strMembers = [];
        for (let i = 0; i < members.length; ++i) {
          let member = members[i];
          const name = getName(member);
          const question = !!(<any>member).questionToken;
          const type = getType(member);
          strMembers.push(`${name}${question ? '?' : ''}:${type}`);
        }
        return `{${strMembers.join(", ")}}`;

      case ts.SyntaxKind.UnionType:
        return this.mapNodes((<ts.UnionTypeNode>node).types).join('|');

      case ts.SyntaxKind.TypeReference:
        const typeRef = <ts.TypeReferenceNode>node;
        const name = this.mapNode(typeRef.typeName);
        const typeParams =
            typeRef.typeArguments ? this.mapNodes(typeRef.typeArguments).join(', ') : null;
        return typeParams ? `${name}<${typeParams}>` : name;

      case ts.SyntaxKind.TypeParameter:
        const typeParam = <ts.TypeParameterDeclaration>node;
        return this.mapNode(typeParam.name);

      case ts.SyntaxKind.ArrayType:
        const type = this.mapNode((<ts.ArrayTypeNode>node).elementType);
        return `${type}[]`;

      case ts.SyntaxKind.TupleType:
        const types = this.mapNodes((<ts.TupleTypeNode>node).elementTypes);
        return `[${types.join(', ')}]`;

      case ts.SyntaxKind.FunctionType:
        return node.getText();

      case ts.SyntaxKind.QualifiedName:
        var first = <ts.QualifiedName>node;
        return this.mapNode(first.right);

      case ts.SyntaxKind.Identifier:
        var ident = <ts.Identifier>node;
        return ident.text;

      case ts.SyntaxKind.NumberKeyword:
        return 'number';

      case ts.SyntaxKind.StringKeyword:
        return 'string';

      case ts.SyntaxKind.VoidKeyword:
        return 'void';

      case ts.SyntaxKind.BooleanKeyword:
        return 'boolean';

      case ts.SyntaxKind.AnyKeyword:
        return 'any';

      default:
        return 'unknown';
    }
  }
}

function typeToString(node: ts.Node): string {
  return node ? new TypeExtract().mapNode(node) : null;
}

function typesToString(nodes: ts.Node[]): string {
  return nodes ? new TypeExtract().mapNodes(nodes).join(',') : null;
}

function hasFlag(n: {flags: number}, flag: ts.NodeFlags): boolean {
  return n && (n.flags & flag) !== 0 || false;
}

function reportError(n: ts.Node, message: string) {
  const file = n.getSourceFile();
  const fileName = file.fileName;
  const start = n.getStart(file);
  const pos = file.getLineAndCharacterOfPosition(start);
  // Line and character are 0-based.
  const fullMessage = `${fileName}:${pos.line + 1}:${pos.character + 1}: ${message}`;
  throw new Error(fullMessage);
}

function flatten<T>(nestedArray: T[][]): T[] {
  return nestedArray.reduce((a, b) => a.concat(b), []);
}

function getName(node: ts.Node): string {
  const name = (<any>node).name;
  if (name) {
    return removeSpaces(name.getText());
  } else if (node.kind === ts.SyntaxKind.IndexSignature) {
    const sig = <ts.IndexSignatureDeclaration>node;
    return `[${removeSpaces(sig.parameters[0].getText())}]`;
  } else {
    reportError(node, 'Cannot get name');
  }
}

function getOptional(node: ts.ParameterDeclaration): string {
  return (node.questionToken) ? '?' : '';
}

function getType(node: ts.Node): string {
  const t = typeToString((<any>node).type);
  return t ? t : 'any';
}


function getInitializer(node: ts.ParameterDeclaration): string {
  if (node.initializer) {
    return '=' + node.initializer.getText();
  } else {
    return '';
  }
}


function getSeparator(node: ts.Node): string {
  return (hasFlag(node, ts.NodeFlags.Static) ? '.' : '#');
}


function getAccessModifier(node: ts.Node): string {
  return (hasFlag(node, ts.NodeFlags.Protected)) ? ' // protected' : '';
}


function removeSpaces(s: string): string {
  return s.replace(/\s+/g, '');
}
