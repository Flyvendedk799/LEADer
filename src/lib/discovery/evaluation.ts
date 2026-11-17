export type Judgement = { id: string; lane: string; expected: boolean; predicted: boolean };
export function evaluationReport(records: Judgement[]) {
  const summarize = (rows: Judgement[]) => {
    const tp = rows.filter(r => r.expected && r.predicted).length;
    const fp = rows.filter(r => !r.expected && r.predicted).length;
    const fn = rows.filter(r => r.expected && !r.predicted).length;
    const tn = rows.filter(r => !r.expected && !r.predicted).length;
    return { count: rows.length, tp, fp, fn, tn, precision: tp + fp ? tp / (tp + fp) : null, recall: tp + fn ? tp / (tp + fn) : null };
  };
  return { overall: summarize(records), lanes: Object.fromEntries([...new Set(records.map(r => r.lane))].sort().map(lane => [lane, summarize(records.filter(r => r.lane === lane))])) };
}
