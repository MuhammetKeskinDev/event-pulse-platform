import { singleQueryParam } from "./query-params";

/** Ortak `events` listesi / export filtreleri (GET query). */
export function buildEventsWhereParts(
  q: Record<string, string | string[] | undefined>,
): { where: string[]; params: unknown[]; nextParam: number } {
  const params: unknown[] = [];
  const where: string[] = ["1=1"];
  let p = 1;
  const etEv = singleQueryParam(q.event_type);
  const srcEv = singleQueryParam(q.source);
  const fromEv = singleQueryParam(q.from);
  const toEv = singleQueryParam(q.to);
  if (etEv !== undefined && etEv.length > 0) {
    where.push(`event_type = $${p}`);
    params.push(etEv);
    p += 1;
  }
  if (srcEv !== undefined && srcEv.length > 0) {
    where.push(`source = $${p}`);
    params.push(srcEv);
    p += 1;
  }
  if (fromEv !== undefined && fromEv.length > 0) {
    where.push(`occurred_at >= $${p}::timestamptz`);
    params.push(fromEv);
    p += 1;
  }
  if (toEv !== undefined && toEv.length > 0) {
    where.push(`occurred_at < $${p}::timestamptz`);
    params.push(toEv);
    p += 1;
  }
  return { where, params, nextParam: p };
}
