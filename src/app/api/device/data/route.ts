import { NextResponse } from "next/server";
import { sql, configuredDeviceId } from "@/lib/db";
import { jsonError, rateAllowed } from "@/lib/http";
import { ALERT_MESSAGES, devicePayloadSchema } from "@/lib/validation";
import { timingSafeEqual } from "node:crypto";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!rateAllowed(`device:${request.headers.get("x-forwarded-for") || "unknown"}`, 90)) return jsonError("Too many requests. Try again shortly.", 429);
  const expected = process.env.DEVICE_API_KEY;
  const supplied = request.headers.get("x-device-api-key") || "";
  if (!expected) return jsonError("Device ingestion is not configured.", 503);
  const a = Buffer.from(supplied); const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return jsonError("Unauthorized device.", 401);
  let raw: unknown;
  try { raw = await request.json(); } catch { return jsonError("Request body must be valid JSON.", 400); }
  const parsed = devicePayloadSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Invalid sensor payload.", details: parsed.error.flatten() }, { status: 400 });
  const data = parsed.data;
  if (data.deviceId !== configuredDeviceId()) return jsonError("Unknown deviceId.", 403);
  try {
    const db = sql();
    await db.begin(async tx => {
      const previous = await tx`SELECT alert_type FROM device_status WHERE device_id=${data.deviceId} FOR UPDATE`;
      const previousAlert = previous[0]?.alert_type ?? null;
      await tx`INSERT INTO device_status (device_id, temperature, movement_detected, sound_state, sound_level, cot_occupied, alert_type, updated_at, device_last_seen, simulation)
        VALUES (${data.deviceId}, ${data.temperature}, ${data.movement}, ${data.soundState || ((data.soundLevel ?? 0) >= 600 ? "elevated" : "normal")}, ${data.soundLevel ?? null}, ${data.cotOccupied}, ${data.alert?.type ?? null}, now(), now(), false)
        ON CONFLICT (device_id) DO UPDATE SET temperature=EXCLUDED.temperature, movement_detected=EXCLUDED.movement_detected, sound_state=EXCLUDED.sound_state, sound_level=EXCLUDED.sound_level, cot_occupied=EXCLUDED.cot_occupied, alert_type=EXCLUDED.alert_type, updated_at=now(), device_last_seen=now(), simulation=false`;
      await tx`INSERT INTO sensor_history (device_id, temperature, movement_detected, sound_state, cot_occupied, simulation) VALUES (${data.deviceId}, ${data.temperature}, ${data.movement}, ${data.soundState || ((data.soundLevel ?? 0) >= 600 ? "elevated" : "normal")}, ${data.cotOccupied}, false)`;
      if (data.alert && previousAlert !== data.alert.type) {
        const message = data.alert.message || ALERT_MESSAGES[data.alert.type];
        await tx`INSERT INTO alerts (device_id, alert_type, message, severity, temperature_snapshot, movement_snapshot, cot_occupied_snapshot, simulation)
          SELECT ${data.deviceId}, ${data.alert.type}, ${message}, ${data.alert.type === "DEVICE_OFFLINE" ? "connection" : "attention"}, ${data.temperature}, ${data.movement}, ${data.cotOccupied}, false
          WHERE NOT EXISTS (SELECT 1 FROM alerts WHERE device_id=${data.deviceId} AND alert_type=${data.alert.type} AND resolved=false AND timestamp > now() - interval '2 minutes')`;
      }
      await tx`DELETE FROM sensor_history WHERE recorded_at < now() - interval '3 days'`;
      await tx`DELETE FROM alerts WHERE timestamp < now() - interval '3 days' AND resolved=true`;
    });
    return NextResponse.json({ accepted: true, deviceId: data.deviceId, receivedAt: new Date().toISOString() });
  } catch (error) {
    console.error("Device data persistence failed", error);
    return jsonError("Could not store device data. Check database configuration.", 503);
  }
}
