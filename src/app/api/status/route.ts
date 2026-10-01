import { NextResponse } from "next/server";
import { configuredDeviceId, offlineAfterSeconds, sql } from "@/lib/db";
import { jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const rows = await sql()`SELECT device_id, temperature, movement_detected, sound_state, cot_occupied, alert_type, updated_at, device_last_seen, simulation FROM device_status WHERE device_id=${configuredDeviceId()} LIMIT 1`;
    if (!rows.length) return NextResponse.json({ status: null, configured: true, offlineAfterSeconds: offlineAfterSeconds(), message: "Waiting for the first device update." });
    const s = rows[0];
    const connected = s.simulation
      ? s.alert_type !== "DEVICE_OFFLINE"
      : Date.now() - new Date(s.device_last_seen as string).getTime() <= offlineAfterSeconds() * 1000;
    return NextResponse.json({ status: {
      deviceId: s.device_id, temperature: Number(s.temperature), movementDetected: s.movement_detected,
      soundState: s.sound_state, cotOccupied: s.cot_occupied, alertType: s.alert_type,
      updatedAt: s.updated_at, deviceLastSeen: s.device_last_seen, connected, simulation: s.simulation
    }, offlineAfterSeconds: offlineAfterSeconds() });
  } catch (error) { console.error("Status read failed", error); return jsonError("Status is temporarily unavailable. Check database configuration.", 503); }
}
