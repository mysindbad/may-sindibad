/**
 * Convert a display-unit amount (for example 10.99 USD or 500 JPY) into the
 * integer amount Stripe expects for charges/Checkout.
 *
 * Stripe treats most currencies as two-decimal. Its documented zero-decimal
 * currencies use the major-unit amount directly. ISK and UGX are special
 * charge cases: Stripe still expects a two-decimal representation ending in
 * 00 even though fractions aren't allowed.
 */
const STRIPE_ZERO_DECIMAL_CHARGE_CURRENCIES = new Set([
  "BIF",
  "CLP",
  "DJF",
  "GNF",
  "JPY",
  "KMF",
  "KRW",
  "MGA",
  "PYG",
  "RWF",
  "VND",
  "VUV",
  "XAF",
  "XOF",
  "XPF",
]);

const STRIPE_WHOLE_MAJOR_UNIT_BUT_TIMES_100 = new Set(["ISK", "UGX"]);

const EPSILON = 1e-7;

function assertWhole(value: number, message: string): number {
  const rounded = Math.round(value);
  if (Math.abs(value - rounded) > EPSILON) throw new Error(message);
  return rounded;
}

export function toStripeMinorUnits(amount: number, currency: string): number {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Payment amount must be greater than zero.");

  const code = currency.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(code)) throw new Error("Currency must be a 3-letter ISO code.");

  if (STRIPE_ZERO_DECIMAL_CHARGE_CURRENCIES.has(code)) {
    return assertWhole(amount, `${code} does not support fractional charge amounts.`);
  }

  if (STRIPE_WHOLE_MAJOR_UNIT_BUT_TIMES_100.has(code)) {
    return assertWhole(amount, `${code} does not support fractional charge amounts.`) * 100;
  }

  return assertWhole(amount * 100, `${code} supports at most two decimal places.`);
}

export function isStripeWholeUnitChargeCurrency(currency: string): boolean {
  const code = currency.trim().toUpperCase();
  return STRIPE_ZERO_DECIMAL_CHARGE_CURRENCIES.has(code) || STRIPE_WHOLE_MAJOR_UNIT_BUT_TIMES_100.has(code);
}
