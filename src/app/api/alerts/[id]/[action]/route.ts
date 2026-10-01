import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { jsonError, originAllowed, rateAllowed } from "@/lib/http";

export const runtime = "nodejs";
export async function POST(request: Request, context: { params: { id: string; action: string } }) {
  if (!originAllowed(request)) return jsonError("Request origin is not allowed.", 403);
  if (!rateAllowed(`alert-action:${request.headers.get("x-forwarded-for") || "unknown"}`, 30)) return jsonError("Too many requests.", 429);
  const { id, action } = context.params;
  if (!/^\d+$/.test(id)) return jsonError("Invalid alert ID.", 400);
  if (action !== "acknowledge" && action !== "resolve") return jsonError("Unknown alert action.", 404);
  try {
    const rows = action === "acknowledge"
      ? await sql()`UPDATE alerts SET acknowledged=true, acknowledged_at=COALESCE(acknowledged_at, now()) WHERE id=${id} AND resolved=false RETURNING id, acknowledged, acknowledged_at`
      : await sql()`UPDATE alerts SET resolved=true, resolved_at=now(), acknowledged=true, acknowledged_at=COALESCE(acknowledged_at, now()) WHERE id=${id} RETURNING id, resolved, resolved_at`;
    if (!rows.length) return jsonError("Alert not found or already resolved.", 404);
    return NextResponse.json({ alert: rows[0] });
  } catch (error) { console.error("Alert action failed", error); return jsonError("Could not update alert.", 503); }
}
