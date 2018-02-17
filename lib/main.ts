import {createPatch} from 'diff';
import * as fs from 'fs';
import * as path from 'path';

import {publicApi, SerializationOptions} from './serializer';

export {publicApi, SerializationOptions} from './serializer';

export function generateGoldenFile(
    entrypoint: string, outFile: string, options: SerializationOptions = {}): void {
  const output = publicApi(entrypoint, options);
  ensureDirectory(path.dirname(outFile));
  fs.writeFileSync(outFile, output);
}

export function verifyAgainstGoldenFile(
    entrypoint: string, goldenFile: string, options: SerializationOptions = {}): string {
  const actual = publicApi(entrypoint, options);
  const expected = fs.readFileSync(goldenFile).toString();

  if (actual === expected) {
    return '';
  } else {
    const patch = createPatch(goldenFile, expected, actual, 'Golden file', 'Generated API');

    // Remove the header of the patch
    const start = patch.indexOf('\n', patch.indexOf('\n') + 1) + 1;

    return patch.substring(start);
  }
}

function ensureDirectory(dir: string) {
  if (!fs.existsSync(dir)) {
    ensureDirectory(path.dirname(dir));
    fs.mkdirSync(dir);
  }
}
