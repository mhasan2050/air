import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { parse, compact, readable } from './format.js';
import { emitC, replaceFunction } from './ir.js';
import { build, compilerTargets } from './build.js';

const help = `AIR: compact typed agent representation

node src/cli.js check   <file.air|file.json>
node src/cli.js view    <file> [-o view.txt]
node src/cli.js compact <file> [-o compact.air]
node src/cli.js json    <file> [-o module.json]
node src/cli.js emit    <file> [-o module.c] [--entry main]
node src/cli.js build   <file> -o module.o [--target triple] [--cc clang]
node src/cli.js build   <file> -o program --exe --entry main
node src/cli.js replace <file> --name function --with function.json [-o updated.air]
node src/cli.js tokens  <file> [--baseline equivalent.c]
node src/cli.js targets [--cc clang]

Use --json-errors for machine-readable diagnostics. The readable view is inspection-only.
Build defaults to an object file; cross-target linking needs a matching runtime/toolchain.
`;

try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      output: { type: 'string', short: 'o' }, target: { type: 'string' }, cc: { type: 'string' },
      entry: { type: 'string' }, exe: { type: 'boolean' }, name: { type: 'string' },
      with: { type: 'string' }, baseline: { type: 'string' },
      help: { type: 'boolean', short: 'h' }, 'json-errors': { type: 'boolean' },
    },
  });
  const [command, file, ...extra] = positionals;
  if (values.help || !command) {
    process.stdout.write(help);
  } else if (command === 'targets') {
    if (file) throw new Error('targets does not take a source file');
    process.stdout.write(compilerTargets(values.cc));
  } else {
    if (!['check', 'view', 'compact', 'json', 'emit', 'build', 'replace', 'tokens'].includes(command)) {
      throw new Error(`Unknown command: ${command}`);
    }
    if (!file || extra.length) throw new Error('Expected exactly one source file');
    if (values.output && resolve(values.output) === resolve(file)) throw new Error('Output must not overwrite the source file');
    const module = parse(readFileSync(file, 'utf8'));
    let text;
    switch (command) {
      case 'check': text = `OK: ${module[2].length} typed functions\n`; break;
      case 'view': text = readable(module); break;
      case 'compact': text = compact(module); break;
      case 'json': text = `${JSON.stringify(module)}\n`; break;
      case 'emit': text = emitC(module, { entry: values.entry }); break;
      case 'build':
        text = `${build(module, { output: values.output, target: values.target, cc: values.cc, entry: values.entry, executable: values.exe })}\n`;
        break;
      case 'replace': {
        if (!values.name || !values.with) throw new Error('replace requires --name and --with');
        const replacement = JSON.parse(readFileSync(values.with, 'utf8'));
        text = compact(replaceFunction(module, values.name, replacement));
        break;
      }
      case 'tokens': {
        const { tokenReport } = await import('./metrics.js');
        const baseline = values.baseline ? readFileSync(values.baseline, 'utf8') : undefined;
        text = `${JSON.stringify(tokenReport(module, baseline), null, 2)}\n`;
        break;
      }
    }
    if (values.output && command !== 'build') writeFileSync(values.output, text);
    else process.stdout.write(text);
  }
} catch (error) {
  if (process.argv.includes('--json-errors')) {
    process.stderr.write(`${JSON.stringify({ error: error.message, location: error.location?.start })}\n`);
  } else {
    process.stderr.write(`air: ${error.message}\n`);
  }
  process.exitCode = 1;
}