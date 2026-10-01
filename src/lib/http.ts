import { NextResponse } from "next/server";

export function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

// Best-effort per-instance limiter for serverless deployments; durable abuse controls belong at the edge.
const buckets = new Map<string, { count: number; reset: number }>();
export function rateAllowed(key: string, limit = 40, windowMs = 60_000) {
  const now = Date.now();
  const current = buckets.get(key);
  if (!current || current.reset < now) { buckets.set(key, { count: 1, reset: now + windowMs }); return true; }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}

export function originAllowed(request: Request) {
  const allowed = (process.env.ALLOWED_ORIGINS || "").split(",").map(v => v.trim()).filter(Boolean);
  const origin = request.headers.get("origin");
  if (!origin) return true;
  if (allowed.length) return allowed.includes(origin);
  try { return origin === new URL(request.url).origin; } catch { return false; }
}
