// ID-259: a card's DPS never runs past the card on a phone: at most five characters, the
// card's label keeping the full figure.
import { describe, expect, it } from 'vitest';
import { cardDps } from './squadroster.ts';

describe('cardDps', () => {
  it('keeps tenths below 1,000', () => {
    expect(cardDps(0)).toBe('0.0');
    expect(cardDps(17.24)).toBe('17.2');
    expect(cardDps(999.9)).toBe('999.9');
    expect(cardDps(999.949)).toBe('999.9');
  });

  it('drops the tenths from 1,000, never printing "1000.0"', () => {
    expect(cardDps(999.95)).toBe('999');
    expect(cardDps(1234.56)).toBe('1234');
    expect(cardDps(12345.6)).toBe('12345');
    expect(cardDps(99999.9)).toBe('99999');
    expect(cardDps(99999.99)).toBe('99999');
  });

  it('uses the short form from 100,000', () => {
    expect(cardDps(100_000)).toBe('100k');
    expect(cardDps(123_456)).toBe('123k');
    expect(cardDps(4_567_890)).toBe('4.5M');
    expect(cardDps(98_765_432)).toBe('98.7M');
  });

  it('is never longer than five characters', () => {
    for (let n = 0; n < 1e13; n = n * 1.37 + 0.31) {
      expect(cardDps(n).length, String(n)).toBeLessThanOrEqual(5);
    }
  });
});
