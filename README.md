# AIR: Agent Intermediate Representation

A working experimental language core for agent-authored programs. One typed tree has
three representations: compact source for token-efficient exchange, positional JSON
for structural edits, and a readable inspection view. It compiles through C11 to
existing native compiler backends. It is not a general-purpose language yet.

## Quick start

Requires Node.js 22+ and Clang. Dependencies are pinned by `package-lock.json`.

```sh
npm ci
npm test
node src/cli.js check examples/math.air
node src/cli.js view examples/math.air
node src/cli.js tokens examples/math.air --baseline examples/math.c
node src/cli.js build examples/math.air -o build/math --exe --entry main
./build/math
echo $?
```

The example intentionally returns **42 as its process exit code**, not printed output.
There is no I/O runtime. A nonzero example exit code is its computed result, not a
compilation failure.

## Three views, one program

Compact source:

```text
air1
square(value:u):u=value*value;
main():u=square(6)+6;
```

Structural JSON:

```json
["air",1,[["square",[["value","u"]],"u",["*","value","value"]],["main",[],"u",["+",["call","square",6],6]]]]
```

Human-readable view:

```text
fn square(value: u32) -> u32 {
  return value * value;
}

fn main() -> u32 {
  return square(6) + 6;
}
```

Compact source and JSON are executable inputs and round-trip through the same tree.
The readable view is generated, inspection-only pseudocode. Edit compact source or
JSON, not the generated view. Types are explicit at function boundaries and inferred
for expressions; the checker rejects implicit conversions and branch type mismatches.

## Agent workflow

```sh
node src/cli.js json examples/math.air
node src/cli.js check examples/math.air --json-errors
node src/cli.js compact examples/math.air
node src/cli.js emit examples/math.air
```

Functions are addressable by name. To replace a function, put its full replacement
tuple, for example `["square",[["value","u"]],"u",["+","value",1]]`, in a JSON file:

```sh
node src/cli.js replace examples/math.air --name square --with replacement.json -o updated.air
```

The replacement must preserve the function name. The entire module, including callers,
is checked before output is written. The original input is not modified. The JavaScript
API `replaceFunction(module, name, replacement)` also returns a separately owned tree.
This reduces edit payload size; it is not an incremental compiler or a proof of intent.

## Language v1

- Module: `["air",1,[function,...]]`; at least one function is required.
- Function: `[name,[[parameter,type],...],returnType,expression]`.
- Types: `u` is unsigned 32-bit integer; `b` is boolean.
- JSON numbers are integer literals in `0..4294967295`; booleans are literals;
  strings are variable references. Strings are not runtime string values.
- Binary expressions: `[operator,left,right]` with `+ - * & | ^ < <= > >= == !=`.
  Arithmetic and bitwise operators take `u`; ordered comparisons take `u` and return
  `b`. Equality supports matching `u` or `b`. `!` takes and returns `b`.
- Arithmetic wraps modulo 2^32 on every supported target. Widened unsigned C
  intermediates avoid signed integer-promotion overflow, even with wider C `int`.
- `['if',condition,then,else]` evaluates only the selected branch. Both branches
  must have the same type. Source: `if condition then value else other`.
- `['let',name,value,body]` is a lexical binding; shadowing is permitted and the
  new binding is not visible in its own initializer. Source: `let value=2 in value+1`.
- `['call',name,...arguments]` calls a function. Forward references and recursion
  are supported. Source: `square(6)`.
- Names match `[A-Za-z][A-Za-z0-9_]*`. `true false let in if then else` are reserved.
- Source starts with `air1`; function definitions end in `;`. `//` comments and
  whitespace are accepted but omitted from canonical compact output.
- Binary operators associate left. Precedence, lowest first: `|`, `^`, `&`,
  `== !=`, `< <= > >=`, `+ -`, `*`, `!`, calls. Parentheses override precedence.
  Bindings and conditionals can be parenthesized as operands.

There are no signed integers, floats, division, shifts, arrays, records, pointers,
mutable state, imports, I/O, concurrency, or external library declarations yet.
Recursion is not checked for termination and can exhaust the native stack. This is
not a sandbox: compile/run only trusted input under appropriate resource limits.

## CPU portability

```sh
node src/cli.js targets
node src/cli.js build examples/math.air --target aarch64-none-elf -o build/arm64.o
node src/cli.js build examples/math.air --target x86_64-unknown-linux-gnu -o build/x64.o
node src/cli.js build examples/math.air --target wasm32-unknown-unknown -o build/math.wasm.o
node src/cli.js emit examples/math.air -o math.c
```

The source has no CPU-specific instructions, pointer-width assumptions, or required
runtime library. The C emitter uses an exact-width unsigned type and compile-time
width checks. Generated functions use `air_fn_` prefixed names and the target C ABI.

**No compiler can honestly promise every CPU.** AIR can target processors supported
by a suitable C11 compiler with an exact 32-bit unsigned type and a 64-bit-or-wider
`unsigned long long`. The `stdint.h` fallback is needed on compilers without
`__UINT32_TYPE__`. Small CPUs may need compiler-provided arithmetic helpers at link
time. All-CPU support, including unusual or legacy architectures, is not verified.

`build` defaults to freestanding object output, not a bootable image or complete
application. `--target` uses Clang-style target triples. `--cc` or `AIR_CC` selects
a compiler executable (not a shell command); a preconfigured GCC cross compiler can
be used without `--target`. For non-Clang/GCC-style drivers, emit C and invoke that
toolchain separately. `targets` requires Clang's `--print-targets` option.

Each CPU/OS/ABI needs a separate build. Linking an executable for another system needs
its linker, startup code, ABI, and runtime/sysroot. Compiler optimizations may emit
helper calls. WebAssembly is a virtual target, not a physical CPU. Native execution
was tested only on this Mac; cross-target tests check compilation and object headers.

To add more architectures, install a compiler with those backends and run, for example:

```sh
AIR_CC=/path/to/full/llvm/bin/clang npm test
```

The cross-target tests include RISC-V, PowerPC, MIPS, SystemZ, and LoongArch; absent
backends are explicitly skipped, never counted as successful CPU support.

## Token measurements

The `tokens` command measures actual BPE tokens using `cl100k_base` and `o200k_base`,
not character counts. It compares compact source, the readable view, and minified
JSON. Optional `--baseline` measures a supplied reference implementation verbatim.
The included C baseline is handwritten, not verbose compiler-generated C, and has
the same example behavior plus a C process-entry wrapper.

JSON is useful for structural editing but is not necessarily token-efficient. Compact
source retains meaningful names and omits repeated syntax. Results depend on program,
formatting, and tokenizer. This is a small fixture comparison, not evidence of
many-fold agent speedups or savings against every language or minified baseline.
Grammar/schema instructions, prompts, diagnostics, retries, and tool calls are not
included. Those costs require a separate agent-task benchmark.

## Validation strategy

This is a CLI/compiler library, with no browser, server, database, or Docker requirement.
`npm test` is the canonical gate, using Node's test runner and the real local compiler.
Tests create and clean temporary directories. There was no pre-existing test suite.

Critical flows: source/JSON round trips; typing and scope rejection; named structural
replacement; native code generation and execution; atomic failed-build behavior;
machine-readable CLI failures; tokenizer measurements; cross-target object formats.
Acceptance requires all applicable tests to pass. Missing compiler backends are
reported as skips. Non-host execution, general agent productivity, large programs,
and arbitrary legacy CPU toolchains remain unverified.