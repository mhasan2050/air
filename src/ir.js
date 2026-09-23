const types = new Set(['u', 'b']);
const numeric = new Set(['+', '-', '*', '&', '|', '^']);
const comparisons = new Set(['<', '<=', '>', '>=']);
const equality = new Set(['==', '!=']);

function requireThat(condition, message) {
  if (!condition) throw new Error(message);
}

function identifier(name) {
  requireThat(typeof name === 'string' && /^[A-Za-z][A-Za-z0-9_]*$/.test(name), `Invalid name: ${name}`);
  requireThat(!['true', 'false', 'let', 'in', 'if', 'then', 'else'].includes(name), `Reserved name: ${name}`);
}

export function validate(module) {
  requireThat(Array.isArray(module) && module.length === 3 && module[0] === 'air' && module[1] === 1,
    'Expected ["air",1,[functions]]');
  const functions = module[2];
  requireThat(Array.isArray(functions) && functions.length > 0, 'Expected at least one function');
  const signatures = new Map();
  const expressionTypes = new WeakMap();
  for (const fn of functions) {
    requireThat(Array.isArray(fn) && fn.length === 4, 'Function must be [name,parameters,type,body]');
    const [name, parameters, result] = fn;
    identifier(name);
    requireThat(!signatures.has(name), `Duplicate function: ${name}`);
    requireThat(types.has(result), `Unknown return type in ${name}: ${result}`);
    requireThat(Array.isArray(parameters), `Invalid parameters in ${name}`);
    const names = new Set();
    for (const parameter of parameters) {
      requireThat(Array.isArray(parameter) && parameter.length === 2, `Invalid parameter in ${name}`);
      identifier(parameter[0]);
      requireThat(types.has(parameter[1]), `Unknown parameter type: ${parameter[1]}`);
      requireThat(!names.has(parameter[0]), `Duplicate parameter: ${parameter[0]}`);
      names.add(parameter[0]);
    }
    signatures.set(name, fn);
  }

  function infer(expression, scope, location) {
    if (typeof expression === 'number') {
      requireThat(Number.isInteger(expression) && expression >= 0 && expression <= 4294967295,
        `${location}: literal must be a u32`);
      return 'u';
    }
    if (typeof expression === 'boolean') return 'b';
    if (typeof expression === 'string') {
      requireThat(scope.has(expression), `${location}: unknown variable ${expression}`);
      return scope.get(expression);
    }
    requireThat(Array.isArray(expression) && expression.length > 0, `${location}: invalid expression`);
    const [op, ...args] = expression;
    const arity = (count) => requireThat(args.length === count, `${location}: ${op} needs ${count} operands`);
    const expect = (value, type) => requireThat(infer(value, scope, location) === type,
      `${location}: ${op} expects ${type}`);
    let result;
    if (numeric.has(op) || comparisons.has(op) || equality.has(op)) {
      arity(2);
      const left = infer(args[0], scope, location);
      const right = infer(args[1], scope, location);
      requireThat(left === right && (equality.has(op) || left === 'u'), `${location}: incompatible operands for ${op}`);
      result = numeric.has(op) ? 'u' : 'b';
    } else if (op === '!') {
      arity(1);
      expect(args[0], 'b');
      result = 'b';
    } else if (op === 'if') {
      arity(3);
      expect(args[0], 'b');
      result = infer(args[1], scope, location);
      requireThat(infer(args[2], scope, location) === result, `${location}: if branches must have the same type`);
    } else if (op === 'let') {
      arity(3);
      identifier(args[0]);
      const valueType = infer(args[1], scope, location);
      const inner = new Map(scope);
      inner.set(args[0], valueType);
      result = infer(args[2], inner, location);
    } else if (op === 'call') {
      requireThat(args.length >= 1 && signatures.has(args[0]), `${location}: unknown function ${args[0]}`);
      const [, parameters, returnType] = signatures.get(args[0]);
      requireThat(args.length - 1 === parameters.length, `${location}: wrong argument count for ${args[0]}`);
      parameters.forEach((parameter, index) => expect(args[index + 1], parameter[1]));
      result = returnType;
    } else {
      throw new Error(`${location}: unknown operator ${op}`);
    }
    expressionTypes.set(expression, result);
    return result;
  }

  for (const [name, parameters, result, body] of functions) {
    requireThat(infer(body, new Map(parameters), name) === result, `${name}: return type mismatch`);
  }
  return { signatures, expressionTypes };
}

