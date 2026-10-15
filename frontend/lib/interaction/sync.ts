export type SupportRecord = { id: string; kind: string; updatedAt: number; data: Record<string, unknown> };
export type QueueState = { records: SupportRecord[]; pending: Record<string, number> };
export function enqueue(state: QueueState, record: SupportRecord): QueueState {
  const previous = state.records.find(row => row.id === record.id);
  if (previous && previous.updatedAt >= record.updatedAt) return state;
  return { records: [...state.records.filter(row => row.id !== record.id), record], pending: { ...state.pending, [record.id]: record.updatedAt } };
}
export function acknowledge(state: QueueState, remote: SupportRecord[], sent: SupportRecord[]): QueueState {
  const pending = { ...state.pending }, records = new Map(state.records.map(row => [row.id, row]));
  for (const row of remote) {
    if (!records.has(row.id) || records.get(row.id)!.updatedAt < row.updatedAt) records.set(row.id, row);
  }
  for (const row of sent) {
    // An acknowledgement must not remove an edit made while the upload was in flight.
    if (pending[row.id] === row.updatedAt && remote.some(r => r.id === row.id && r.updatedAt >= row.updatedAt)) delete pending[row.id];
  }
  return { records: Array.from(records.values()), pending };
}
