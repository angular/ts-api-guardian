import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';

import MetadataAggregator from './api_aggregator';

export function publicApi(file: string): string[] {
  return publicApiInternal(getCompilerHost(), file);
}

export function publicApiInternal(host:ts.CompilerHost, fileName:string):string[] {
  var resolvesSymbols = getResolvedSymbols(fileName, host);
  const m = new MetadataAggregator();
  return flatten(resolvesSymbols.map(s => {
    const decl = s.valueDeclaration ? s.valueDeclaration : s.declarations[0];
    return m.mapNode(decl);
  }));
}

function getResolvedSymbols(fileName: string, host: ts.CompilerHost): ts.Symbol[] {
  const normalizedFileName = normalizeSlashes(fileName);
  const program = ts.createProgram([normalizedFileName], {}, host);
  const typeChecker = program.getTypeChecker();
  const sourceFiles = program.getSourceFiles();
  const entryPoint = sourceFiles.filter(sf => sf.fileName === normalizedFileName)[0];
  const ms = moduleSymbol(entryPoint);
  const rawSymbols = ms ? (typeChecker.getExportsOfModule(ms) || []) : [];
  return rawSymbols.map(s => {
    return (s.flags & ts.SymbolFlags.Alias) ? typeChecker.getAliasedSymbol(s) : s;
  });
}

function moduleSymbol(sourceFile: ts.SourceFile):ts.Symbol {
  return (<any>sourceFile).symbol;
}

function getCompilerHost(): ts.CompilerHost {
  var defaultLibFileName = ts.getDefaultLibFileName({});
  defaultLibFileName = normalizeSlashes(defaultLibFileName);
  const host:ts.CompilerHost = {
    getSourceFile: (sourceName, languageVersion) => {
      var sourcePath = sourceName;
      if (sourceName === defaultLibFileName) {
        sourcePath = ts.getDefaultLibFilePath({});
      }
      if (!fs.existsSync(sourcePath)) return undefined;
      let contents = fs.readFileSync(sourcePath, 'utf-8');
      return ts.createSourceFile(sourceName, contents, languageVersion, true);
    },
    writeFile(name, text, writeByteOrderMark) { fs.writeFile(name, text); },
    fileExists: (filename) => fs.existsSync(filename),
    readFile: (filename) => fs.readFileSync(filename, 'utf-8'),
    getDefaultLibFileName: () => defaultLibFileName,
    useCaseSensitiveFileNames: () => true,
    getCanonicalFileName: (filename) => filename,
    getCurrentDirectory: () => '',
    getNewLine: () => '\n',
  };
  host.resolveModuleNames = getModuleResolver(host);
  return host;
}

function getModuleResolver(compilerHost: ts.CompilerHost) {
  return (moduleNames:string[], containingFile:string):ts.ResolvedModule[] => {
    let res:ts.ResolvedModule[] = [];
    for (let mod of moduleNames) {
      let lookupRes = ts.nodeModuleNameResolver(mod, containingFile, compilerHost);
      if (lookupRes.resolvedModule) {
        res.push(lookupRes.resolvedModule);
        continue;
      }
      lookupRes = ts.classicNameResolver(mod, containingFile, {}, compilerHost);
      if (lookupRes.resolvedModule) {
        res.push(lookupRes.resolvedModule);
        continue;
      }
      res.push(undefined);
    }
    return res;
  };
}

function normalizeSlashes(path: string) { return path.replace(/\\/g, '/'); }

function flatten<T>(nestedArray: T[][]):T[] {
  return nestedArray.reduce((a, b) => a.concat(b), []);
}