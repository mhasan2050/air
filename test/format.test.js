import test from 'node:test';
import assert from 'node:assert/strict';
import { compact, parse, readable } from '../src/format.js';

test('compact format and JSON decode into the same typed tree', () => {
  const source = 'air1\nadd(a:u,b:u):u=a+b;main():u=add(20,22);';
  const module = parse(source);
  assert.deepEqual(parse(JSON.stringify(module)), module);
  assert.deepEqual(parse(compact(module)), module);
  assert.match(readable(module), /fn add\(a: u32, b: u32\) -> u32/);
});

test('round trips preserve precedence, associativity, bindings and branches', () => {
  const expressions = [
    '(1+2)*3', '1-(2-3)', '(1|2)&3',
    'let value=2 in let value=value+1 in value*3',
    'if true then if false then 1 else 2 else 3',
    '(if true then 1 else 2)+3',
    'let value=if true then 1 else 2 in value',
    'if (1==2)==false then 1 else 2',
    'if !(1>2) then 1 else 2',
    '(let value=2 in value)+3',
    'let value=let other=2 in other in value',
  ];
  for (const expression of expressions) {
    const module = parse(`air1\nmain():u=${expression};`);
    assert.deepEqual(parse(compact(module)), module, expression);
  }
});

test('invalid syntax and types produce errors', () => {
  for (const source of ['air2 main():u=1;', 'air1 main():u=1/0;', 'air1 main():u=true;', 'air1 main():u=1; garbage', 'air1 main():u=4294967296;']) {
    assert.throws(() => parse(source));
  }
  assert.equal(parse('air1 // comment\nmain():u=7;')[2][0][3], 7);
});