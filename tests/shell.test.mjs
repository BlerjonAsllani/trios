import test from 'node:test';
import assert from 'node:assert/strict';
import { ProgramDisk, Shell } from '../src/shell.mjs';
import { System } from '../src/system.mjs';

const drain = system => { while (system.hasWork()) system.tick(200); };

test('shell calculation runs as a guest program with signed operands', () => {
  const system = new System();
  const shell = new Shell({ system, disk: new ProgramDisk() });
  const result = shell.execute('calc -7 * 8');
  assert.equal(result.type, 'spawn');
  drain(system);
  assert.equal(system.outputFor(result.pid), '-56\n');
});

test('shell rejects malformed calculations, missing files and unknown commands without spawning work', () => {
  const system = new System();
  const shell = new Shell({ system, disk: new ProgramDisk() });
  for (const command of ['calc 999 + 1', 'calc 1 / 2', 'run missing', 'run', 'run hello extra', 'kill abc', 'unknown']) {
    assert.throws(() => shell.execute(command));
    assert.equal(system.processes.length, 0);
  }
});

test('disk persists valid programs and restores them in a new session', () => {
  const values = new Map();
  const storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value) };
  const disk = new ProgramDisk(storage);
  assert.equal(disk.save('custom', 'LI a, -12\nSYS 1\nSYS 0').persistent, true);
  const restored = new ProgramDisk(storage);
  const system = new System();
  const shell = new Shell({ system, disk: restored });
  const result = shell.execute('run custom.tri');
  drain(system);
  assert.equal(system.outputFor(result.pid), '-12\n');
});

test('corrupt or unavailable storage leaves the demos usable and saved programs in memory', () => {
  const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('full'); } };
  const disk = new ProgramDisk(broken);
  assert.ok(disk.read('hello').includes('SYS 2'));
  assert.equal(disk.save('custom', 'SYS 0').persistent, false);
  assert.equal(disk.read('custom'), 'SYS 0');
  const corrupted = new ProgramDisk({ getItem: () => '{broken', setItem: () => {} });
  assert.ok(corrupted.list().includes('fibonacci'));
});

test('invalid programs and unsafe or reserved names cannot replace saved files', () => {
  const disk = new ProgramDisk();
  for (const [name, source] of [['../x', 'SYS 0'], ['kernel', 'SYS 0'], ['custom', 'LI a, 999'], ['custom', '']]) {
    assert.throws(() => disk.save(name, source));
  }
  assert.ok(!disk.list().includes('custom'));
});

test('terminal exposes trit conversion, process status and actual guest kernel source', () => {
  const text = [];
  const shell = new Shell({ system: new System(), disk: new ProgramDisk(), onText: line => text.push(line) });
  shell.execute('trit -8');
  assert.match(text.join(''), /000−0\+/);
  shell.execute('cat kernel');
  assert.match(text.join(''), /IRET/);
  shell.execute('ps');
  assert.match(text.join(''), /Keine Prozesse/);
});
