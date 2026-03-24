import { PDFDocument, StandardFonts } from "pdf-lib";

import { buildEventsWhereParts } from "./events-where";
import { singleQueryParam } from "./query-params";

export type ExportFormat = "csv" | "pdf";

function csvEscapeCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function rowToCsvLine(row: {
  id: string;
  event_type: string;
  occurred_at: string;
  source: string;
  payload: unknown;
}): string {
  const payloadStr = safeJsonForExport(row.payload);
  return [
    csvEscapeCell(row.id),
    csvEscapeCell(row.occurred_at),
    csvEscapeCell(row.event_type),
    csvEscapeCell(row.source ?? ""),
    csvEscapeCell(payloadStr),
  ].join(",");
}

export function buildEventsExportCsv(rows: {
  id: string;
  event_type: string;
  occurred_at: string;
  source: string;
  payload: unknown;
}[]): string {
  const header = "id,occurred_at,event_type,source,payload";
  const lines = [header, ...rows.map(rowToCsvLine)];
  return "\uFEFF" + lines.join("\n") + "\n";
}

function iso(d: Date): string {
  return d instanceof Date ? d.toISOString() : String(d);
}

function asciiSafe(s: string): string {
  return s.replace(/[^\x20-\x7E]/g, "?");
}

function safeJsonForExport(value: unknown): string {
  if (value === undefined || value === null) {
    return "";
  }
  try {
    return JSON.stringify(value);
  } catch {
    return "[payload not serializable]";
  }
}

function chunkLines(s: string, chunk: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < s.length; i += chunk) {
    out.push(s.slice(i, i + chunk));
  }
  return out.length > 0 ? out : [""];
}

export async function buildEventsExportPdf(
  rows: {
    id: string;
    event_type: string;
    occurred_at: string;
    source: string;
    payload: unknown;
  }[],
  rangeLabel: string,
): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const titleSize = 11;
  const bodySize = 8;
  const left = 40;
  const pageW = 595;
  const pageH = 842;
  const marginBottom = 50;
  let page = doc.addPage([pageW, pageH]);
  let y = pageH - 50;

  const drawLine = (text: string, size: number) => {
    const safe = asciiSafe(text);
    for (const part of chunkLines(safe, 95)) {
      if (part.length === 0) {
        continue;
      }
      if (y < marginBottom) {
        page = doc.addPage([pageW, pageH]);
        y = pageH - 50;
      }
      try {
        page.drawText(part, { x: left, y, size, font });
      } catch {
        page.drawText("[unprintable line omitted]", {
          x: left,
          y,
          size,
          font,
        });
      }
      y -= size + 3;
    }
  };

  drawLine("EventPulse - event export", titleSize);
  drawLine(`Range: ${asciiSafe(rangeLabel)}`, bodySize);
  drawLine(`Rows: ${rows.length} (server row cap may apply)`, bodySize);
  y -= 4;

  const maxPdfRows = Math.min(rows.length, 500);
  for (let i = 0; i < maxPdfRows; i += 1) {
    const r = rows[i]!;
    const payloadStr = safeJsonForExport(r.payload);
    const one = `${r.occurred_at} | ${r.event_type} | ${r.source ?? ""} | ${r.id} | ${payloadStr.slice(0, 500)}`;
    drawLine(one, bodySize);
  }
  if (rows.length > maxPdfRows) {
    drawLine(
      `... ${rows.length - maxPdfRows} more rows (use CSV export for full data).`,
      bodySize,
    );
  }

  const bytes = await doc.save();
  return Buffer.from(bytes);
}

/** Export sorgu parametreleri: `from` / `to` zorunlu (ISO-8601). */
export function parseEventsExportQuery(q: Record<string, string | string[] | undefined>): {
  ok: true;
  format: ExportFormat;
  from: string;
  to: string;
  event_type?: string;
  source?: string;
  limit: number;
} | { ok: false; status: 400; error: string } {
  const formatRaw = (singleQueryParam(q.format) ?? "").toLowerCase();
  if (formatRaw !== "csv" && formatRaw !== "pdf") {
    return { ok: false, status: 400, error: "invalid_export_format" };
  }
  const format: ExportFormat = formatRaw;
  const from = singleQueryParam(q.from) ?? "";
  const to = singleQueryParam(q.to) ?? "";
  if (from.length === 0 || to.length === 0) {
    return { ok: false, status: 400, error: "export_requires_from_and_to" };
  }
  const fromMs = Date.parse(from);
  const toMs = Date.parse(to);
  if (Number.isNaN(fromMs) || Number.isNaN(toMs)) {
    return { ok: false, status: 400, error: "invalid_time_range" };
  }
  if (fromMs >= toMs) {
    return { ok: false, status: 400, error: "invalid_time_range_order" };
  }
  const limitRaw = Number.parseInt(singleQueryParam(q.limit) ?? "5000", 10);
  const limit = Math.min(10_000, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : 5000));
  const et = singleQueryParam(q.event_type);
  const src = singleQueryParam(q.source);
  const out: {
    ok: true;
    format: ExportFormat;
    from: string;
    to: string;
    limit: number;
    event_type?: string;
    source?: string;
  } = {
    ok: true,
    format,
    from,
    to,
    limit,
  };
  if (et !== undefined && et.length > 0) {
    out.event_type = et;
  }
  if (src !== undefined && src.length > 0) {
    out.source = src;
  }
  return out;
}

export function buildExportSql(
  parsed: {
    from: string;
    to: string;
    event_type?: string;
    source?: string;
    limit: number;
  },
  rawQuery: Record<string, string | string[] | undefined>,
): { sql: string; params: unknown[] } {
  const q: Record<string, string | string[] | undefined> = {
    ...rawQuery,
    from: parsed.from,
    to: parsed.to,
  };
  if (parsed.event_type !== undefined) {
    q.event_type = parsed.event_type;
  }
  if (parsed.source !== undefined) {
    q.source = parsed.source;
  }
  const { where, params, nextParam } = buildEventsWhereParts(q);
  const p = nextParam;
  const sql = `
    SELECT id::text AS id, event_type,
           occurred_at,
           payload,
           source
    FROM events
    WHERE ${where.join(" AND ")}
    ORDER BY occurred_at DESC
    LIMIT $${p}
  `;
  return { sql, params: [...params, parsed.limit] };
}

export function mapExportRows(
  rows: {
    id: string;
    event_type: string;
    occurred_at: Date;
    payload: unknown;
    source: string;
  }[],
): {
  id: string;
  event_type: string;
  occurred_at: string;
  source: string;
  payload: unknown;
}[] {
  return rows.map((row) => ({
    id: row.id,
    event_type: row.event_type,
    occurred_at: iso(row.occurred_at),
    source: row.source,
    payload: row.payload,
  }));
}
