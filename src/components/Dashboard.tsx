"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Activity, Bell, Check, ChevronDown, CircleHelp, Clock3, CloudOff, History, House, Moon, Radio, RefreshCw, ShieldCheck, Volume2, VolumeX, Waves, Wind, X } from "lucide-react";
import type { Alert, AlertType, DeviceStatus } from "@/lib/types";

const POLL_MS = 4000;
const EVENT_OPTIONS: { key: string; title: string }[] = [
  { key: "normal", title: "Normal state" }, { key: "temperature_high", title: "High temperature" },
  { key: "temperature_low", title: "Low temperature" }, { key: "stillness", title: "Prolonged stillness" },
  { key: "crying", title: "Sustained crying" }, { key: "restlessness", title: "Restless movement" },
  { key: "cot_empty", title: "Cot appears empty" }, { key: "device_offline", title: "Device offline" },
];

function timeLabel(value?: string | null) {
  if (!value) return "Waiting for first update";
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}
function dateLabel(value: string) {
  const date = new Date(value); const now = new Date();
  return date.toDateString() === now.toDateString() ? "Today" : new Intl.DateTimeFormat(undefined, { weekday: "long", month: "short", day: "numeric" }).format(date);
}
function elapsed(value: string) {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  return seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}
const titleFor: Record<AlertType, string> = {
  TEMPERATURE_HIGH: "Temperature", TEMPERATURE_LOW: "Temperature", STILLNESS: "No movement detected", CRYING: "Potential distress detected",
  RESTLESSNESS: "Restless movement detected", COT_EMPTY: "Cot appears unoccupied", DEVICE_OFFLINE: "Device connection lost"
};

