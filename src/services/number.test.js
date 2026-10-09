import { num, asNumber } from './number';

test('missing values stay missing instead of becoming 0', () => {
  expect(num(null)).toBeNull();
  expect(num(undefined)).toBeNull();
  expect(num('')).toBeNull();
  expect(num('abc')).toBeNull();
  expect(num(0)).toBe(0);
  expect(num('61')).toBe(61);
});

test('asNumber skips missing values to reach a real one', () => {
  expect(asNumber(null, undefined, '', 56)).toBe(56);
  expect(asNumber(null, undefined)).toBeNull();
  expect(asNumber(0, 5)).toBe(0);
});
