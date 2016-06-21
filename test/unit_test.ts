/// <reference path="../typings/chai/chai.d.ts"/>
import chai = require('chai');
import * as ts from 'typescript';
import {publicApiInternal, SerializationOptions} from '../lib/serializer';

const classesAndInterfaces = `
  export declare class A {
      field: string;
      method(a: string): number;
  }
  export interface B {
      field: A;
  }
  export declare class C {
      someProp: string;
      propWithDefault: number;
      private privateProp;
      protected protectedProp: number;
      constructor(someProp: string, propWithDefault: number, privateProp: any, protectedProp: number);
  }
`;

describe('unit test', () => {
  let _warn = null;
  let warnings: string[] = [];
  beforeEach(() => {
    _warn = console.warn;
    console.warn = (...args: string[]) => warnings.push(args.join(' '));
  });

  afterEach(() => {
    console.warn = _warn;
    warnings = [];
    _warn = null;
  });

  it('should ignore private methods', () => {
    const input = `
      export declare class A {
          fa(): void;
          protected fb(): void;
          private fc();
      }
    `;
    const expected = `
      export declare class A {
          fa(): void;
          protected fb(): void;
      }
    `;
    check({'file.d.ts': input}, expected);
  });

  it('should ignore private props', () => {
    const input = `
      export declare class A {
          fa: any;
          protected fb: any;
          private fc;
      }
    `;
    const expected = `
      export declare class A {
          fa: any;
          protected fb: any;
      }
    `;
    check({'file.d.ts': input}, expected);
  });

  it('should support imports without capturing imports', () => {
    const input = `
      import {A} from './classes_and_interfaces';
      export declare class C {
          field: A;
      }
    `;
    const expected = `
      export declare class C {
          field: A;
      }
    `;
    check({'classes_and_interfaces.d.ts': classesAndInterfaces, 'file.d.ts': input}, expected);
  });

  it('should throw on aliased reexports', () => {
    const input = `
      export { A as Apple } from './classes_and_interfaces';
    `;
    checkThrows(
        {'classes_and_interfaces.d.ts': classesAndInterfaces, 'file.d.ts': input},
        'Symbol "A" was aliased as "Apple". Aliases are not supported.');
  });

  it('should remove reexported external symbols', () => {
    const input = `
      export { Foo } from 'some-external-module-that-cannot-be-resolved';
    `;
    const expected = `
    `;
    check({'classes_and_interfaces.d.ts': classesAndInterfaces, 'file.d.ts': input}, expected);
    chai.assert.deepEqual(warnings, ['Warning: No export declaration found for symbol "Foo"']);
  });

  it('should sort exports', () => {
    const input = `
      export declare type E = string;
      export interface D {
          e: number;
      }
      export declare var e: C;
      export declare class C {
          e: number;
          d: string;
      }
      export declare function b(): boolean;
      export declare const a: string;
    `;
    const expected = `
      export declare const a: string;

      export declare function b(): boolean;

      export declare class C {
          e: number;
          d: string;
      }

      export interface D {
          e: number;
      }

      export declare var e: C;

      export declare type E = string;
    `;
    check({'file.d.ts': input}, expected);
  });

  it('should sort exports including re-exports', () => {
    const submodule = `
      export declare var e: C;
      export declare class C {
          e: number;
          d: string;
      }
    `;
    const input = `
      export * from './submodule';
      export declare type E = string;
      export interface D {
          e: number;
      }
      export declare function b(): boolean;
      export declare const a: string;
    `;
    const expected = `
      export declare const a: string;

      export declare function b(): boolean;

      export declare class C {
          e: number;
          d: string;
      }

      export interface D {
          e: number;
      }

      export declare var e: C;

      export declare type E = string;
    `;
    check({'submodule.d.ts': submodule, 'file.d.ts': input}, expected);
  });

  it('should remove module comments', () => {
    const input = `
      /**
       * An amazing module.
       * @module
       */
      /**
       * Foo function.
       */
      export declare function foo(): boolean;
      export declare const bar: number;
    `;
    const expected = `
      export declare const bar: number;

      export declare function foo(): boolean;
    `;
    check({'file.d.ts': input}, expected);
  });

  it('should remove class and field comments', () => {
    const input = `
      /**
       * Does something really cool.
       */
      export declare class A {
          /**
           * A very useful field.
           */
          name: string;
          /**
           * A very interesting getter.
           */
          b: string;
      }
    `;
    const expected = `
      export declare class A {
          name: string;
          b: string;
      }
    `;
    check({'file.d.ts': input}, expected);
  });

  it('should skip symbols matching specified pattern', () => {
    const input = `
      export const __a__: string;
      export class B {
      }
    `;
    const expected = `
      export class B {
      }
    `;
    check({'file.d.ts': input}, expected, {stripExportPattern: /^__.*/});
  });

  it('should throw on using non-whitelisted module imports in expression position', () => {
    const input = `
      import * as foo from './foo';
      export declare class A extends foo.A {
      }
    `;
    checkThrows(
        {'file.d.ts': input}, 'file.d.ts(2,32): error: Module identifier "foo" is not allowed. ' +
            'Remove it from source or whitelist it via --allowModuleIdentifiers.');
  });

  it('should throw on using non-whitelisted module imports in type position', () => {
    const input = `
      import * as foo from './foo';
      export type A = foo.A;
    `;
    checkThrows(
        {'file.d.ts': input}, 'file.d.ts(2,17): error: Module identifier "foo" is not allowed. ' +
            'Remove it from source or whitelist it via --allowModuleIdentifiers.');
  });

  it('should not throw on using whitelisted module imports', () => {
    const input = `
      import * as foo from './foo';
      export declare class A extends foo.A {
      }
    `;
    const expected = `
      export declare class A extends foo.A {
      }
    `;
    check({'file.d.ts': input}, expected, {allowModuleIdentifiers: ['foo']});
  });

  it('should not throw if non-whitelisted module imports are not written', () => {
    const input = `
      import * as foo from './foo';
      export declare class A {
      }
    `;
    const expected = `
      export declare class A {
      }
    `;
    check({'file.d.ts': input}, expected);
  });
});

