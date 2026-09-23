import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { emitC, replaceFunction, validate } from '../src/ir.js';

const moduleWith = (body, result = 'u') => ['air', 1, [['main', [], result, body]]];

test('checks function boundaries, branches, and lexical scope', () => {
  validate(moduleWith(['let', 'value', 40, ['+', 'value', 2]]));
  validate(moduleWith(['if', true, 1, 2]));
  assert.throws(() => validate(moduleWith(['+', true, 2])), /incompatible operands/);
  assert.throws(() => validate(moduleWith(['if', true, 1, false])), /branches/);
  assert.throws(() => validate(moduleWith('missing')), /unknown variable/);
  assert.throws(() => validate(moduleWith(4294967296)), /literal/);
  assert.throws(() => validate(moduleWith(-1)), /literal/);
  assert.throws(() => validate(moduleWith(['call', 'missing'])), /unknown function/);
  assert.throws(() => validate(moduleWith(true)), /return type/);
});

test('replacement validates callers without mutating the original', () => {
  const original = ['air', 1, [['answer', [], 'u', 42], ['main', [], 'u', ['call', 'answer']]]];
  const updated = replaceFunction(original, 'answer', ['answer', [], 'u', 7]);
  assert.equal(original[2][0][3], 42);
  assert.equal(updated[2][0][3], 7);
  assert.throws(() => replaceFunction(original, 'answer', ['answer', [], 'b', true]), /return type/);
});

test('rejects malformed signatures and invalid operations', () => {
  const badModules = [
    ['air', 2, []], ['air', 1, []],
    ['air', 1, [['bad-name', [], 'u', 0]]],
    ['air', 1, [['main', [], 'u', 0], ['main', [], 'u', 1]]],
    ['air', 1, [['main', [['value', 'u'], ['value', 'b']], 'u', 0]]],
    ['air', 1, [['main', [['value', 'unknown']], 'u', 0]]],
    moduleWith(['call', 'main', 1]), moduleWith(['+', 1]),
    moduleWith(['let', 'value', 'value', 1]), moduleWith(['/', 1, 0]),
    moduleWith(['<', true, false], 'b'), moduleWith(['!', 1], 'b'),
    moduleWith(['if', 1, 2, 3]), moduleWith(['let', 'if', 1, 2]),
  ];
  for (const module of badModules) assert.throws(() => validate(module));
});

test('native arithmetic and booleans match exact-width reference results', () => {
  const cases = [
    [['+', 4294967295, 1], 0],
    [['-', 0, 1], 4294967295],
    [['*', 4294967295, 4294967295], 1],
    [['&', 4294967295, 255], 255],
    [['|', 256, 255], 511],
    [['^', 511, 255], 256],
    [['<', 0, 4294967295], true],
    [['<=', 1, 1], true],
    [['>', 0, 1], false],
    [['>=', 4294967295, 4294967295], true],
    [['==', true, false], false],
    [['!=', 1, 2], true],
    [['!', false], true],
    [['let', 'value', ['if', true, 1, 2], 3], 3],
  ];
  const module = ['air', 1, cases.map(([expression, expected], index) =>
    [`case_${index}`, [], typeof expected === 'boolean' ? 'b' : 'u', expression])];
  const harness = `\nint main(void) {\n${cases.map(([, expected], index) =>
    `  if (air_fn_case_${index}() != ${Number(expected)}ULL) return ${index + 1};`).join('\n')}\n  return 0;\n}\n`;
  const directory = mkdtempSync(join(tmpdir(), 'air-values-'));
  try {
    const executable = join(directory, 'program');
    const compiled = spawnSync(process.env.AIR_CC || 'clang', ['-x', 'c', '-std=c11', '-O2', '-Wall', '-Wextra', '-Werror', '-o', executable, '-'],
      { input: emitC(module) + harness, encoding: 'utf8' });
    assert.equal(compiled.status, 0, compiled.error?.message || compiled.stderr);
    const result = spawnSync(executable);
    assert.equal(result.status, 0, `Failed case ${result.status}: ${result.error?.message || ''}`);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('generated C executes calls, lazy branches, shadowing, and u32 wraparound', () => {
  const module = ['air', 1, [
    ['factorial', [['value', 'u']], 'u', ['if', ['==', 'value', 0], 1, ['*', 'value', ['call', 'factorial', ['-', 'value', 1]]]]],
    ['main', [], 'u', ['let', 'value', 4294967295, ['let', 'value', ['+', 'value', 1], ['if', ['==', 'value', 0], ['call', 'factorial', 5], 3]]]],
  ]];
  const directory = mkdtempSync(join(tmpdir(), 'air-test-'));
  try {
    const executable = join(directory, 'program');
    const compiled = spawnSync(process.env.AIR_CC || 'clang', ['-x', 'c', '-std=c11', '-Wall', '-Wextra', '-Werror', '-o', executable, '-'],
      { input: emitC(module, { entry: 'main' }), encoding: 'utf8' });
    assert.equal(compiled.status, 0, compiled.error?.message || compiled.stderr);
    const result = spawnSync(executable);
    assert.equal(result.status, 120, result.error?.message);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});