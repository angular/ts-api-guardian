export class A {
  field:string;

  method(a:string):number {
    return 1;
  }
}

export interface B {
  field:A;
}