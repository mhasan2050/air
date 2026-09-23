import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '../src/format.js';
import { build, compilerTargets } from '../src/build.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const example = join(root, 'examples/math.air');
const cli = (...args) => spawnSync(process.execPath, [join(root, 'src/cli.js'), ...args], { encoding: 'utf8', timeout: 30000 });

test('CLI validates, renders, replaces a function, and builds an executable', () => {
  const directory = mkdtempSync(join(tmpdir(), 'air-cli-'));
  try {
    assert.equal(cli('check', example).status, 0);
    assert.match(cli('view', example).stdout, /fn square\(value: u32\)/);
    assert.deepEqual(JSON.parse(cli('json', example).stdout), parse(readFileSync(example, 'utf8')));
    const replacement = join(directory, 'function.json');
    writeFileSync(replacement, JSON.stringify(['main', [], 'u', 7]));
    const updated = join(directory, 'updated.air');
    const replaced = cli('replace', example, '--name', 'main', '--with', replacement, '-o', updated);
    assert.equal(replaced.status, 0, replaced.stderr);
    assert.equal(parse(readFileSync(updated, 'utf8'))[2].at(-1)[3], 7);
    const executable = join(directory, 'program');
    const compiled = cli('build', updated, '-o', executable, '--exe', '--entry', 'main');
    assert.equal(compiled.status, 0, compiled.stderr);
    assert.equal(spawnSync(executable).status, 7);
    const failure = cli('build', updated, '-o', executable, '--target', 'not-a-real-cpu');
    assert.notEqual(failure.status, 0);
    assert.equal(spawnSync(executable).status, 7, 'Failed builds must preserve existing output');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('CLI reports errors as JSON and protects input files', () => {
  const result = cli('build', example, '--json-errors');
  assert.equal(result.status, 1);
  assert.match(JSON.parse(result.stderr).error, /output path/);
  assert.equal(cli('compact', example, '-o', example).status, 1);
  assert.equal(cli('unknown', example).status, 1);
});

test('token counts show fixture savings in both encodings', () => {
  const result = cli('tokens', example, '--baseline', join(root, 'examples/math.c'));
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  for (const encoding of ['cl100k_base', 'o200k_base']) {
    assert.ok(report[encoding].tokens.compact < report[encoding].tokens.readable);
    assert.ok(report[encoding].compactReductionVsReadablePercent > 0);
    assert.ok(report[encoding].tokens.compact < report[encoding].tokens.baseline);
  }
});

test('cross-compilation emits objects for installed representative backends', async (context) => {
  const targets = compilerTargets();
  const matrix = [
    ['aarch64', 'aarch64-none-elf', 183],
    ['aarch64_be', 'aarch64_be-none-elf', 183],
    ['arm', 'armv7-none-eabi', 40],
    ['armeb', 'armebv7-none-eabi', 40],
    ['x86', 'i386-unknown-linux-gnu', 3],
    ['x86-64', 'x86_64-unknown-linux-gnu', 62],
    ['wasm32', 'wasm32-unknown-unknown', null],
    ['wasm64', 'wasm64-unknown-unknown', null],
    ['riscv32', 'riscv32-unknown-elf', 243],
    ['riscv64', 'riscv64-unknown-elf', 243],
    ['ppc32', 'powerpc-unknown-linux-gnu', 20],
    ['ppc64', 'powerpc64-unknown-linux-gnu', 21],
    ['mips', 'mips-unknown-linux-gnu', 8],
    ['systemz', 's390x-unknown-linux-gnu', 22],
    ['loongarch64', 'loongarch64-unknown-linux-gnu', 258],
  ];
  const module = parse(readFileSync(example, 'utf8'));
  for (const [backend, triple, machine] of matrix) {
    await context.test(triple, { skip: !new RegExp(`^\\s*${backend}\\s+-`, 'm').test(targets) }, () => {
      const directory = mkdtempSync(join(tmpdir(), 'air-target-'));
      try {
        const output = join(directory, 'module.o');
        build(module, { output, target: triple });
        const bytes = readFileSync(output);
        if (machine === null) {
          assert.deepEqual([...bytes.subarray(0, 8)], [0, 97, 115, 109, 1, 0, 0, 0]);
        } else {
          assert.equal(bytes.subarray(0, 4).toString('hex'), '7f454c46');
          assert.equal(bytes[5] === 1 ? bytes.readUInt16LE(18) : bytes.readUInt16BE(18), machine);
        }
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    });
  }
});