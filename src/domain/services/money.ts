/**
 * Money and quantity arithmetic. Amounts are rounded to 2 decimals at every
 * step and sums are accumulated in minor units (paise/cents) to avoid binary
 * floating-point drift such as 0.1 + 0.2 = 0.30000000000000004.
 */
export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function roundPercentage(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function roundQuantity(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

export function sumMoney(values: Iterable<number>): number {
  let minor = 0;
  for (const value of values) minor += Math.round(value * 100);
  return minor / 100;
}

export function sumQuantity(values: Iterable<number>): number {
  let milli = 0;
  for (const value of values) milli += Math.round(value * 1000);
  return milli / 1000;
}
