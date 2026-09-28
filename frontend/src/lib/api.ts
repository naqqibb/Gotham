/**
 * Typed client for the NOC backend (../backend/noc-backend.ts).
 *
 * The backend base URL comes from the VITE_API_BASE env var (see .env.example).
 * When it is unset/empty, LIVE is false and the dashboard runs on its built-in
 * seeded simulation instead of calling any backend.
 */

export type Sev = "critical" | "major" | "minor" | "info";

export interface Alert {
  id: string;
  sev: Sev;
  time: string;
  source: string;
  message: string;
}

export interface MetricSlot {
  t: string;
  throughput: number;
  latency: number;
  errors: number;
}

export interface Device {
  name: string;
  site: string;
  kind: string;
  status: "up" | "degraded" | "down" | "maintenance";
  uptime: string;
  load: number;
}

export interface Provider {
  name: string;
  status: string;
  ok?: boolean;
}

export const API_BASE = (import.meta.env.VITE_API_BASE ?? "").replace(/\/$/, "");
export const LIVE = API_BASE !== "";

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

export const getMetrics = () => getJson<{ history: MetricSlot[] }>("/api/metrics").then((d) => d.history);
export const getAlerts = () => getJson<{ alerts: Alert[] }>("/api/alerts").then((d) => d.alerts);
export const getProviders = () => getJson<{ providers: Provider[] }>("/api/providers").then((d) => d.providers);
export const getDevices = () => getJson<{ devices: Device[] }>("/api/devices").then((d) => d.devices);

interface StreamHandlers {
  onSlot?: (slot: MetricSlot) => void;
  onHello?: (history: MetricSlot[]) => void;
}

/**
 * Subscribe to the backend SSE stream. Returns the EventSource (so the caller
 * can close it) or null when LIVE is false.
 */
export function openStream(handlers: StreamHandlers): EventSource | null {
  if (!LIVE) return null;
  const es = new EventSource(`${API_BASE}/api/stream`);
  es.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.type === "hello" && Array.isArray(msg.history)) handlers.onHello?.(msg.history);
      else if (msg.type === "tick" && msg.slot) handlers.onSlot?.(msg.slot);
    } catch {
      /* ignore malformed frames */
    }
  };
  return es;
}
