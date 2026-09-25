export type PrizeOption = {
  prizeId: string;
  quotaRemaining: number;
  stockRemaining: number;
};

type Draw = (maxExclusive: number) => number;

export function pickWeightedPrize(
  options: PrizeOption[],
  draw: Draw,
): string {
  const eligible = options
    .map((option) => ({
      prizeId: option.prizeId,
      weight: Math.min(option.quotaRemaining, option.stockRemaining),
    }))
    .filter(({ weight }) => weight > 0);

  if (eligible.length === 0) {
    throw new Error('\u6ca1\u6709\u53ef\u62bd\u53d6\u7684\u5956\u54c1');
  }

  const total = eligible.reduce((sum, { weight }) => {
    if (!Number.isSafeInteger(weight) || !Number.isSafeInteger(sum + weight)) {
      throw new Error('\u5956\u54c1\u6743\u91cd\u603b\u548c\u5fc5\u987b\u662f\u5b89\u5168\u6574\u6570');
    }
    return sum + weight;
  }, 0);

  const value = draw(total);
  if (!Number.isSafeInteger(value) || value < 0 || value >= total) {
    throw new Error('\u968f\u673a\u62bd\u6837\u7ed3\u679c\u65e0\u6548');
  }

  let cumulative = 0;
  for (const { prizeId, weight } of eligible) {
    cumulative += weight;
    if (value < cumulative) {
      return prizeId;
    }
  }

  throw new Error('\u968f\u673a\u62bd\u6837\u7ed3\u679c\u65e0\u6548');
}

export function pickUniformStudent(
  eligibleIds: number[],
  draw: Draw,
): number {
  if (eligibleIds.length === 0) {
    throw new Error('\u6ca1\u6709\u7b26\u5408\u6761\u4ef6\u7684\u5b66\u751f');
  }

  const index = draw(eligibleIds.length);
  if (!Number.isSafeInteger(index) || index < 0 || index >= eligibleIds.length) {
    throw new Error('\u968f\u673a\u62bd\u6837\u7ed3\u679c\u65e0\u6548');
  }

  return eligibleIds[index];
}
