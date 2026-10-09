import Decimal from "decimal.js";

// Isolated context: importing this engine must not change another module's
// decimal settings. Python's precision-28 arithmetic uses half-even; half-up
// is deliberately reserved for display rounding.
export const D = Decimal.clone({ precision: 28, rounding: Decimal.ROUND_HALF_EVEN });
export type Dec = Decimal;
export type Numeric = Decimal.Value;
export function fmt(value: Numeric | null): string | null {
  if (value === null) return null;
  const d = new D(value);
  if (!d.isFinite()) throw new Error("Non-finite decimal");
  return d.isZero() ? "0" : d.toFixed();
}
export function displayNumber(value: Numeric, places = 1): string {
  return fmt(new D(value).toDecimalPlaces(places, Decimal.ROUND_HALF_UP))!;
}
export function displaySigned(value: Numeric, places = 1): string {
  const s = displayNumber(value, places);
  return s === "0" || s.startsWith("-") ? s : `+${s}`;
}
export function minutesToHoursDisplay(value: Numeric): string {
  return displayNumber(new D(value).div(60), 2);
}
export function parseNumber(raw: string, separator: string): Dec | null {
  if (!raw.trim()) return null;
  const normalized = separator === "," ? raw.trim().replaceAll(",", ".") : raw.trim();
  if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(normalized)) {
    throw new Error(`Invalid number ${JSON.stringify(raw)} (decimal separator ${JSON.stringify(separator)})`);
  }
  const d = new D(normalized);
  if (!d.isFinite()) throw new Error("Non-finite decimal");
  return d;
}