export default function Dashboard() {
  const [status, setStatus] = useState<DeviceStatus | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [history, setHistory] = useState<{ timestamp: string; temperature: number; simulation: boolean }[]>([]);
  const [backendError, setBackendError] = useState("");
  const [loading, setLoading] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const [simulationOpen, setSimulationOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [clock, setClock] = useState(Date.now());
  const knownIds = useRef<Set<string> | null>(null);

  const refresh = useCallback(async () => {
    if (document.visibilityState !== "visible") return;
    try {
      const [s, a, h] = await Promise.all([fetch("/api/status", { cache: "no-store" }), fetch("/api/alerts", { cache: "no-store" }), fetch("/api/history", { cache: "no-store" })]);
      if (!s.ok || !a.ok || !h.ok) throw new Error("The dashboard service is temporarily unavailable.");
      const sd = await s.json(); const ad = await a.json(); const hd = await h.json();
      setStatus(sd.status); setAlerts(ad.alerts || []); setHistory(hd.points || []); setBackendError("");
      const nextIds = new Set<string>((ad.alerts || []).filter((alert: Alert) => !alert.resolved).map((alert: Alert) => String(alert.id)));
      if (knownIds.current && soundEnabled && [...nextIds].some(id => !knownIds.current!.has(id))) playAlert();
      knownIds.current = nextIds;
    } catch (error) { setBackendError(error instanceof Error ? error.message : "The dashboard service is unavailable."); }
    finally { setLoading(false); }
  }, [soundEnabled]);

  useEffect(() => {
    const saved = window.localStorage.getItem("littlewatch-sound-enabled") === "true";
    setSoundEnabled(saved);
    void refresh();
    const poll = window.setInterval(() => void refresh(), POLL_MS);
    const tick = window.setInterval(() => setClock(Date.now()), 1000);
    const visible = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", visible);
    return () => { window.clearInterval(poll); window.clearInterval(tick); document.removeEventListener("visibilitychange", visible); };
  }, [refresh]);

  function playAlert() {
    try {
      const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) throw new Error("Audio is unavailable");
      const context = new AudioContextClass();
      const now = context.currentTime;
      [0, 0.22].forEach((offset, index) => {
        const oscillator = context.createOscillator(); const gain = context.createGain();
        oscillator.type = "sine"; oscillator.frequency.value = index ? 880 : 660;
        gain.gain.setValueAtTime(0.001, now + offset); gain.gain.exponentialRampToValueAtTime(0.16, now + offset + 0.025); gain.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.16);
        oscillator.connect(gain); gain.connect(context.destination); oscillator.start(now + offset); oscillator.stop(now + offset + 0.18);
      });
      window.setTimeout(() => void context.close(), 700); setSoundBlocked(false);
    } catch { setSoundBlocked(true); }
  }
  async function toggleSound() {
    if (soundEnabled) { window.localStorage.setItem("littlewatch-sound-enabled", "false"); setSoundEnabled(false); return; }
    try {
      const Ctx = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) throw new Error("Unavailable");
      const context = new Ctx(); await context.resume(); await context.close();
      window.localStorage.setItem("littlewatch-sound-enabled", "true"); setSoundEnabled(true); setSoundBlocked(false);
    } catch { setSoundBlocked(true); }
  }
  async function runAction(url: string, method = "POST") {
    setBusy(true);
    try { const res = await fetch(url, { method }); if (!res.ok) { const body = await res.json().catch(() => ({})); throw new Error(body.error || "Action could not be completed."); } await refresh(); }
    catch (error) { setBackendError(error instanceof Error ? error.message : "Action could not be completed."); }
    finally { setBusy(false); }
  }
  async function simulate(event: string) { await runAction(`/api/simulation/${event}`); setSimulationOpen(false); }

  const activeAlerts = alerts.filter(alert => !alert.resolved);
  const offline = status ? !status.connected : false;
  const isDemo = Boolean(status?.simulation);
  const topAlert = activeAlerts[0];
  const connectionAlert = topAlert?.alertType === "DEVICE_OFFLINE";
  const connectionIssue = offline || Boolean(connectionAlert);
  const serious = Boolean(topAlert && !connectionAlert);
  const temperatureLabel = status ? status.temperature < 20 ? "Below preferred range" : status.temperature > 26 ? "Above preferred range" : "Comfortable" : "No reading yet";
  const groupedAlerts = useMemo(() => {
    const groups = new Map<string, Alert[]>();
    alerts.forEach(alert => { const key = dateLabel(alert.timestamp); groups.set(key, [...(groups.get(key) || []), alert]); });
    return [...groups.entries()];
  }, [alerts]);

  return <main className={`app-shell ${serious ? "has-alert" : ""}`}>
    <div className="ambient ambient-one" aria-hidden="true"/><div className="ambient ambient-two" aria-hidden="true"/>
    <header className="topbar">
      <a className="brand" href="#top" aria-label="LittleWatch home"><span className="brand-mark"><Moon size={19} strokeWidth={1.7}/></span><span><strong>LittleWatch</strong><small>Quietly watching. Ready when needed.</small></span></a>
      <div className="top-actions">
        <div className={`connection-pill ${offline ? "offline" : status?.connected ? "online" : "waiting"}`}><span className="connection-dot"/><span>{offline ? "Device connection lost" : status?.connected ? "Device connected" : "Waiting for device"}</span></div>
        <button className={`sound-button ${soundEnabled ? "is-on" : ""}`} onClick={toggleSound} aria-pressed={soundEnabled} title={soundEnabled ? "Mute sound alerts" : "Enable sound alerts"}>{soundEnabled ? <Volume2 size={16}/> : <VolumeX size={16}/>}<span>{soundEnabled ? "Sound on" : "Enable sound"}</span></button>
        <div className="menu-wrap"><button className="simulation-trigger" onClick={() => setSimulationOpen(!simulationOpen)} aria-expanded={simulationOpen}><span className={`sim-indicator ${isDemo ? "active" : ""}`}/><span>Simulation</span><ChevronDown size={14}/></button>
          {simulationOpen && <div className="simulation-menu"><div className="menu-heading"><strong>Demonstration controls</strong><span>Events are saved as simulated.</span></div>{EVENT_OPTIONS.map(option => <button key={option.key} disabled={busy} onClick={() => void simulate(option.key)}>{option.title}</button>)}<button className="return-live" disabled={busy} onClick={() => void runAction("/api/simulation/stop")}>Return to live hardware</button></div>}
        </div>
      </div>
    </header>
    <section id="top" className="page-intro"><div><div className="eyebrow"><span className="eyebrow-line"/> NURSERY · ONE DEVICE</div><h1>A little peace of mind.</h1><p>A quiet view of the room, ready to let you know when something needs your attention.</p></div><div className="updated"><Clock3 size={14}/><span>Updated {status ? timeLabel(status.updatedAt) : "—"}</span><button aria-label="Refresh dashboard" onClick={() => void refresh()}><RefreshCw size={14}/></button></div></section>

    {isDemo && <div className="simulation-banner" role="status"><Radio size={17}/><div><strong>SIMULATION MODE</strong><span>These readings and events are simulated for demonstration.</span></div><button onClick={() => void runAction("/api/simulation/stop")}>Return to live hardware</button></div>}
    {offline && <div className="offline-banner" role="status"><CloudOff size={18}/><div><strong>Device connection lost</strong><span>We haven’t received a recent update from the nursery monitor. Check the device and its network connection.</span></div></div>}
    {backendError && <div className="service-banner" role="alert"><CircleHelp size={17}/><span>{backendError} Confirm the database is configured and try again.</span><button onClick={() => void refresh()}>Retry</button></div>}
    {soundBlocked && <div className="sound-note" role="status">Sound alerts could not start in this browser. Tap “Enable sound” after interacting with the page.</div>}

    <section className={`hero-status ${serious ? "alert-status" : ""}`} aria-live="polite" aria-atomic="true">
      <div className="hero-orbit" aria-hidden="true"><span/><span/><span/><div className="hero-icon">{serious ? <Bell size={24}/> : offline ? <CloudOff size={25}/> : <Moon size={24}/>}</div></div>
      <div className="hero-copy"><div className={`state-label ${serious ? "alert-label" : ""}`}><span className="state-dot"/>{serious ? "NEEDS YOUR ATTENTION" : offline ? "CONNECTION ISSUE" : loading ? "CONNECTING" : "MONITORING"}</div>
        <h2>{serious ? titleFor[topAlert!.alertType] : connectionIssue ? "Device connection lost" : status ? "Nursery is calm" : "Waiting for the first update"}</h2>
        <p>{serious ? topAlert!.message : connectionIssue ? "The monitor hasn’t checked in recently. This is a device connection issue, not an infant distress alert." : status ? "Everything looks normal. Your room monitor is quietly checking in." : backendError ? "The dashboard could not reach its data service." : "Once the device sends its first update, its room status will appear here."}</p>
      </div>
      <div className="hero-side"><div className="hero-side-icon"><ShieldCheck size={18}/></div><span>Caregiver check-in</span><small>{topAlert ? "Please check the nursery" : offline ? "Check the monitor connection" : "No action needed"}</small></div>
    </section>

    {topAlert && <section className="alert-detail" aria-label={connectionAlert ? "Active connection alert" : "Active alert"}><div className="alert-detail-head"><div><span className="alert-kicker"><span/> {connectionAlert ? "CONNECTION ALERT" : "ACTIVE ALERT"}</span><h3>{topAlert.message}</h3><p>{titleFor[topAlert.alertType]} · {dateLabel(topAlert.timestamp)} at {timeLabel(topAlert.timestamp)}</p></div><span className="alert-duration"><Clock3 size={14}/> {elapsed(topAlert.timestamp)}</span></div><div className="snapshot-grid"><div><span>ROOM</span><strong>{topAlert.temperatureSnapshot !== null ? `${topAlert.temperatureSnapshot.toFixed(1)}°C` : "—"}</strong></div><div><span>MOVEMENT</span><strong>{topAlert.movementSnapshot === null ? "—" : topAlert.movementSnapshot ? "Detected recently" : "Not detected"}</strong></div><div><span>COT</span><strong>{topAlert.cotOccupiedSnapshot === null ? "—" : topAlert.cotOccupiedSnapshot ? "Occupied" : "Appears empty"}</strong></div></div><div className="alert-actions"><span>{topAlert.acknowledged ? <><Check size={14}/> Acknowledged {topAlert.acknowledgedAt ? `at ${timeLabel(topAlert.acknowledgedAt)}` : ""}</> : connectionAlert ? "Check the monitor connection." : "Please check your little one."}</span><div>{!topAlert.acknowledged && <button className="ack-button" disabled={busy} onClick={() => void runAction(`/api/alerts/${topAlert.id}/acknowledge`)}>Acknowledge</button>}<button className="resolve-button" disabled={busy} onClick={() => void runAction(`/api/alerts/${topAlert.id}/resolve`)}>Resolve</button></div></div></section>}

    <section className="status-section" aria-label="Current nursery status"><div className="section-heading"><div><span className="section-eyebrow">AT A GLANCE</span><h2>Nursery status</h2></div><span className="live-caption"><span/> LIVE STATUS</span></div><div className="status-grid">
      <article className="status-card temperature-card"><div className="card-top"><span className="card-icon temp-icon"><Waves size={17}/></span><span className="card-overline">ROOM</span></div><strong className="card-value">{status ? `${status.temperature.toFixed(1)}°C` : "—"}</strong><span className={`card-caption ${status && (status.temperature < 20 || status.temperature > 26) ? "warm-caption" : ""}`}>{temperatureLabel}</span><div className="temp-range" aria-label="Preferred temperature range from 20 to 26 degrees"><span/><i style={{ left: `${Math.min(96, Math.max(4, status ? ((status.temperature - 16) / 16) * 100 : 50))}%` }}/></div><div className="range-labels"><span>20°</span><span>Preferred range</span><span>26°</span></div></article>
      <StatusCard icon={<Wind size={17}/>} color="movement-icon" label="MOVEMENT" value={status ? status.movementDetected ? "Detected recently" : "Not detected" : "Waiting for update"} caption={status ? status.movementDetected ? "Activity noticed" : "No recent movement" : "—"}/>
      <StatusCard icon={<House size={17}/>} color="cot-icon" label="COT" value={status ? status.cotOccupied ? "Occupied" : "Appears empty" : "Waiting for update"} caption={status ? status.cotOccupied ? "Occupancy detected" : "Check the nursery" : "—"}/>
      <StatusCard icon={<Activity size={17}/>} color="sound-icon" label="SOUND" value={status ? status.soundState === "elevated" ? "Elevated" : "Normal" : "Waiting for update"} caption={status ? status.soundState === "elevated" ? "Louder sound noticed" : "Quiet room" : "—"}/>
      <StatusCard icon={offline ? <CloudOff size={17}/> : <Radio size={17}/>} color="system-icon" label="SYSTEM" value={offline ? "Connection lost" : status?.connected ? "Connected" : status ? "Waiting for device" : "Not connected"} caption={status ? `Last check-in ${elapsed(status.deviceLastSeen)} ago` : "Check your device setup"}/>
    </div></section>

    <section className="lower-grid"><div className="panel history-panel" id="history"><div className="panel-heading"><div><span className="section-eyebrow">RECENT ACTIVITY</span><h2><History size={17}/> Alert history</h2></div><span className="period-tag">LAST 3 DAYS</span></div>{groupedAlerts.length ? <div className="timeline">{groupedAlerts.map(([day, dayAlerts]) => <div className="timeline-day" key={day}><div className="day-label">{day}</div>{dayAlerts.map(alert => <div className="timeline-event" key={alert.id}><div className={`timeline-mark ${alert.resolved ? "resolved" : "unresolved"}`}/><div className="event-main"><div className="event-title-row"><strong>{titleFor[alert.alertType]}</strong><span className={`event-status ${alert.resolved ? "done" : "pending"}`}>{alert.resolved ? "Resolved" : alert.acknowledged ? "Acknowledged" : "Needs attention"}</span></div><p>{alert.message}</p><div className="event-meta">{timeLabel(alert.timestamp)}{alert.simulation && <span className="demo-tag">SIMULATED</span>}</div></div></div>)}</div>)}</div> : <div className="empty-state"><span className="empty-icon"><Check size={19}/></span><strong>No alerts in the last 3 days</strong><p>When something needs a caregiver’s attention, it will appear here.</p></div>}</div>
      <div className="panel chart-panel"><div className="panel-heading"><div><span className="section-eyebrow">ROOM TEMPERATURE</span><h2>Recent readings</h2></div><span className="period-tag">3 DAYS</span></div><div className="chart-wrap">{history.length > 1 ? <TemperatureChart points={history}/> : <div className="chart-empty"><span><Waves size={20}/></span><p>Temperature history will appear here<br/>as the monitor checks in.</p></div>}</div><div className="chart-foot"><span><i/> Room temperature</span><span>{history.length} readings</span></div></div></section>

    <footer className="footer"><span><Moon size={13}/> LittleWatch</span><p>For caregiver awareness only. Not a medical diagnostic system.</p><span>Updated {new Date(clock).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}</span></footer>
  </main>;
}

