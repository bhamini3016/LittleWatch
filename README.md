# LittleWatch

A single nursery monitoring dashboard for the STM32F401 + ESP-01 university project. It uses a Next.js frontend and serverless API routes, PostgreSQL (Neon recommended), and polling. It is for caregiver awareness; it is not a medical diagnostic system.

## What is included

- Responsive parent-facing dashboard, accessible alert and connection states, three-day alert history, and a small temperature history chart.
- PostgreSQL persistence for device status, alert lifecycle, and useful sensor history.
- Authenticated device ingestion endpoint with strict payload validation and a server-only API key.
- A clearly labeled simulation panel for normal readings and each demonstration event. Simulated records are marked in storage/history.
- A short browser-generated sound on a newly observed alert, enabled only after caregiver interaction.
- Vercel configuration and a database migration.

## Local setup

Requirements: Node.js 20 or newer and a PostgreSQL database. Neon is the recommended hosted option.

1. Copy `.env.example` to `.env.local` and set `DATABASE_URL` and a long random `DEVICE_API_KEY`. Optionally set `DEVICE_ID` (defaults to `nursery-01`) and `DEVICE_OFFLINE_SECONDS` (defaults to 30).
2. Install dependencies with `npm install`.
3. Apply the schema with `npm run db:migrate`.
4. Start the app with `npm run dev` and open `http://localhost:3000`.
5. For demo-only use, open Simulation in the header and select an event. Choose **Return to live hardware** to leave simulation mode. The dashboard never inserts sample readings unless the simulation control is used.

Run `npm run typecheck`, `npm run lint`, and `npm run build` before deployment.

## Vercel deployment

1. Push the project to a Git provider and import it into Vercel as a Next.js app.
2. Create a Neon PostgreSQL database (or use the Vercel Marketplace Neon integration) and copy the pooled PostgreSQL connection string.
3. Set `DATABASE_URL`, `DEVICE_API_KEY`, and optionally `DEVICE_ID` and `DEVICE_OFFLINE_SECONDS` in Vercel Project Settings → Environment Variables. Never prefix the device key with `NEXT_PUBLIC_`.
4. Run `npm run db:migrate` once against the production `DATABASE_URL` from a trusted development environment, or use the Neon SQL editor with `migrations/001_initial.sql`.
5. Deploy. Vercel builds with `npm run build`; the app uses the Node.js runtime for PostgreSQL API routes.

The default offline threshold is 30 seconds. Choose an interval longer than the device's normal reporting period plus likely network jitter. `ALLOWED_ORIGINS` is optional; it affects browser-origin mutation endpoints only. Device ingestion is authenticated independently.

## API reference

All times are ISO timestamps. API error responses use `{ "error": "..." }`; malformed device payloads also include Zod validation details.

### `POST /api/device/data`

ESP-01 to Vercel ingestion. Send `Content-Type: application/json` and `X-Device-Api-Key: <DEVICE_API_KEY>`. The exact secret is configured only on the server and the ESP-01.

Normal request:

```http
POST /api/device/data
Content-Type: application/json
X-Device-Api-Key: <secret>
```

```json
{
  "deviceId": "nursery-01",
  "temperature": 24.3,
  "movement": true,
  "soundLevel": 310,
  "cotOccupied": true,
  "alert": null
}
```

Alert request:

```json
{
  "deviceId": "nursery-01",
  "temperature": 24.5,
  "movement": true,
  "soundLevel": 680,
  "cotOccupied": true,
  "alert": { "type": "CRYING", "message": "Sustained crying detected" }
}
```

Allowed alert types are `TEMPERATURE_HIGH`, `TEMPERATURE_LOW`, `STILLNESS`, `CRYING`, `RESTLESSNESS`, `COT_EMPTY`, and `DEVICE_OFFLINE`. The message is optional and limited to 180 characters. `soundLevel` is optional; when provided, 600 is used as the presentation-only cutoff for “Elevated” unless `soundState` is sent explicitly. Firmware remains responsible for event detection. The server accepts finite temperatures from -20°C to 80°C as sensor plausibility validation, not as safety thresholds. Success returns `202`-style acknowledgement with `{ "accepted": true, "deviceId": "nursery-01", "receivedAt": "..." }` (HTTP 200). Errors: 400 invalid JSON/schema, 401 bad key, 403 unrecognized device, 429 rate limited, 503 missing configuration or storage failure.

### Dashboard endpoints

- `GET /api/status` → `{ status, offlineAfterSeconds }`. `status` is `null` until the first valid device report. Thereafter includes normalized room readings, `connected`, and a `simulation` flag. Offline is derived from the last device report and configured timeout.
- `GET /api/alerts?active=true` → unresolved alerts; without query returns recent alerts from the last three days (up to 100).
- `GET /api/history` → up to 600 temperature points from the last three days.
- `POST /api/alerts/{id}/acknowledge` → records caregiver acknowledgement; alert stays active.
- `POST /api/alerts/{id}/resolve` → resolves the alert and records resolution time.
- `POST /api/simulation/{event}` → explicitly create a simulated state/event. Events: `normal`, `temperature_high`, `temperature_low`, `stillness`, `crying`, `restlessness`, `cot_empty`, `device_offline`.
- `POST /api/simulation/stop` → end simulation presentation and await real hardware updates. It does not remove simulated events or history.

### Hardware contract

The embedded system determines alert conditions and sends an HTTPS POST to the Vercel origin at `/api/device/data`. Include the configured device ID and `X-Device-Api-Key`. Send the most recent snapshot each time, even without an alert; this heartbeat powers device-online status. A reasonable starting cadence is every 5–10 seconds, subject to project network/power behavior. Never send the key to the browser. Use TLS certificate verification on the ESP-01. The browser talks only to this Vercel API and never directly to the ESP-01.

## Database and retention

`migrations/001_initial.sql` creates `device_status`, `alerts`, and `sensor_history`. Device status is one row per configured device. History is retained for the dashboard's three-day window; ingestion deletes old sensor history opportunistically. Resolved alerts older than three days are also deleted during ingestion. For reliable cleanup when a device is quiet for a long time, configure a daily Vercel Cron call to an appropriately protected maintenance job or run equivalent `DELETE` statements in Neon. The current application does not expose an unauthenticated cleanup route.

## Safety and assumptions

- The app uses one configured device and has no caregiver login, per user scoping, or multi-device management, per project scope.
- Alerts prompt a caregiver check-in and make no medical diagnosis or inference.
- Firmware owns temperature confirmation and movement/sound event algorithms. Server-side range checks only reject implausible malformed sensor values.
- Browser audio requires a user gesture and is supplementary; visual alerting remains available.
- Basic in-memory API throttles are best effort per serverless instance. Use Vercel's edge protections for stronger abuse controls if the endpoint becomes public.
- `DEVICE_OFFLINE` from simulation is a connection event. Actual online/offline state is derived from heartbeats, so the frontend distinguishes connection problems from caregiver distress alerts.
