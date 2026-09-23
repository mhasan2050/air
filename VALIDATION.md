# Prototype validation

Environment: macOS ARM64, Node.js 25.2.1, npm 11.6.2, Apple Clang 21.0.0.
No service, browser, Docker, authentication, or persistence tier applies to this CLI.

## Results

| Check | Result |
| --- | --- |
| `npm test` | Exit 0; 20 passed, 0 failed, 7 skipped |
| CLI startup and source validation | Passed through command-level tests |
| AIR example build and execution | Compiled successfully; process result 42 |
| Handwritten C reference execution | Compiled successfully; process result 42 |
| Editor source/test diagnostics | No errors |
| Native arithmetic | Exact-width wrapping, boolean operations, recursion, lazy branches, and lexical scope passed |
| Structural edits | Successful replacement checked; incompatible signatures rejected |
| Failed compiler invocation | Existing build artifact preserved |

## Token counts

Command: `node src/cli.js tokens examples/math.air --baseline examples/math.c`.

| Encoding | Compact AIR | Readable AIR | Minified JSON | Handwritten C | Reduction vs C |
| --- | ---: | ---: | ---: | ---: | ---: |
| cl100k_base | 74 | 102 | 129 | 126 | 41.27% |
| o200k_base | 70 | 102 | 130 | 126 | 44.44% |

Reduction against the readable view is 27.45% and 31.37%, respectively. These are
fixture-specific source token measurements, not general development performance
results. Prompt/schema overhead and correction cycles are not measured. JSON alone
did not save tokens in this fixture; the compact text representation did.

## Cross-target compilation

Successfully compiled freestanding objects and inspected their target headers:

- `aarch64-none-elf`
- `aarch64_be-none-elf`
- `armv7-none-eabi`
- `armebv7-none-eabi`
- `i386-unknown-linux-gnu`
- `x86_64-unknown-linux-gnu`
- `wasm32-unknown-unknown`
- `wasm64-unknown-unknown`

Skipped because the local compiler does not register the required backends:
RISC-V 32/64, PowerPC 32/64, MIPS, SystemZ, and LoongArch64. The test suite will
attempt these when run with a Clang installation exposing those backends.

Only the host ARM64 macOS executable was run. Cross-target linking, hardware
execution, ABI integration, unusual integer-width machines, and all-CPU coverage
remain unverified. No claim of universal CPU support or a many-fold speedup is made.

## Verdict

Startup: PASS. Native integration and CLI end-to-end flows: PASS (test exit code 0).
Cross-target compilation: PARTIAL (eight tested targets; seven absent backends).
Overall: PASS for the documented prototype scope, not for universal CPU support.