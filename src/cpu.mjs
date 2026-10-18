import { word, value, add, negate, multiply, compare, MAX } from './ternary.mjs';
import { OPCODES, USER_MAX, TRAP_VECTOR } from './isa.mjs';

export class CPU {
  constructor({ images = [], entry = 0, mode = 'user', onOutput = () => {} } = {}) {
    this.memory = Array.from({ length: 729 }, () => word(0));
    this.starts = new Set();
    for (const image of images) {
      image.words.forEach((w, i) => { this.memory[image.origin + i + MAX] = [...w]; });
      for (const address of image.starts) this.starts.add(address);
    }
    this.registers = Array.from({ length: 4 }, () => word(0));
    this.flags = { sign: 0, overflow: false };
    this.pc = entry;
    this.mode = mode;
    this.onOutput = onOutput;
    this.halted = false;
    this.frame = null;
    this.last = null;
  }

  read(address) {
    if (!Number.isInteger(address) || Math.abs(address) > MAX) throw new Error('Ungültige Speicheradresse.');
    return [...this.memory[address + MAX]];
  }

  checkUserAddress(address) {
    if (this.mode === 'user' && (address < 0 || address > USER_MAX)) {
      throw new Error('Kernel-Speicherschutz: Zugriff außerhalb des Benutzerbereichs.');
    }
  }

  privileged() {
    if (this.mode !== 'kernel') throw new Error('Dieser Befehl ist privilegiert und nur im Kernel erlaubt.');
  }

  restoreFrame() {
    if (!this.frame) throw new Error('Kernel: kein Systemaufruf für die Rückkehr vorhanden.');
    this.pc = this.frame.pc;
    this.registers = this.frame.registers.map(w => [...w]);
    this.flags = { ...this.frame.flags };
    this.mode = 'user';
    this.frame = null;
  }

  step() {
    if (this.halted) return { type: 'halt' };
    this.checkUserAddress(this.pc);
    if (!this.starts.has(this.pc)) throw new Error(`Keine Instruktion an Adresse ${this.pc}.`);
    const address = this.pc;
    const op = value(this.read(address));
    const field = value(this.read(address + 1));
    const arg = value(this.read(address + 2));
    const name = OPCODES[op];
    if (!name) throw new Error(`Ungültiger Opcode ${op} an Adresse ${address}.`);
    const indirect = field >= 9;
    const reg = indirect ? field - 9 : field;
    if (reg < 0 || reg > 3 || (indirect && (arg < 0 || arg > 3))) {
      throw new Error('Ungültige Registerkodierung.');
    }
    this.last = { address, name, reg, arg, indirect };
    this.pc += 3;
    const operand = () => indirect ? [...this.registers[arg]] : word(arg);
    const set = result => {
      this.registers[reg] = [...result.word];
      this.flags.sign = compare(result.word, word(0));
      this.flags.overflow = result.overflow;
    };
    const jump = () => {
      this.checkUserAddress(arg);
      if (!this.starts.has(arg)) throw new Error(`Keine Instruktion an Sprungadresse ${arg}.`);
      this.pc = arg;
    };
    switch (name) {
      case 'NOP': break;
      case 'LI': set({ word: word(arg), overflow: false }); break;
      case 'MOV':
        if (arg < 0 || arg > 3) throw new Error('Ungültiges Quellregister.');
        set({ word: this.registers[arg], overflow: false }); break;
      case 'LD': {
        const target = value(operand());
        this.checkUserAddress(target);
        set({ word: this.read(target), overflow: false }); break;
      }
      case 'ST': {
        const target = value(operand());
        this.checkUserAddress(target);
        this.read(target);
        this.memory[target + MAX] = [...this.registers[reg]];
        break;
      }
      case 'ADD': set(add(this.registers[reg], operand())); break;
      case 'SUB': set(add(this.registers[reg], negate(operand()))); break;
      case 'MUL': set(multiply(this.registers[reg], operand())); break;
      case 'CMP': this.flags.sign = compare(this.registers[reg], operand()); break;
      case 'JMP': jump(); break;
      case 'JN': if (this.flags.sign < 0) jump(); break;
      case 'JZ': if (this.flags.sign === 0) jump(); break;
      case 'JP': if (this.flags.sign > 0) jump(); break;
      case 'SYS':
        if (this.mode !== 'user') throw new Error('Kernel: verschachtelter Systemaufruf.');
        this.frame = { pc: this.pc, registers: this.registers.map(w => [...w]), flags: { ...this.flags } };
        this.registers[3] = word(arg);
        this.pc = TRAP_VECTOR;
        this.mode = 'kernel';
        break;
      case 'IRET': this.privileged(); this.restoreFrame(); break;
      case 'OUT': this.privileged(); this.onOutput(`${value(this.registers[reg])}\n`); break;
      case 'OUTC': {
        this.privileged();
        const code = value(this.registers[reg]);
        if (code < 0 || code > 127) throw new Error('Zeichenausgabe erwartet einen ASCII-Wert 0…127.');
        this.onOutput(String.fromCharCode(code)); break;
      }
      case 'YIELD': this.privileged(); return { type: 'yield' };
      case 'HALT':
        this.privileged();
        if (this.frame) this.restoreFrame();
        this.halted = true;
        return { type: 'halt' };
      case 'TRAP': this.privileged(); throw new Error(`Kernel: unbekannter Systemaufruf ${value(this.registers[3])}.`);
    }
    return { type: 'step' };
  }
}
