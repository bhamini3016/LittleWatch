import { NextResponse } from "next/server";
import { configuredDeviceId, sql } from "@/lib/db";
import { jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const activeOnly = params.get("active") === "true";
  try {
    const rows = activeOnly
      ? await sql()`SELECT * FROM alerts WHERE device_id=${configuredDeviceId()} AND resolved=false ORDER BY timestamp DESC LIMIT 20`
      : await sql()`SELECT * FROM alerts WHERE device_id=${configuredDeviceId()} AND timestamp > now() - interval '3 days' ORDER BY timestamp DESC LIMIT 100`;
    return NextResponse.json({ alerts: rows.map(a => ({ id: a.id, deviceId: a.device_id, alertType: a.alert_type, message: a.message, severity: a.severity, timestamp: a.timestamp, acknowledged: a.acknowledged, acknowledgedAt: a.acknowledged_at, resolved: a.resolved, resolvedAt: a.resolved_at, temperatureSnapshot: a.temperature_snapshot === null ? null : Number(a.temperature_snapshot), movementSnapshot: a.movement_snapshot, cotOccupiedSnapshot: a.cot_occupied_snapshot, simulation: a.simulation })) });
  } catch (error) { console.error("Alert read failed", error); return jsonError("Alerts are temporarily unavailable.", 503); }
}
