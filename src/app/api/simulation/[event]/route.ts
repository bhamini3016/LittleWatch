import { NextResponse } from "next/server";
import { configuredDeviceId, sql } from "@/lib/db";
import { jsonError, originAllowed, rateAllowed } from "@/lib/http";
import { ALERT_MESSAGES } from "@/lib/validation";
import { ALERT_TYPES, type AlertType } from "@/lib/types";

export const runtime = "nodejs";
const demo: Record<string, { type: AlertType; temperature: number; movement: boolean; sound: "normal" | "elevated"; occupied: boolean }> = {
  normal: { type: "CRYING", temperature: 24.3, movement: true, sound: "normal", occupied: true },
  temperature_high: { type: "TEMPERATURE_HIGH", temperature: 28.4, movement: true, sound: "normal", occupied: true },
  temperature_low: { type: "TEMPERATURE_LOW", temperature: 18.7, movement: true, sound: "normal", occupied: true },
  stillness: { type: "STILLNESS", temperature: 24.3, movement: false, sound: "normal", occupied: true },
  crying: { type: "CRYING", temperature: 24.5, movement: true, sound: "elevated", occupied: true },
  restlessness: { type: "RESTLESSNESS", temperature: 24.3, movement: true, sound: "normal", occupied: true },
  cot_empty: { type: "COT_EMPTY", temperature: 24.3, movement: false, sound: "normal", occupied: false },
  device_offline: { type: "DEVICE_OFFLINE", temperature: 24.3, movement: true, sound: "normal", occupied: true }
};

export async function POST(request: Request, context: { params: { event: string } }) {
  if (!originAllowed(request)) return jsonError("Request origin is not allowed.", 403);
  if (!rateAllowed(`simulation:${request.headers.get("x-forwarded-for") || "unknown"}`, 20)) return jsonError("Too many requests.", 429);
  const event = context.params.event;
  try {
    const db = sql();
    if (event === "stop") {
      await db`UPDATE device_status SET simulation=false, alert_type=NULL, updated_at=now() WHERE device_id=${configuredDeviceId()}`;
      return NextResponse.json({ simulation: false, message: "Simulation stopped. Waiting for live device data." });
    }
    const item = demo[event];
    if (!item || !ALERT_TYPES.includes(item.type)) return jsonError("Unknown simulation event.", 404);
    const simulationType = event === "normal" ? null : item.type;
    await db.begin(async tx => {
      await tx`INSERT INTO device_status (device_id, temperature, movement_detected, sound_state, cot_occupied, alert_type, updated_at, device_last_seen, simulation)
        VALUES (${configuredDeviceId()}, ${item.temperature}, ${item.movement}, ${item.sound}, ${item.occupied}, ${simulationType}, now(), now() - interval '1 hour', true)
        ON CONFLICT(device_id) DO UPDATE SET temperature=EXCLUDED.temperature, movement_detected=EXCLUDED.movement_detected, sound_state=EXCLUDED.sound_state, cot_occupied=EXCLUDED.cot_occupied, alert_type=EXCLUDED.alert_type, updated_at=now(), simulation=true`;
      await tx`INSERT INTO sensor_history (device_id, temperature, movement_detected, sound_state, cot_occupied, simulation) VALUES (${configuredDeviceId()}, ${item.temperature}, ${item.movement}, ${item.sound}, ${item.occupied}, true)`;
      if (simulationType) await tx`INSERT INTO alerts (device_id, alert_type, message, severity, temperature_snapshot, movement_snapshot, cot_occupied_snapshot, simulation)
        VALUES (${configuredDeviceId()}, ${simulationType}, ${ALERT_MESSAGES[simulationType]}, ${simulationType === "DEVICE_OFFLINE" ? "connection" : "attention"}, ${item.temperature}, ${item.movement}, ${item.occupied}, true)`;
      await tx`DELETE FROM sensor_history WHERE recorded_at < now() - interval '3 days'`;
      await tx`DELETE FROM alerts WHERE timestamp < now() - interval '3 days' AND resolved=true`;
    });
    return NextResponse.json({ simulation: true, event, message: simulationType ? ALERT_MESSAGES[simulationType] : "Normal demo state" });
  } catch (error) { console.error("Simulation update failed", error); return jsonError("Simulation could not be saved. Check database configuration.", 503); }
}
