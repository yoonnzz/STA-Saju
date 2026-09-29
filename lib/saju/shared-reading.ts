import { createHash, randomBytes } from "node:crypto";
import { parseStoredReading, type StoredReading } from "./stored-reading";

export const SHARE_DAYS = 30;

export function normalizeShareNickname(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const nickname = value.trim();
  return nickname.length >= 1 && nickname.length <= 30 && !/[\u0000-\u001f\u007f]/.test(nickname)
    ? nickname
    : null;
}

export function createShareToken() {
  const token = randomBytes(32).toString("hex");
  return { token, hash: hashShareToken(token) };
}

export function hashShareToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function validShareToken(token: string) {
  return /^[0-9a-f]{64}$/.test(token);
}

export function shareExpiry(now = new Date()) {
  return new Date(now.getTime() + SHARE_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

const PRIVATE_FIELD = /^(?:date|time|gender|birth_?date|birth_?time|email|user_?id|account_?id|access_?token|api_?key|daily_?fortune)$/i;

export function hasPrivateShareFields(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(hasPrivateShareFields);
  return Object.entries(value).some(([key, nested]) => PRIVATE_FIELD.test(key) || hasPrivateShareFields(nested));
}

export function parseSharedReading(row: Record<string, unknown>): StoredReading | null {
  if (hasPrivateShareFields(row.chart) || hasPrivateShareFields(row.reading)) return null;
  return parseStoredReading(JSON.stringify({
    version: row.schema_version,
    createdAt: row.reading_created_at,
    chart: row.chart,
    reading: row.reading,
  }));
}
