import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, renameSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { emitC } from './ir.js';

export function compilerTargets(cc = process.env.AIR_CC || 'clang') {
  const result = spawnSync(cc, ['--print-targets'], { encoding: 'utf8', timeout: 30000 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || 'Compiler cannot list targets; use a Clang-compatible compiler for this command');
  return result.stdout;
}

export function build(module, { output, target, cc = process.env.AIR_CC || 'clang', entry, executable = false } = {}) {
  if (!output) throw new Error('An output path is required');
  if (executable && !entry) throw new Error('Executable builds require --entry');
  if (!executable && entry) throw new Error('--entry requires --exe');
  const source = emitC(module, { entry });
  const destination = resolve(output);
  mkdirSync(dirname(destination), { recursive: true });
  const directory = mkdtempSync(join(dirname(destination), '.air-'));
  try {
    const artifact = join(directory, 'artifact');
    const args = ['-x', 'c', '-std=c11', '-O2', '-Wall', '-Wextra', '-Werror'];
    if (target) args.push(`--target=${target}`);
    if (!executable) args.push('-ffreestanding', '-c');
    args.push('-o', artifact, '-');
    const result = spawnSync(cc, args, { input: source, encoding: 'utf8', timeout: 30000 });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Compiler failed${target ? ` for ${target}` : ''}:\n${result.stderr}`);
    renameSync(artifact, destination);
    return destination;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}