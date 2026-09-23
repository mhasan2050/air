import { encode as encodeCl100k } from 'gpt-tokenizer/encoding/cl100k_base';
import { encode as encodeO200k } from 'gpt-tokenizer/encoding/o200k_base';
import { compact, readable } from './format.js';

export function tokenReport(module, baseline) {
  const representations = { compact: compact(module), readable: readable(module), json: JSON.stringify(module) };
  if (baseline !== undefined) representations.baseline = baseline;
  const encodings = { cl100k_base: encodeCl100k, o200k_base: encodeO200k };
  const report = {};
  for (const [name, encode] of Object.entries(encodings)) {
    const counts = Object.fromEntries(Object.entries(representations).map(([format, source]) => [format, encode(source).length]));
    const reduction = (reference) => reference === 0 ? null : Number((100 * (1 - counts.compact / reference)).toFixed(2));
    report[name] = {
      tokens: counts,
      compactReductionVsReadablePercent: reduction(counts.readable),
      ...(baseline === undefined ? {} : { compactReductionVsBaselinePercent: reduction(counts.baseline) }),
    };
  }
  return report;
}