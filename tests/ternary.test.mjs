import test from 'node:test';
import assert from 'node:assert/strict';
import { word, value, display, add, negate, multiply } from '../src/ternary.mjs';

test('balanced words represent positive and negative numbers without a sign bit', () => {
  assert.equal(display(word(8)), '000+0−');
  assert.equal(display(word(-8)), '000−0+');
  assert.equal(display(word(0)), '000000');
  for (let n = -364; n <= 364; n++) assert.equal(value(word(n)), n);
});

test('carry propagates and addition wraps at the six-trit boundary', () => {
  const sum = add(word(13), word(1));
  assert.equal(display(sum.word), '00+−−−');
  assert.equal(value(sum.word), 14);
  assert.equal(sum.overflow, false);
  const overflow = add(word(364), word(1));
  assert.equal(value(overflow.word), -364);
  assert.equal(overflow.overflow, true);
  assert.equal(value(add(word(-364), word(-1)).word), 364);
});

test('negation and signed multiplication preserve balanced values', () => {
  assert.equal(value(negate(word(-364))), 364);
  for (const [left, right, expected, overflow] of [
    [-7, 8, -56, false], [-7, -8, 56, false], [0, 364, 0, false],
    [27, 27, 0, true], [364, 2, -1, true], [-364, 2, 1, true],
  ]) {
    const result = multiply(word(left), word(right));
    assert.equal(value(result.word), expected);
    assert.equal(result.overflow, overflow);
  }
});

test('word input rejects nonintegers and values outside the machine range', () => {
  for (const invalid of [365, -365, 1.5, NaN, Infinity, '5']) {
    assert.throws(() => word(invalid));
  }
});
