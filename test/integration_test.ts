/// <reference path="../typings/chai/chai.d.ts"/>
import chai = require('chai');
import main = require('../lib/main');

describe('integration test', () => {
  it("should handle empty files",
     () => { chai.assert.deepEqual(main.publicApi("test/fixtures/empty.ts"), []); });

  it("should include symbols", () => {
    chai.assert.deepEqual(
        main.publicApi("test/fixtures/simple.ts"), ["const A:string", "var B:any"]);
  });

  it("should include symbols reexported explicitly", () => {
    chai.assert.deepEqual(
        main.publicApi("test/fixtures/reexported.ts"), ["const A:string", "var B:any"]);
  });

  it("should include symbols reexported with *", () => {
    chai.assert.deepEqual(
        main.publicApi("test/fixtures/reexported_star.ts"), ["const A:string", "var B:any"]);
  });

  it("should include members of classes and interfaces", () => {
    chai.assert.deepEqual(
        main.publicApi("test/fixtures/classes_and_interfaces.ts"),
        ["A", "A.field:string", "A.method(a:string):number", "B", "B.field:A", "C",
         "C.constructor(someProp:string, propWithDefault:any=3, privateProp:any, protectedProp:number)",
         "C.someProp:string",
         "C.propWithDefault:any=3",
         "C.protectedProp:number //protected"
         ]);
  });

  it("should include members reexported classes", () => {
    chai.assert.deepEqual(
        main.publicApi("test/fixtures/reexported_classes.ts"),
        ["A", "A.field:string", "A.method(a:string):number"]);
  });

  it("should support imports with prefixes", () => {
    chai.assert.deepEqual(
        main.publicApi("test/fixtures/imported_with_prefix.ts"), ["C", "C.field:A"]);
  });
});