function StatusCard({ icon, color, label, value, caption }: { icon: React.ReactNode; color: string; label: string; value: string; caption: string }) {
  return <article className="status-card"><div className="card-top"><span className={`card-icon ${color}`}>{icon}</span><span className="card-overline">{label}</span></div><strong className="card-value text-value">{value}</strong><span className="card-caption">{caption}</span></article>;
}

function TemperatureChart({ points }: { points: { timestamp: string; temperature: number }[] }) {
  const width = 500; const height = 146; const values = points.map(point => point.temperature);
  const min = Math.min(16, ...values) - 1; const max = Math.max(30, ...values) + 1;
  const xy = points.map((point, index) => ({ x: 12 + (index / (points.length - 1)) * (width - 24), y: 8 + ((max - point.temperature) / (max - min)) * (height - 18) }));
  const line = xy.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
  return <svg className="chart-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Temperature readings over three days, ranging from ${Math.min(...values).toFixed(1)} to ${Math.max(...values).toFixed(1)} degrees Celsius`}><line x1="12" x2={width - 12} y1={height * .33} y2={height * .33} className="chart-gridline"/><line x1="12" x2={width - 12} y1={height * .66} y2={height * .66} className="chart-gridline"/><path d={line} className="chart-line"/><circle cx={xy[xy.length - 1].x} cy={xy[xy.length - 1].y} r="4" className="chart-dot"/><text x="12" y={height - 1}>{min.toFixed(0)}°</text><text x="12" y="15">{max.toFixed(0)}°</text></svg>;
}
