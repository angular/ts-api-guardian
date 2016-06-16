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