function getMockHost(files: {[name: string]: string}): ts.CompilerHost {
  return {
    getSourceFile: (sourceName, languageVersion) => {
      if (!files[sourceName]) return undefined;
      return ts.createSourceFile(
          sourceName, stripExtraIndentation(files[sourceName]), languageVersion, true);
    },
    writeFile: (name, text, writeByteOrderMark) => {},
    fileExists: (filename) => !!files[filename],
    readFile: (filename) => stripExtraIndentation(files[filename]),
    getDefaultLibFileName: () => 'lib.ts',
    useCaseSensitiveFileNames: () => true,
    getCanonicalFileName: (filename) => filename,
    getCurrentDirectory: () => './',
    getNewLine: () => '\n',
  };
}

function check(
    files: {[name: string]: string}, expected: string, options: SerializationOptions = {}) {
  const actual = publicApiInternal(getMockHost(files), 'file.d.ts', {}, options);
  chai.assert.equal(actual.trim(), stripExtraIndentation(expected).trim());
}

function checkThrows(files: {[name: string]: string}, error: string) {
  chai.assert.throws(() => { publicApiInternal(getMockHost(files), 'file.d.ts', {}); }, error);
}

function stripExtraIndentation(text: string) {
  let lines = text.split('\n');
  // Ignore first and last new line
  lines = lines.slice(1, lines.length - 1);
  const commonIndent = lines.reduce((min, line) => {
    const indent = /^( *)/.exec(line)[1].length;
    // Ignore empty line
    return line.length ? Math.min(min, indent) : min;
  }, text.length);

  return lines.map(line => line.substr(commonIndent)).join('\n') + '\n';
}
