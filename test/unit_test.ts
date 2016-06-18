/// <reference path="../typings/chai/chai.d.ts"/>
import chai = require('chai');
import main = require('../lib/main');
import * as ts from 'typescript';

describe('unit test', () => {
  it('should support classes', () => {
    check(
        `
      export class A {
        field:string;

        method(a:string):number {
          return 1;
        }
      }
    `,
        ['A', 'A.field:string', 'A.method(a:string):number']);
  });

  it('should include constructors', () => {
    check(
        `
      export class A {
        constructor(a:string) {}
      }
    `,
        ['A', 'A.constructor(a:string)']);
  });

  it('should support interfaces', () => {
    check(
        `
      export interface A {
        field:string;
        method(a:string):number;
      }
    `,
        ['A', 'A.field:string', 'A.method(a:string):number']);
  });

  it('should support generics', () => {
    check(
        `
      export class A<T> {
        field:T;
        method(a:T):T { return null; }
      }
    `,
        ['A<T>', 'A.field:T', 'A.method(a:T):T']);
  });

  it('should support static members', () => {
    check(
        `
      export class A {
        static field: string;
        static method(a: string): number {}
      }
    `,
        ['A', 'A.field:string', 'A.method(a:string):number']);
  });

  it('should support arrays', () => {
    check(
        `
      export var a: Array<Array<string>>;
      export var b: string[][];
    `,
        ['var a:Array<Array<string>>', 'var b:string[][]']);
  });

  it('should support tuples', () => {
    check(
        `
      export var a: [string, number];
    `,
        ['var a:[string, number]']);
  });

  it('should support map', () => {
    check(
        `
      export var a: Map<Map<string, number>, number>;
    `,
        ['var a:Map<Map<string, number>, number>']);
  });

  it('should support getters and setters', () => {
    check(
        `
      export class A {
        get a(): string {}
        set a(v:string){}
        get b() {}
        set b(v) {}
      }
    `,
        ['A', 'A.a:string', 'A.a=(v:string)', 'A.b:any', 'A.b=(v:any)']);
  });

  it('should support function declarations', () => {
    check(
        `
      export function f(a:string):number {}
    `,
        ['f(a:string):number']);
  });

  it('should support enums', () => {
    check(
        `
      export enum A {
        Red = 1,
        Green
      }
    `,
        ['A', 'A.Red', 'A.Green']);
  });

  it('should support type literals', () => {
    check(
        `
      export function f({x,
        y,  z}: {x?: string, y: number,z:any}):void {}
    `,
        ['f({x,y,z}:{x?:string, y:number, z:any}):void']);
  });

  it('should support index types', () => {
    check(
        `
      export function f(a:{[key: string]:any}):void {}
    `,
        ['f(a:{[key:string]:any}):void']);
  });

  it('should ignore private methods', () => {
    check(
        `
      export class A {
        fa(){}
        protected fb() {}
        private fc() {}
      }
    `,
        ['A', 'A.fa():any', 'A.fb():any']);
  });

  it('should ignore private props', () => {
    check(
        `
      export class A {
        fa;
        protected fb;
        private fc;
      }
    `,
        ['A', 'A.fa:any', 'A.fb:any']);
  });

  it('should ignore members staring with an _', () => {
    check(
        `
      export class A {
        _fa;
        _fb(){}
      }
    `,
        ['A']);
  });

  it('should ignore computed properties', () => {
    check(
        `
      export class A {
        a(){}
        ['b'](){}
      }
    `,
        ['A', 'A.a():any']);
  });

  it('should include public properties defined via constructor', () => {
    check(
        `
      export class A {
        constructor(public prop: number, arg1: number) {}
      }
    `,
        ['A', 'A.constructor(prop:number, arg1:number)', 'A.prop:number']);
  });

  it('should include protected properties defined via constructor', () => {
    check(
        `
      export class A {
        constructor(protected prop: number, arg1: number) {}
      }
    `,
        ['A', 'A.constructor(prop:number, arg1:number)', 'A.prop:number //protected']);
  });

  it('should include default value of public properties defined via constructor', () => {
    check(
        `
      export class A {
        constructor(public prop = 3) {}
      }
    `,
        ['A', 'A.constructor(prop:any=3)', 'A.prop:any=3']);
  });

  it('should ignore private properties defined via constructor', () => {
    check(
        `
    export class A {
      constructor(private prop = 3) {}
    }
  `,
        ['A', 'A.constructor(prop:any=3)']);
  });

  it('should recognize optional parameters of functions, methods and constructors', () => {
    check(
        `
    export class A {
      constructor(arg?: number) {}
      methodA(arg?:number) {}
    }

    export function b(arg?: string) {}
  `,
        ['A', 'A.constructor(arg?:number)', 'A.methodA(arg?:number):any', 'b(arg?:string):any']);
  });
});

function check(contents: string, expected: string[]) {
  var mockHost: any = {
    getSourceFile: (sourceName, languageVersion) => {
      if (sourceName !== 'file.ts') return undefined;
      return ts.createSourceFile(sourceName, contents, languageVersion, true);
    },
    writeFile(name, text, writeByteOrderMark) {},
    fileExists: (filename) => filename === 'file.ts',
    readFile: (filename) => contents,
    getDefaultLibFileName: () => 'lib.ts',
    useCaseSensitiveFileNames: () => true,
    getCanonicalFileName: (filename) => filename,
    getCurrentDirectory: () => './',
    getNewLine: () => '\n',
  };
  const actual = main.publicApiInternal(mockHost, 'file.ts');
  chai.assert.deepEqual(actual, expected);
}