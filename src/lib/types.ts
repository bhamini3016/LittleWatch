export const ALERT_TYPES = ["TEMPERATURE_HIGH", "TEMPERATURE_LOW", "STILLNESS", "CRYING", "RESTLESSNESS", "COT_EMPTY", "DEVICE_OFFLINE"] as const;
export type AlertType = typeof ALERT_TYPES[number];
export type SoundState = "normal" | "elevated";

export interface DeviceStatus {
  deviceId: string;
  temperature: number;
  movementDetected: boolean;
  soundState: SoundState;
  cotOccupied: boolean;
  alertType: AlertType | null;
  updatedAt: string;
  deviceLastSeen: string;
  connected: boolean;
  simulation: boolean;
}

export interface Alert {
  id: string;
  deviceId: string;
  alertType: AlertType;
  message: string;
  severity: "attention" | "connection";
  timestamp: string;
  acknowledged: boolean;
  acknowledgedAt: string | null;
  resolved: boolean;
  resolvedAt: string | null;
  temperatureSnapshot: number | null;
  movementSnapshot: boolean | null;
  cotOccupiedSnapshot: boolean | null;
  simulation: boolean;
}
