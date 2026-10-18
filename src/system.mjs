import { CPU } from './cpu.mjs';
import { assemble } from './assembler.mjs';
import { BOOT_IMAGE, KERNEL_IMAGE } from './kernel.mjs';

export const DEMOS = {
  hello: '; ASCII-Zeichen über SYS 2 ausgeben.\n' + [...'Hallo, Trit!\n']
    .map(c => `LI a, ${c.charCodeAt(0)}\nSYS 2`).join('\n') + '\nSYS 0\n',
  counter: `; Zählt von −4 bis +4.
LI a, -4
loop:
  SYS 1
  ADD a, #1
  CMP a, #5
  JN loop
SYS 0
`,
  fibonacci: `; 14 Fibonacci-Zahlen im Bereich eines 6-Trit-Worts.
LI a, 0
LI b, 1
LI c, 14
loop:
  SYS 1
  SUB c, #1
  JZ done
  MOV s, a
  MOV a, b
  CMP c, #1
  JZ loop
  ADD b, s
  JMP loop
done:
SYS 0
`,
};

export class System {
  constructor({ quantum = 48, maxProcesses = 8, maxInstructions = 50_000, onEvent = () => {} } = {}) {
    this.quantum = quantum;
    this.maxProcesses = maxProcesses;
    this.maxInstructions = maxInstructions;
    this.onEvent = onEvent;
    this.processes = [];
    this.queue = [];
    this.nextId = 1;
    this.totalInstructions = 0;
    this.bootOutput = '';
    this.bootCPU = new CPU({ images: [BOOT_IMAGE, KERNEL_IMAGE], entry: -364, mode: 'kernel',
      onOutput: text => { this.bootOutput += text; } });
    while (!this.bootCPU.halted) this.bootCPU.step();
  }

  spawn(name, source) {
    if (this.processes.filter(p => p.status === 'ready').length >= this.maxProcesses) {
      throw new Error(`Prozesslimit erreicht (${this.maxProcesses}).`);
    }
    const image = assemble(source);
    if (!image.starts.has(0)) throw new Error('Das Programm muss mit einer Instruktion beginnen.');
    const process = { id: this.nextId++, name, source, image, status: 'ready', instructions: 0, output: '', error: null };
    process.cpu = new CPU({ images: [BOOT_IMAGE, KERNEL_IMAGE, image], onOutput: text => {
      process.output += text;
      this.onEvent({ type: 'output', pid: process.id, text });
    } });
    // Retain a bounded recent history, without discarding active processes.
    if (this.processes.length >= 32) {
      const oldest = this.processes.findIndex(p => p.status !== 'ready');
      if (oldest >= 0) this.processes.splice(oldest, 1);
    }
    this.processes.push(process);
    this.queue.push(process.id);
    this.onEvent({ type: 'spawn', pid: process.id, text: `${name} gestartet · PID ${process.id}` });
    return process;
  }

  get(id) { return this.processes.find(p => p.id === Number(id)); }
  hasWork() { return this.processes.some(p => p.status === 'ready'); }
  outputFor(id) { return this.get(id)?.output || ''; }

  step(id) {
    const process = this.get(id);
    if (!process || process.status !== 'ready') return { type: 'idle' };
    try {
      if (process.instructions >= this.maxInstructions) throw new Error('Instruktionslimit erreicht; mögliche Endlosschleife.');
      const event = process.cpu.step();
      process.instructions++;
      this.totalInstructions++;
      if (event.type === 'halt') {
        process.status = 'finished';
        this.onEvent({ type: 'finish', pid: process.id, text: `${process.name} beendet · ${process.instructions} Instruktionen` });
      }
      return event;
    } catch (error) {
      process.status = 'faulted';
      process.error = error.message;
      this.onEvent({ type: 'fault', pid: process.id, text: error.message });
      return { type: 'fault' };
    }
  }

  tick(budget = 600) {
    if (!Number.isInteger(budget) || budget < 0 || budget > 10_000) throw new Error('Ungültiges Ausführungsbudget.');
    let used = 0;
    while (used < budget && this.queue.length) {
      const id = this.queue.shift();
      const process = this.get(id);
      if (!process || process.status !== 'ready') continue;
      for (let i = 0; i < this.quantum && used < budget && process.status === 'ready'; i++) {
        const event = this.step(id);
        used++;
        if (event.type === 'yield') break;
      }
      if (process.status === 'ready') this.queue.push(id);
    }
    return used;
  }

  kill(id) {
    const process = this.get(id);
    if (!process || process.status !== 'ready') throw new Error('Kein aktiver Prozess mit dieser PID.');
    process.status = 'killed';
    this.queue = this.queue.filter(pid => pid !== process.id);
    this.onEvent({ type: 'kill', pid: process.id, text: `${process.name} gestoppt · PID ${process.id}` });
  }
}
