import {
  parseStoredReading,
  type StoredReading,
} from "./stored-reading";

export type ReadingRow = {
  chart: unknown;
  reading: unknown;
  schema_version: unknown;
  reading_created_at: unknown;
};

export function parseReadingRow(value: unknown): StoredReading | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as ReadingRow;
  return parseStoredReading(
    JSON.stringify({
      version: row.schema_version,
      createdAt: row.reading_created_at,
      chart: row.chart,
      reading: row.reading,
    }),
  );
}

export function readingUpsert(record: StoredReading, userId: string) {
  return {
    user_id: userId,
    chart: record.chart,
    reading: record.reading,
    schema_version: record.version,
    reading_created_at: record.createdAt,
  };
}

export function safeNextPath(value: string | null): string {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) return "/";
  return value;
}
