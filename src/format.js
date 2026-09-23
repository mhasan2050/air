import { readFileSync } from 'node:fs';
import peggy from 'peggy';
import { validate } from './ir.js';

let parser;
const precedence = { '|': 1, '^': 2, '&': 3, '==': 4, '!=': 4, '<': 5, '<=': 5, '>': 5, '>=': 5, '+': 6, '-': 6, '*': 7, '!': 8, call: 9 };
const typeNames = { u: 'u32', b: 'bool' };

export function parse(source) {
  let module;
  if (source.trimStart().startsWith('[')) {
    module = JSON.parse(source);
  } else {
    parser ??= peggy.generate(readFileSync(new URL('./air.peggy', import.meta.url), 'utf8'));
    module = parser.parse(source);
  }
  validate(module);
  return module;
}

function expressionText(expression, readable, parent = 0) {
  if (!Array.isArray(expression)) return String(expression);
  const [op, ...args] = expression;
  const render = (value, level = 0) => expressionText(value, readable, level);
  const space = readable ? ' ' : '';
  const level = precedence[op] ?? 0;
  let text;
  if (op === 'call') {
    text = `${args[0]}(${args.slice(1).map((argument) => render(argument)).join(`,${space}`)})`;
  } else if (op === 'let') {
    text = `let ${args[0]}${space}=${space}${render(args[1])} in ${render(args[2])}`;
  } else if (op === 'if') {
    text = `if ${render(args[0])} then ${render(args[1])} else ${render(args[2])}`;
  } else if (op === '!') {
    text = `!${render(args[0], level)}`;
  } else {
    text = `${render(args[0], level)}${space}${op}${space}${render(args[1], level + 1)}`;
  }
  return level < parent ? `(${text})` : text;
}

export function compact(module) {
  validate(module);
  return `air1\n${module[2].map(([name, parameters, result, body]) =>
    `${name}(${parameters.map((parameter) => parameter.join(':')).join(',')}):${result}=${expressionText(body, false)};`
  ).join('\n')}\n`;
}

export function readable(module) {
  validate(module);
  return `${module[2].map(([name, parameters, result, body]) =>
    `fn ${name}(${parameters.map(([parameter, type]) => `${parameter}: ${typeNames[type]}`).join(', ')}) -> ${typeNames[result]} {\n  return ${expressionText(body, true)};\n}`
  ).join('\n\n')}\n`;
}