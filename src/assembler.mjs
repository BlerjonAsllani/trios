import { word, MAX } from './ternary.mjs';
import { ISA, REGISTERS, USER_MAX } from './isa.mjs';

export function assemble(source, { origin = 0, limit = USER_MAX } = {}) {
  if (typeof source !== 'string' || source.length > 40_000) {
    throw new Error('Programmquelle fehlt oder ist zu groß (max. 40.000 Zeichen).');
  }
  const labels = new Map();
  const rows = [];
  let address = origin;
  const fail = (line, message) => { throw new Error(`Zeile ${line}: ${message}`); };
  for (const [index, raw] of source.split(/\r?\n/).entries()) {
    let text = raw.split(';')[0].trim();
    if (!text) continue;
    const label = text.match(/^([A-Za-z_]\w*):/);
    if (label) {
      if (labels.has(label[1])) fail(index + 1, `Label ${label[1]} ist doppelt.`);
      labels.set(label[1], address);
      text = text.slice(label[0].length).trim();
    }
    if (!text) continue;
    const match = text.match(/^(\S+)(?:\s+(.*))?$/);
    const name = match[1].toUpperCase();
    if (!(name in ISA) && name !== '.WORD') fail(index + 1, `Unbekannter Befehl ${name}.`);
    const operands = (match[2] || '').split(',').map(s => s.trim());
    if (!match[2]) operands.length = 0;
    rows.push({ address, name, operands, line: index + 1, source: text });
    address += name === '.WORD' ? 1 : 3;
    if (address - 1 > limit || address - 1 > MAX || origin < -MAX) {
      fail(index + 1, 'Programm überschreitet seinen Speicherbereich.');
    }
  }
  if (!rows.length) throw new Error('Das Programm enthält keine Befehle.');

  const literal = (text, row, allowLabel = false) => {
    text = text.replace(/^#/, '');
    if (allowLabel && labels.has(text)) return labels.get(text);
    if (!/^[+-]?\d+$/.test(text)) fail(row.line, `Zahl oder bekanntes Label erwartet: ${text}.`);
    const number = Number(text);
    if (!Number.isInteger(number) || Math.abs(number) > MAX) fail(row.line, 'Wert liegt außerhalb −364…+364.');
    return number;
  };
  const register = (name, row) => {
    const index = REGISTERS.indexOf(name.toLowerCase());
    if (index < 0) fail(row.line, `Unbekanntes Register ${name}; erlaubt: a, b, c, s.`);
    return index;
  };
  const words = [], listing = [], starts = new Set();
  for (const row of rows) {
    if (row.name === '.WORD') {
      if (row.operands.length !== 1) fail(row.line, '.WORD erwartet genau einen Wert.');
      words.push(word(literal(row.operands[0], row)));
      listing.push(row);
      continue;
    }
    const [opcode, kind] = ISA[row.name];
    const count = ['none'].includes(kind) ? 0 : ['jump', 'service', 'output'].includes(kind) ? 1 : 2;
    if (row.operands.length !== count || row.operands.some(v => !v)) {
      fail(row.line, `${row.name} erwartet ${count} Operand${count === 1 ? '' : 'en'}.`);
    }
    let reg = 0, operand = 0;
    if (['literal', 'register', 'memory', 'value', 'output'].includes(kind)) reg = register(row.operands[0], row);
    if (kind === 'literal') operand = literal(row.operands[1], row);
    if (kind === 'register') operand = register(row.operands[1], row);
    if (kind === 'memory' || kind === 'value') {
      let text = row.operands[1];
      if (kind === 'memory') {
        if (!/^\[.+\]$/.test(text)) fail(row.line, 'Speicheradresse in eckigen Klammern erwartet.');
        text = text.slice(1, -1).trim();
      }
      if (REGISTERS.includes(text.toLowerCase())) {
        reg += 9;
        operand = register(text, row);
      } else operand = literal(text, row, kind === 'memory');
    }
    if (kind === 'jump') operand = literal(row.operands[0], row, true);
    if (kind === 'service') operand = literal(row.operands[0], row);
    starts.add(row.address);
    const encoded = [word(opcode), word(reg), word(operand)];
    words.push(...encoded);
    listing.push({ ...row, encoded });
  }
  return { origin, words, starts, listing, labels };
}
