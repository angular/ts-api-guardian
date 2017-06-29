/// <reference path="../typings/chai/chai.d.ts"/>
import chai = require('chai');
import * as child_process from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as eol from 'eol';
import {assertFileEqual, unlinkRecursively} from './helpers';

const BINARY = path.resolve(__dirname, os.platform() === 'win32' ? '../../bin/ts-api-guardian.cmd' : '../../bin/ts-api-guardian');

describe('cli: e2e test', () => {
  const outDir = path.resolve(__dirname, '../../build/tmp');

  beforeEach(() => {
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir);
    }
  });

  afterEach(() => { unlinkRecursively(outDir); });

  it('should print usage without any argument', () => {
    const {stderr} = execute([]);
    chai.assert.match(stderr, /Usage/);
  });

  it('should show help message with --help', () => {
    const {stdout} = execute(['--help']);
    chai.assert.match(stdout, /Usage/);
  });

  it('should generate golden file with --out', () => {
    const simpleFile = path.join(outDir, 'simple.d.ts');
    const {status} = execute(['--out', simpleFile, 'test/fixtures/simple.d.ts']);
    chai.assert.equal(status, 0);
    assertFileEqual(simpleFile, 'test/fixtures/simple_expected.d.ts');
  });

  it('should verify golden file with --verify and exit cleanly on no difference', () => {
    const {stdout, status} =
        execute(['--verify', 'test/fixtures/simple_expected.d.ts', 'test/fixtures/simple.d.ts']);
    chai.assert.equal(stdout, '');
    chai.assert.equal(status, 0);
  });

  it('should verify golden file with --verify and exit with error on difference', () => {
    const {stdout, status} = execute(
        ['--verify', 'test/fixtures/verify_expected.d.ts', 'test/fixtures/verify_entrypoint.d.ts']);
    chai.assert.equal(eol.auto(stdout), eol.auto(fs.readFileSync('test/fixtures/verify.patch').toString()));
    chai.assert.equal(status, 1);
  });

  it('should generate multiple golden files with --outDir and --rootDir', () => {
    const {status} = execute([
      '--outDir', outDir, '--rootDir', 'test/fixtures', 'test/fixtures/simple.d.ts',
      'test/fixtures/sorting.d.ts'
    ]);
    chai.assert.equal(status, 0);
    assertFileEqual(path.join(outDir, 'simple.d.ts'), 'test/fixtures/simple_expected.d.ts');
    assertFileEqual(path.join(outDir, 'sorting.d.ts'), 'test/fixtures/sorting_expected.d.ts');
  });

  it('should verify multiple golden files with --verifyDir and --rootDir', () => {
    copyFile('test/fixtures/simple_expected.d.ts', path.join(outDir, 'simple.d.ts'));
    copyFile('test/fixtures/sorting_expected.d.ts', path.join(outDir, 'sorting.d.ts'));
    const {stdout, status} = execute([
      '--verifyDir', outDir, '--rootDir', 'test/fixtures', 'test/fixtures/simple.d.ts',
      'test/fixtures/sorting.d.ts'
    ]);
    chai.assert.equal(stdout, '');
    chai.assert.equal(status, 0);
  });

  it('should generate respecting --stripExportPattern', () => {
    const {stdout, status} = execute([
      '--out', path.join(outDir, 'underscored.d.ts'), '--stripExportPattern', '^__.*',
      'test/fixtures/underscored.d.ts'
    ]);
    chai.assert.equal(status, 0);
    assertFileEqual(
        path.join(outDir, 'underscored.d.ts'), 'test/fixtures/underscored_expected.d.ts');
  });

  it('should not throw for aliased stripped exports', () => {
    const {stdout, status} = execute([
      '--out', path.join(outDir, 'stripped_alias.d.ts'), '--stripExportPattern', '^__.*',
      'test/fixtures/stripped_alias.d.ts'
    ]);
    chai.assert.equal(status, 0);
    assertFileEqual(
        path.join(outDir, 'stripped_alias.d.ts'), 'test/fixtures/stripped_alias_expected.d.ts');
  });

  it('should verify respecting --stripExportPattern', () => {
    const {stdout, status} = execute([
      '--verify', 'test/fixtures/underscored_expected.d.ts', 'test/fixtures/underscored.d.ts',
      '--stripExportPattern', '^__.*'
    ]);
    chai.assert.equal(stdout, '');
    chai.assert.equal(status, 0);
  });

  it('should respect --allowModuleIdentifiers', () => {
    const {stdout, status} = execute([
      '--verify', 'test/fixtures/module_identifier_expected.d.ts', '--allowModuleIdentifiers',
      'foo', 'test/fixtures/module_identifier.d.ts'
    ]);
    chai.assert.equal(stdout, '');
    chai.assert.equal(status, 0);
  });

  it('should respect --onStabilityMissing', () => {
    const {stdout, stderr, status} = execute([
      '--verify', 'test/fixtures/simple_expected.d.ts', '--onStabilityMissing', 'warn',
      'test/fixtures/simple.d.ts'
    ]);
    chai.assert.equal(stdout, '');
    chai.assert.equal(
        stderr,
        'test/fixtures/simple.d.ts(1,1): error: No stability annotation found for symbol "A"\n' +
            'test/fixtures/simple.d.ts(2,1): error: No stability annotation found for symbol "B"\n');
    chai.assert.equal(status, 0);
  });
});

function copyFile(sourceFile: string, targetFile: string) {
  fs.writeFileSync(targetFile, fs.readFileSync(sourceFile));
}

function execute(args: string[]): {stdout: string, stderr: string, status: number} {
  const options = os.platform() === 'win32' ? { shell: true, stdio: 'pipe', cwd: path.resolve(__dirname, '../../') } : undefined;
  const output = child_process.spawnSync(BINARY, args, options);

  chai.assert(!output.error, 'Child process failed or timed out');
  chai.assert(!output.signal, `Child process killed by signal ${output.signal}`);

  return {
    stdout: output.stdout.toString(),
    stderr: output.stderr.toString(),
    status: output.status
  };
}
