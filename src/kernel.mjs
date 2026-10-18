import { assemble } from './assembler.mjs';
import { TRAP_VECTOR } from './isa.mjs';

export const BOOT_SOURCE = [...'TRIOS/3\n'].map(c => `LI a, ${c.charCodeAt(0)}\nOUTC a`).join('\n') + '\nHALT';
export const KERNEL_SOURCE = `; Residenter Supervisor: Register s enthält die Dienstnummer.
  CMP s, #0
  JZ exit
  CMP s, #1
  JZ number
  CMP s, #2
  JZ character
  CMP s, #3
  JZ yield
  TRAP
number:
  OUT a
  IRET
character:
  OUTC a
  IRET
yield:
  YIELD
  IRET
exit:
  HALT`;

export const BOOT_IMAGE = assemble(BOOT_SOURCE, { origin: -364, limit: TRAP_VECTOR - 1 });
export const KERNEL_IMAGE = assemble(KERNEL_SOURCE, { origin: TRAP_VECTOR, limit: -1 });
