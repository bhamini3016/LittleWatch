CREATE TABLE IF NOT EXISTS device_status (
  id BIGSERIAL PRIMARY KEY,
  device_id TEXT NOT NULL UNIQUE,
  temperature DOUBLE PRECISION NOT NULL,
  movement_detected BOOLEAN NOT NULL,
  sound_state TEXT NOT NULL CHECK (sound_state IN ('normal', 'elevated')),
  sound_level DOUBLE PRECISION,
  cot_occupied BOOLEAN NOT NULL,
  alert_type TEXT CHECK (alert_type IN ('TEMPERATURE_HIGH','TEMPERATURE_LOW','STILLNESS','CRYING','RESTLESSNESS','COT_EMPTY','DEVICE_OFFLINE')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  device_last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  simulation BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE IF NOT EXISTS alerts (
  id BIGSERIAL PRIMARY KEY,
  device_id TEXT NOT NULL,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('TEMPERATURE_HIGH','TEMPERATURE_LOW','STILLNESS','CRYING','RESTLESSNESS','COT_EMPTY','DEVICE_OFFLINE')),
  message TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('attention','connection')),
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged BOOLEAN NOT NULL DEFAULT false,
  acknowledged_at TIMESTAMPTZ,
  resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMPTZ,
  temperature_snapshot DOUBLE PRECISION,
  movement_snapshot BOOLEAN,
  cot_occupied_snapshot BOOLEAN,
  simulation BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS alerts_device_timestamp_idx ON alerts (device_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS alerts_active_idx ON alerts (device_id, resolved, timestamp DESC);

CREATE TABLE IF NOT EXISTS sensor_history (
  id BIGSERIAL PRIMARY KEY,
  device_id TEXT NOT NULL,
  temperature DOUBLE PRECISION NOT NULL,
  movement_detected BOOLEAN NOT NULL,
  sound_state TEXT NOT NULL CHECK (sound_state IN ('normal','elevated')),
  cot_occupied BOOLEAN NOT NULL,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  simulation BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS sensor_history_device_time_idx ON sensor_history (device_id, recorded_at DESC);
