export class A {
  field: string;

  method(a: string): number { return 1; }
}

export interface B { field: A; }


export class C {
  constructor(public someProp: string, public propWithDefault = 3, private privateProp, protected protectedProp: number) {}
}