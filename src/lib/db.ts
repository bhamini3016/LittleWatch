import postgres from "postgres";

const globalForSql = globalThis as unknown as { littlewatchSql?: ReturnType<typeof postgres> };

export function sql() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not configured. Add a Neon PostgreSQL connection string.");
  if (!globalForSql.littlewatchSql) {
    globalForSql.littlewatchSql = postgres(url, { max: 1, prepare: false, idle_timeout: 20, connect_timeout: 10 });
  }
  return globalForSql.littlewatchSql;
}

export function configuredDeviceId() { return process.env.DEVICE_ID || "nursery-01"; }
export function offlineAfterSeconds() {
  const value = Number(process.env.DEVICE_OFFLINE_SECONDS || 30);
  return Number.isFinite(value) && value >= 10 && value <= 3600 ? value : 30;
}
