export const WIDTH = 6;
export const RADIX = 3 ** WIDTH;
export const MAX = (RADIX - 1) / 2;

// Least significant trit first. Arithmetic operates on these trits directly.
const digit = n => ((n + 1) % 3 + 3) % 3 - 1;

export function word(n) {
  if (!Number.isInteger(n) || Math.abs(n) > MAX) {
    throw new RangeError(`Ganzzahl zwischen −${MAX} und +${MAX} erwartet.`);
  }
  const result = [];
  for (let i = 0; i < WIDTH; i++) {
    const d = digit(n);
    result.push(d);
    n = (n - d) / 3;
  }
  return result;
}

export function value(trits) {
  return trits.reduce((sum, d, i) => sum + d * 3 ** i, 0);
}

export function display(trits) {
  return [...trits].reverse().map(d => d === -1 ? '−' : d === 1 ? '+' : '0').join('');
}

export function negate(trits) { return trits.map(d => d === 0 ? 0 : -d); }

export function add(left, right) {
  const result = [];
  let carry = 0;
  for (let i = 0; i < WIDTH; i++) {
    const sum = left[i] + right[i] + carry;
    const d = digit(sum);
    result.push(d);
    carry = (sum - d) / 3;
  }
  return { word: result, overflow: carry !== 0 };
}

export function multiply(left, right) {
  const columns = Array(WIDTH * 2 + 1).fill(0);
  for (let i = 0; i < WIDTH; i++) {
    for (let j = 0; j < WIDTH; j++) columns[i + j] += left[i] * right[j];
  }
  for (let i = 0; i < columns.length - 1; i++) {
    const d = digit(columns[i]);
    columns[i + 1] += (columns[i] - d) / 3;
    columns[i] = d;
  }
  return {
    word: columns.slice(0, WIDTH),
    overflow: columns.slice(WIDTH).some(d => d !== 0),
  };
}

export function compare(left, right) {
  for (let i = WIDTH - 1; i >= 0; i--) {
    if (left[i] !== right[i]) return left[i] < right[i] ? -1 : 1;
  }
  return 0;
}
