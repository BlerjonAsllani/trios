import test from 'node:test';
import assert from 'node:assert/strict';
import { assemble } from '../src/assembler.mjs';
import { CPU } from '../src/cpu.mjs';
import { System, DEMOS } from '../src/system.mjs';
import { value } from '../src/ternary.mjs';
import { formatInstruction } from '../src/isa.mjs';

const execute = source => {
  const system = new System();
  const process = system.spawn('test', source);
  while (system.hasWork()) system.tick(200);
  return { system, process };
};

test('assembler resolves labels and encodes three real ternary words per instruction', () => {
  const image = assemble('LI a, -8\nloop: ADD a, #1\nCMP a, #0\nJN loop\nSYS 0');
  assert.equal(image.words.length, 15);
  assert.equal(value(image.words[2]), -8);
  assert.equal(value(image.words[11]), 3);
  assert.ok(image.words.every(w => w.length === 6 && w.every(t => [-1, 0, 1].includes(t))));
});

test('assembler rejects bad operands, unknown labels and oversized programs', () => {
  for (const source of ['LI x, 1', 'LI a, 365', 'JMP nowhere', 'SYS 1, 2',
    'label: NOP\nlabel: NOP', 'OUT a, b', '???', 'NOP\n'.repeat(101)]) {
    assert.throws(() => assemble(source));
  }
});

test('CPU carry arithmetic and comparisons execute loops correctly', () => {
  const { process, system } = execute('LI a, -3\nloop: ADD a, #1\nCMP a, #0\nJN loop\nSYS 1\nSYS 0');
  assert.equal(process.status, 'finished');
  assert.equal(value(process.cpu.registers[0]), 0);
  assert.equal(system.outputFor(process.id), '0\n');
});

test('SYS enters a resident guest kernel and IRET resumes user mode', () => {
  const system = new System();
  const process = system.spawn('syscall', 'LI a, 42\nSYS 1\nSYS 0');
  assert.equal(process.cpu.mode, 'user');
  system.step(process.id);
  system.step(process.id);
  assert.equal(process.cpu.mode, 'kernel');
  assert.ok(process.cpu.pc < 0);
  for (let i = 0; i < 20 && process.cpu.mode === 'kernel'; i++) system.step(process.id);
  assert.equal(process.cpu.mode, 'user');
  assert.equal(process.cpu.pc, 6);
  assert.equal(system.outputFor(process.id), '42\n');
});

test('user programs cannot use privileged output, overwrite or jump into kernel', () => {
  for (const source of ['OUT a', 'LI a, 7\nST a, [-256]', 'JMP -256', 'IRET', 'HALT']) {
    const { process } = execute(source);
    assert.equal(process.status, 'faulted', source);
    assert.match(process.error, /Kernel|privilegiert|Benutzer/);
  }
});

test('process address spaces remain isolated', () => {
  const system = new System();
  const first = system.spawn('first', 'LI a, 12\nST a, [299]\nSYS 0');
  const second = system.spawn('second', 'LD a, [299]\nSYS 1\nSYS 0');
  while (system.hasWork()) system.tick(100);
  assert.equal(value(first.cpu.read(299)), 12);
  assert.equal(system.outputFor(second.id), '0\n');
});

test('round-robin scheduling, cooperative yield and kill remain responsive', () => {
  const system = new System({ quantum: 3 });
  const loop = system.spawn('loop', 'again: SYS 3\nJMP again');
  const hello = system.spawn('hello', 'LI a, 9\nSYS 1\nSYS 0');
  system.tick(100);
  assert.equal(hello.status, 'finished');
  assert.equal(system.outputFor(hello.id), '9\n');
  assert.equal(loop.status, 'ready');
  system.kill(loop.id);
  assert.equal(loop.status, 'killed');
  assert.equal(system.hasWork(), false);
});

test('invalid opcodes, misaligned jumps and unknown system calls cause process faults', () => {
  for (const source of ['JMP 1\nSYS 0', 'SYS 99', 'LI a, 99\nST a, [9]\nJMP 9\nNOP']) {
    const { process } = execute(source);
    assert.equal(process.status, 'faulted', source);
  }
});

test('instruction budget stops infinite loops and process limits reject excess work', () => {
  const system = new System({ maxInstructions: 30 });
  const loop = system.spawn('loop', 'JMP 0');
  system.tick(100);
  assert.equal(loop.status, 'faulted');
  assert.match(loop.error, /Instruktionslimit/);
  const limited = new System({ maxProcesses: 2 });
  limited.spawn('a', 'JMP 0');
  limited.spawn('b', 'JMP 0');
  assert.throws(() => limited.spawn('c', 'SYS 0'), /Prozesslimit/);
});

test('boot and shipped programs execute on the virtual CPU', () => {
  const system = new System();
  assert.match(system.bootOutput, /TRIOS\/3/);
  const hello = execute(DEMOS.hello);
  assert.equal(hello.system.outputFor(hello.process.id), 'Hallo, Trit!\n');
  const fibonacci = execute(DEMOS.fibonacci);
  assert.equal(fibonacci.system.outputFor(fibonacci.process.id), '0\n1\n1\n2\n3\n5\n8\n13\n21\n34\n55\n89\n144\n233\n');
  assert.equal(value(fibonacci.process.cpu.registers[0]), 233, 'stop before calculating an unrepresentable next number');
  assert.equal(value(fibonacci.process.cpu.registers[1]), 233);
});

test('overflow wraps the result and exposes the overflow flag', () => {
  const { process } = execute('LI a, 364\nADD a, #1\nSYS 0');
  assert.equal(value(process.cpu.registers[0]), -364);
  assert.equal(process.cpu.flags.overflow, true);
});

test('monitor disassembly distinguishes registers from literals and memory addresses', () => {
  const system = new System();
  const process = system.spawn('inspect', 'LI a, 5\nMOV b, a\nST b, [a]\nADD a, b\nSYS 0');
  for (const expected of ['LI a, 5', 'MOV b, a', 'ST b, [a]', 'ADD a, b']) {
    system.step(process.id);
    assert.equal(formatInstruction(process.cpu.last), expected);
  }
});
