# TRIOS / 3

An educational balanced-ternary CPU and operating-system simulator with an assembler, guest supervisor and browser debugger. It explores how arithmetic, instruction execution and process scheduling fit together. The virtual CPU uses trits −1, 0 and +1; the physical computer remains binary.

**Application-development focus:** modular domain logic, explicit machine state, event-driven UI updates, bounded execution and automated behavior tests. Node.js 20+; no external npm dependencies.

## What it implements

- Six-trit words (−364 to +364), ternary carry arithmetic and overflow.
- A small instruction set and label-based assembler.
- A resident assembled guest supervisor with system-call entry and return.
- Per-process user memory, privileged-instruction checks and a bounded round-robin scheduler.
- A step debugger, CPU/register/memory views and an assembly editor.
- A command shell and program storage in the browser.
- A loopback-only Node server with a fixed public-file allowlist.

## Architecture

| Component | Responsibility |
| --- | --- |
| [Ternary arithmetic](src/ternary.mjs) | Word conversion, carry, signed multiplication and overflow |
| [Instruction set](src/isa.mjs) and [assembler](src/assembler.mjs) | Encode programs, resolve labels and reject invalid input |
| [CPU](src/cpu.mjs) and [guest kernel](src/kernel.mjs) | Execute instructions, check privilege and enter/return from system calls |
| [System](src/system.mjs) | Own process state, memory instances, scheduling and execution budgets |
| [Shell](src/shell.mjs) | Translate commands and manage saved programs |
| [Browser app](app.mjs) | Connect machine events to editor, debugger and monitor views |
| [Local server](server.mjs) | Serve the fixed application assets over loopback |

Three implementation choices matter here:

1. **Keep machine logic separate from presentation.** Arithmetic, assembly and CPU behavior can be tested without a browser.
2. **Make state transitions observable.** Single-step execution and process events expose register, memory, output and fault changes to the UI.
3. **Bound execution and retained state.** Instruction/process limits stop runaway guest programs; recent process history is bounded while active processes are retained.

## Run and test

Clone the repository and enter its directory. No package installation is required:

```sh
git clone https://github.com/BlerjonAsllani/trios.git
cd trios
npm start
# Open http://127.0.0.1:4313
```

Try `run hello`, `run fibonacci`, `calc -7 * 8` or `trit -8` in the console. On macOS, `Start.command` also starts the server and opens the browser. Stop the server with Control+C.

```asm
LI a, 8
ADD a, #5
SYS 1
SYS 0
```

## Tests

```sh
npm test
```

The 23 existing tests passed on 19 October 2026 against the publication copy. They cover arithmetic boundaries, assembler and CPU behavior, guest-kernel transitions, memory isolation, scheduler limits, command validation, saved programs and the local server's file/method/Host restrictions. See [verification notes](docs/verification.md) for the scope of that result.

## Current limits

This is a simulation and learning project: the guest kernel executes on the simulated CPU, while JavaScript provides emulated devices and process switching. It is not a hardware-bootable OS, POSIX environment, VM security boundary or full filesystem.

Program persistence uses browser storage for the current origin. A blocked or full storage area falls back to session memory; it is not a disk-backed guest filesystem.

See the [German guide and instruction set](README.de.md) for the complete instruction reference and examples. Development used AI assistance; the implementation and tests are available for review.
