import { describe, expect, it } from 'vitest';
import { pickUniformStudent, pickWeightedPrize } from './selection';

describe('pickWeightedPrize', () => {
  const options = [
    { prizeId: 'A', quotaRemaining: 3, stockRemaining: 9 },
    { prizeId: 'B', quotaRemaining: 5, stockRemaining: 1 },
  ];

  it('selects from cumulative min(quota, stock) weights, including boundaries', () => {
    expect(pickWeightedPrize(options, () => 0)).toBe('A');
    expect(pickWeightedPrize(options, () => 2)).toBe('A');
    expect(pickWeightedPrize(options, () => 3)).toBe('B');
  });

  it('excludes prizes with zero stock or zero quota', () => {
    const eligible = [
      { prizeId: 'out', quotaRemaining: 3, stockRemaining: 0 },
      { prizeId: 'A', quotaRemaining: 3, stockRemaining: 2 },
      { prizeId: 'out2', quotaRemaining: 0, stockRemaining: 5 },
    ];

    expect(pickWeightedPrize(eligible, (max) => max - 1)).toBe('A');
  });

  it('handles a single eligible prize', () => {
    expect(
      pickWeightedPrize(
        [{ prizeId: 'only', quotaRemaining: 7, stockRemaining: 2 }],
        () => 1,
      ),
    ).toBe('only');
  });

  it('rejects an empty eligible pool', () => {
    expect(() => pickWeightedPrize([], () => 0)).toThrow(/奖品/);
    expect(() =>
      pickWeightedPrize(
        [{ prizeId: 'none', quotaRemaining: 1, stockRemaining: 0 }],
        () => 0,
      ),
    ).toThrow(/奖品/);
  });

  it('rejects total weights exceeding the safe integer range', () => {
    expect(() =>
      pickWeightedPrize(
        [
          {
            prizeId: 'large',
            quotaRemaining: Number.MAX_SAFE_INTEGER,
            stockRemaining: Number.MAX_SAFE_INTEGER,
          },
          { prizeId: 'one', quotaRemaining: 1, stockRemaining: 1 },
        ],
        () => 0,
      ),
    ).toThrow(/安全整数/);
  });

  it('rejects a total range of 2^48 before calling draw', () => {
    let drawCalls = 0;
    let error: unknown;

    try {
      pickWeightedPrize(
        [
          { prizeId: 'A', quotaRemaining: 2 ** 47, stockRemaining: 2 ** 47 },
          { prizeId: 'B', quotaRemaining: 2 ** 47, stockRemaining: 2 ** 47 },
        ],
        () => {
          drawCalls += 1;
          return 0;
        },
      );
    } catch (caught) {
      error = caught;
    }

    expect(drawCalls).toBe(0);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/2\^48/);
  });

  it('allows the largest crypto.randomInt maxExclusive and preserves its weight', () => {
    const maxExclusive = 2 ** 48 - 1;
    let receivedMax = 0;

    expect(
      pickWeightedPrize(
        [
          {
            prizeId: 'largest',
            quotaRemaining: maxExclusive,
            stockRemaining: maxExclusive,
          },
        ],
        (max) => {
          receivedMax = max;
          return max - 1;
        },
      ),
    ).toBe('largest');
    expect(receivedMax).toBe(maxExclusive);
  });

  it.each([-1, 4, 1.5, Number.NaN])('rejects invalid draw value %s', (value) => {
    expect(() => pickWeightedPrize(options, () => value)).toThrow(/随机/);
  });
});

describe('pickUniformStudent', () => {
  it('selects by uniform index', () => {
    expect(pickUniformStudent([11, 22], () => 1)).toBe(22);
  });

  it('handles a single eligible student', () => {
    expect(pickUniformStudent([42], () => 0)).toBe(42);
  });

  it('rejects an empty eligible pool', () => {
    expect(() => pickUniformStudent([], () => 0)).toThrow(/学生/);
  });

  it.each([-1, 2, 0.5, Number.NaN])('rejects invalid draw value %s', (value) => {
    expect(() => pickUniformStudent([11, 22], () => value)).toThrow(/随机/);
  });
});
