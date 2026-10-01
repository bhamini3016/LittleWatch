import { z } from "zod";
import { ALERT_TYPES } from "@/lib/types";

export const devicePayloadSchema = z.object({
  deviceId: z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/),
  temperature: z.number().finite().min(-20).max(80),
  movement: z.boolean(),
  soundLevel: z.number().finite().min(0).max(10000).optional(),
  soundState: z.enum(["normal", "elevated"]).optional(),
  cotOccupied: z.boolean(),
  alert: z.object({ type: z.enum(ALERT_TYPES), message: z.string().trim().min(1).max(180).optional() }).nullable().optional()
}).strict();

export const ALERT_MESSAGES: Record<(typeof ALERT_TYPES)[number], string> = {
  TEMPERATURE_HIGH: "Room temperature is above the preferred range.",
  TEMPERATURE_LOW: "Room temperature is below the preferred range.",
  STILLNESS: "No movement detected for an extended period.",
  CRYING: "Sustained crying detected.",
  RESTLESSNESS: "Restless movement detected.",
  COT_EMPTY: "The cot appears to be unoccupied.",
  DEVICE_OFFLINE: "The monitoring device connection was lost."
};
