/// <reference path="../typings/chai/chai.d.ts"/>
import chai = require('chai');
import * as fs from 'fs';
import * as path from 'path';

export function removeEol(text: string) {
  if (!text) return text;
  return text.replace(/\r/g, '').replace(/\n/g, '');
}

export function unlinkRecursively(file: string) {
  if (fs.statSync(file).isDirectory()) {
    for (const f of fs.readdirSync(file)) {
      unlinkRecursively(path.join(file, f));
    }
    fs.rmdirSync(file);
  } else {
    fs.unlinkSync(file);
  }
}

export function assertFileEqual(actualFile: string, expectedFile: string) {
  chai.assert.equal(
      removeEol(fs.readFileSync(actualFile).toString()), removeEol(fs.readFileSync(expectedFile).toString()));
}
