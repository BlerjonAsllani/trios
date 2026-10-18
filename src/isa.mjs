export const REGISTERS = ['a', 'b', 'c', 's'];
export const USER_MAX = 299;
export const TRAP_VECTOR = -256;
export const ISA = {
  NOP: [0, 'none'], LI: [1, 'literal'], MOV: [2, 'register'],
  LD: [3, 'memory'], ST: [4, 'memory'], ADD: [5, 'value'],
  SUB: [6, 'value'], MUL: [7, 'value'], CMP: [8, 'value'],
  JMP: [9, 'jump'], JN: [10, 'jump'], JZ: [11, 'jump'], JP: [12, 'jump'],
  SYS: [13, 'service'], IRET: [14, 'none'], OUT: [15, 'output'],
  OUTC: [16, 'output'], HALT: [17, 'none'], YIELD: [18, 'none'],
  TRAP: [19, 'none'],
};
export const OPCODES = Object.fromEntries(Object.entries(ISA).map(([name, [op]]) => [op, name]));

export function formatInstruction({ name, reg, arg, indirect }) {
  const kind = ISA[name][1];
  if (kind === 'none') return name;
  if (['jump', 'service'].includes(kind)) return `${name} ${arg}`;
  if (kind === 'output') return `${name} ${REGISTERS[reg]}`;
  let operand = indirect ? REGISTERS[arg] : String(arg);
  if (kind === 'register') operand = REGISTERS[arg];
  if (kind === 'memory') operand = `[${operand}]`;
  if (kind === 'value' && !indirect) operand = `#${operand}`;
  return `${name} ${REGISTERS[reg]}, ${operand}`;
}