const cType = (type) => type === 'u' ? 'air_u32' : '_Bool';

export function emitC(module, { entry } = {}) {
  const { signatures, expressionTypes } = validate(module);
  const lines = [
    '#if defined(__UINT32_TYPE__)',
    'typedef __UINT32_TYPE__ air_u32;',
    '#else',
    '#include <stdint.h>',
    'typedef uint32_t air_u32;',
    '#endif',
    '_Static_assert((air_u32)4294967295ULL == 4294967295ULL && (air_u32)4294967296ULL == 0, "u32 requires 32 bits");',
    '',
  ];
  const signature = ([name, parameters, result]) =>
    `${cType(result)} air_fn_${name}(${parameters.map((parameter, index) => `${cType(parameter[1])} air_arg_${index}`).join(', ') || 'void'})`;
  for (const fn of module[2]) lines.push(`${signature(fn)};`);

  for (const fn of module[2]) {
    const [, parameters, , body] = fn;
    let counter = 0;
    const scope = new Map(parameters.map((parameter, index) => [parameter[0], `air_arg_${index}`]));
    lines.push('', `${signature(fn)} {`);
    for (const value of scope.values()) lines.push(`  (void)${value};`);
    function lower(expression, environment, indent) {
      if (typeof expression === 'number') return `((air_u32)${expression}ULL)`;
      if (typeof expression === 'boolean') return expression ? '1' : '0';
      if (typeof expression === 'string') return environment.get(expression);
      const [op, ...args] = expression;
      const next = () => `air_tmp_${counter++}`;
      const put = (text) => lines.push(`${indent}${text}`);
      if (op === 'let') {
        const value = lower(args[1], environment, indent);
        const inner = new Map(environment);
        inner.set(args[0], value);
        return lower(args[2], inner, indent);
      }
      if (op === 'if') {
        const condition = lower(args[0], environment, indent);
        const temporary = next();
        put(`${cType(expressionTypes.get(expression))} ${temporary};`);
        put(`if (${condition}) {`);
        const consequent = lower(args[1], environment, `${indent}  `);
        lines.push(`${indent}  ${temporary} = ${consequent};`);
        put('} else {');
        const alternate = lower(args[2], environment, `${indent}  `);
        lines.push(`${indent}  ${temporary} = ${alternate};`);
        put('}');
        put(`(void)${temporary};`);
        return temporary;
      }
      const temporary = next();
      let value;
      if (op === 'call') {
        const argumentsList = args.slice(1).map((argument) => lower(argument, environment, indent));
        value = `air_fn_${args[0]}(${argumentsList.join(', ')})`;
      } else if (op === '!') {
        value = `!${lower(args[0], environment, indent)}`;
      } else {
        const left = lower(args[0], environment, indent);
        const right = lower(args[1], environment, indent);
        value = numeric.has(op)
          ? `(air_u32)((unsigned long long)${left} ${op} (unsigned long long)${right})`
          : `${left} ${op} ${right}`;
      }
      put(`${cType(expressionTypes.get(expression))} ${temporary} = ${value};`);
      put(`(void)${temporary};`);
      return temporary;
    }
    const result = lower(body, scope, '  ');
    lines.push(`  return ${result};`, '}');
  }
  if (entry !== undefined) {
    const fn = signatures.get(entry);
    requireThat(fn && fn[1].length === 0 && fn[2] === 'u', 'Entry must be a zero-argument u32 function');
    lines.push('', `int main(void) { return (int)(air_fn_${entry}() & 255ULL); }`);
  }
  return `${lines.join('\n')}\n`;
}

export function replaceFunction(module, name, replacement) {
  validate(module);
  requireThat(module[2].some((fn) => fn[0] === name), `Unknown function: ${name}`);
  requireThat(Array.isArray(replacement) && replacement[0] === name, 'Replacement must preserve the function name');
  const updated = structuredClone(['air', 1, module[2].map((fn) => fn[0] === name ? replacement : fn)]);
  validate(updated);
  return updated;
}