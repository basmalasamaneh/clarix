export * from "./types";
export { D, fmt, displayNumber, displaySigned, minutesToHoursDisplay, parseNumber } from "./decimal";
export { decodeBytes, detectDelimiter, parseCsv } from "./reader/csv";
export { csvAdapter, isFormulaLikeText } from "./reader/adapter";
export { parseLocalTime } from "./reader/dates";
export { calculate } from "./engine";
export { contentHash } from "./hash";

import { csvAdapter } from "./reader/adapter";
import { calculate } from "./engine";
import type { Mapping, SourceFile } from "./types";
export function calculateFiles(files: readonly SourceFile[], mapping: Mapping, pair?: readonly [string,string]) {
  return calculate(csvAdapter.read(files,mapping),pair);
}
