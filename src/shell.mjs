import { assemble } from './assembler.mjs';
import { display, word } from './ternary.mjs';
import { DEMOS } from './system.mjs';
import { KERNEL_SOURCE } from './kernel.mjs';

export const STATUS = { ready: 'bereit', finished: 'beendet', faulted: 'Fehler', killed: 'gestoppt' };
const STORAGE_KEY = 'trios3-programs-v1';
const normalizeName = name => String(name).replace(/\.tri$/i, '');

export class ProgramDisk {
  constructor(storage = null) {
    this.storage = storage;
    this.files = new Map(Object.entries(DEMOS));
    this.saved = {};
    this.notice = null;
    if (storage) {
      try {
        const stored = storage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) || Object.keys(parsed).length > 20) {
            throw new Error('Ungültiges gespeichertes Laufwerk.');
          }
          for (const [name, source] of Object.entries(parsed)) {
            this.validate(name, source);
            this.files.set(name, source);
            this.saved[name] = source;
          }
        }
      } catch {
        this.files = new Map(Object.entries(DEMOS));
        this.saved = {};
        this.notice = 'Browserspeicher nicht lesbar. Die Demo-Dateien sind verfügbar.';
      }
    }
  }

  validate(name, source) {
    if (!/^[A-Za-z][A-Za-z0-9_-]{0,31}$/.test(name) || ['kernel', 'boot', '__proto__', 'constructor', 'prototype'].includes(name)) {
      throw new Error('Dateiname: 1–32 Buchstaben, Zahlen, _ oder −; mit einem Buchstaben beginnen. Kernel ist reserviert.');
    }
    const image = assemble(source);
    if (!image.starts.has(0)) throw new Error('Das Programm muss mit einer Instruktion beginnen.');
  }

  list() { return [...this.files.keys()]; }

  read(name) {
    name = normalizeName(name);
    if (name === 'kernel') return KERNEL_SOURCE;
    if (!this.files.has(name)) throw new Error(`Datei ${name}.tri wurde nicht gefunden.`);
    return this.files.get(name);
  }

  save(name, source) {
    name = normalizeName(name);
    this.validate(name, source);
    if (!Object.hasOwn(this.saved, name) && Object.keys(this.saved).length >= 20) {
      throw new Error('Das Laufwerk ist voll (maximal 20 gespeicherte Programme).');
    }
    this.files.set(name, source);
    this.saved[name] = source;
    try {
      if (!this.storage) return { persistent: false, name };
      this.storage.setItem(STORAGE_KEY, JSON.stringify(this.saved));
      return { persistent: true, name };
    } catch { return { persistent: false, name }; }
  }
}

export class Shell {
  constructor({ system, disk, onText = () => {}, onClear = () => {}, onReboot = () => {} }) {
    Object.assign(this, { system, disk, onText, onClear, onReboot });
  }

  execute(command) {
    command = command.trim();
    if (!command) return { type: 'none' };
    const [name, ...args] = command.split(/\s+/);
    const arity = number => {
      if (args.length !== number) throw new Error(`${name}: ${number} Argument${number === 1 ? '' : 'e'} erwartet. Tippe help.`);
    };
    switch (name.toLowerCase()) {
      case 'help':
        arity(0);
        this.onText(`run hello         Programm starten
run fibonacci     Fibonacci-Zahlen ausgeben
calc -7 * 8       Mit der ternären CPU rechnen (+, −, *)
trit -8           Eine Zahl als sechs Trits anzeigen
ls                Programmdateien auflisten
cat hello         Programmquelle anzeigen
cat kernel        Den residenten Kernel ansehen
ps                Prozesse anzeigen
kill 1            Einen aktiven Prozess stoppen
clear             Konsole leeren
reboot            Das System neu starten

Eigene Programme schreibst du im Editor. Einzelschritt zeigt jeden CPU-Befehl.`);
        break;
      case 'ls': arity(0); this.onText([...this.disk.list(), 'kernel'].map(n => `${n}.tri`).join('\n')); break;
      case 'cat': arity(1); this.onText(this.disk.read(args[0])); break;
      case 'run': {
        arity(1);
        const filename = normalizeName(args[0]);
        if (filename === 'kernel') throw new Error('Der Kernel läuft bereits im Supervisorbereich.');
        const process = this.system.spawn(filename, this.disk.read(filename));
        return { type: 'spawn', pid: process.id };
      }
      case 'calc': {
        const match = command.match(/^calc\s+([+-]?\d+)\s*([+*−-])\s*([+-]?\d+)$/i);
        if (!match) throw new Error('Beispiel: calc -7 * 8. Erlaubte Operationen: +, −, *.');
        const left = Number(match[1]), right = Number(match[3]);
        word(left); word(right);
        const operation = { '+': 'ADD', '-': 'SUB', '−': 'SUB', '*': 'MUL' }[match[2]];
        const process = this.system.spawn('calc', `LI a, ${left}\n${operation} a, #${right}\nSYS 1\nSYS 0`);
        return { type: 'spawn', pid: process.id };
      }
      case 'trit': {
        arity(1);
        if (!/^[+-]?\d+$/.test(args[0])) throw new Error('Eine ganze Zahl zwischen −364 und +364 eingeben.');
        const number = Number(args[0]);
        this.onText(`${number} = ${display(word(number))}\nStellenwerte: 243 · 81 · 27 · 9 · 3 · 1`);
        break;
      }
      case 'ps':
        arity(0);
        this.onText(this.system.processes.length ? 'PID  PROGRAMM          STATUS      SCHRITTE\n' + this.system.processes.map(p =>
          `${String(p.id).padEnd(5)}${p.name.slice(0, 16).padEnd(18)}${STATUS[p.status].padEnd(12)}${p.instructions}`
        ).join('\n') : 'Keine Prozesse. Starte zum Beispiel run hello.');
        break;
      case 'kill':
        arity(1);
        if (!/^\d+$/.test(args[0])) throw new Error('kill erwartet eine numerische PID.');
        this.system.kill(Number(args[0]));
        break;
      case 'clear': arity(0); this.onClear(); break;
      case 'reboot': arity(0); this.onReboot(); break;
      default: throw new Error(`Befehl ${name} ist unbekannt. Tippe help für die verfügbaren Befehle.`);
    }
    return { type: 'none' };
  }
}
