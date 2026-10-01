import { NextResponse } from "next/server";
import { configuredDeviceId, sql } from "@/lib/db";
import { jsonError } from "@/lib/http";

export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const rows = await sql()`SELECT recorded_at, temperature, simulation FROM sensor_history WHERE device_id=${configuredDeviceId()} AND recorded_at > now() - interval '3 days' ORDER BY recorded_at ASC LIMIT 600`;
    return NextResponse.json({ points: rows.map(p => ({ timestamp: p.recorded_at, temperature: Number(p.temperature), simulation: p.simulation })) });
  } catch (error) { console.error("History read failed", error); return jsonError("History is temporarily unavailable.", 503); }
}
