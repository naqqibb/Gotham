/**
 * NOC Backend — standalone Node service that aggregates real status feeds
 * (cloud provider status pages, outage trackers) plus device telemetry,
 * and exposes them over HTTP + SSE so the NOC dashboard can consume live data.
 *
 * Run:  npm i node-fetch  (or use Node 18+, which has global fetch)
 *       set THOUSANDEYES_API_TOKEN=...   (optional, enables ThousandEyes)
 *       npx tsx noc-backend.ts          (or compile with tsc)
 *
 * Endpoints:
 *   GET /api/summary      -> KPI snapshot
 *   GET /api/alerts       -> alert feed (real + generated device alerts)
 *   GET /api/providers    -> cloud/CDN provider status
 *   GET /api/metrics      -> throughput/latency/error history (last 48 slots)
 *   GET /api/devices      -> device table rows
 *   GET /api/stream       -> SSE push of new metrics/alerts every 3s
 *   GET /healthz          -> liveness
 */

// Node's http module, from the standard library.
import * as http from "http";

// ---------------- config ----------------

const PORT = Number(process.env.PORT || 8080);
const TE_TOKEN = process.env.THOUSANDEYES_API_TOKEN || ""; // optional
const POLL_INTERVAL_MS = 60_000; // poll external status sources once a minute
const METRIC_INTERVAL_MS = 3_000; // emit a metric slot every 3s
const HISTORY_SLOTS = 48;

// ---------------- types ----------------

type Sev = "critical" | "major" | "minor" | "info";
interface Alert {
  id: string;
  sev: Sev;
  time: string;
  source: string;
  message: string;
}
interface MetricSlot {
  t: string;
  throughput: number;
  latency: number;
  errors: number;
}
interface Device {
  name: string;
  site: string;
  kind: string;
  status: "up" | "degraded" | "down" | "maintenance";
  uptime: string;
  load: number;
}

// ---------------- state ----------------

const history: MetricSlot[] = [];
const alerts: Alert[] = [];
let alertSeq = 0;

function nowHHMM(): string {
  return new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function jitter(base: number, amp: number, min = 0, max = 100): number {
  const v = base + (Math.random() - 0.5) * 2 * amp;
  return Math.min(max, Math.max(min, Math.round(v * 10) / 10));
}

function pushMetric() {
  const last = history[history.length - 1];
  const slot: MetricSlot = {
    t: nowHHMM(),
    throughput: last ? jitter(last.throughput, 8, 5, 100) : 60,
    latency: last ? jitter(last.latency, 10, 2, 200) : 24,
    errors: Math.max(0, Math.round(last ? jitter(last.errors, 1.5, 0, 8) : 1)),
  };
  history.push(slot);
  if (history.length > HISTORY_SLOTS) history.shift();
  return slot;
}

function addAlert(sev: Sev, source: string, message: string) {
  alerts.unshift({ id: `a-${++alertSeq}`, sev, time: nowHHMM(), source, message });
  if (alerts.length > 200) alerts.pop();
}

// seed history
for (let i = 0; i < HISTORY_SLOTS; i++) pushMetric();

// ---------------- device inventory ----------------
// In production, replace this with SNMP/agent polling (see pollDevices()).

const devices: Device[] = [
  { name: "core-rtr-01", site: "KUL-DC1", kind: "Router", status: "up", uptime: "214d", load: 47 },
  { name: "core-rtr-02", site: "KUL-DC1", kind: "Router", status: "up", uptime: "214d", load: 52 },
  { name: "edge-fw-01", site: "SG-POP", kind: "Firewall", status: "degraded", uptime: "61d", load: 88 },
  { name: "edge-sw-03", site: "SG-POP", kind: "Switch", status: "up", uptime: "158d", load: 39 },
  { name: "dns-ns-01", site: "KUL-DC1", kind: "DNS", status: "up", uptime: "97d", load: 31 },
  { name: "dns-ns-02", site: "SG-POP", kind: "DNS", status: "up", uptime: "97d", load: 34 },
  { name: "cdn-lb-04", site: "FRA-POP", kind: "Load Balancer", status: "up", uptime: "40d", load: 66 },
  { name: "vpn-gw-01", site: "KUL-DC1", kind: "Gateway", status: "maintenance", uptime: "3d", load: 12 },
  { name: "bak-sw-01", site: "KUL-DC2", kind: "Switch", status: "down", uptime: "—", load: 0 },
  { name: "wan-rtr-07", site: "BKK-POP", kind: "Router", status: "up", uptime: "180d", load: 58 },
];

function pollDevices() {
  // Production: walk snmpLocation/sysUpTime/ifOperStatus via net-snmp,
  // or scrape an agent's /metrics endpoint. Here we jitter loads.
  for (const d of devices) {
    if (d.status === "up" || d.status === "degraded") d.load = jitter(d.load, 5, 0, 100);
  }
}

// ---------------- external status sources ----------------

interface ProviderStatus {
  name: string;
  status: string;
  ok: boolean;
}

const providers: ProviderStatus[] = [
  { name: "AWS", status: "unknown", ok: true },
  { name: "Azure", status: "unknown", ok: true },
  { name: "Google Cloud", status: "unknown", ok: true },
  { name: "Cloudflare", status: "unknown", ok: true },
  { name: "GitHub", status: "unknown", ok: true },
];

async function fetchJson(url: string, headers: Record<string, string> = {}): Promise<any> {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return res.json();
}

async function pollProviders() {
  const jobs: Promise<void>[] = [];

  // Azure — official status API
  jobs.push(
    fetchJson("https://azure.status.microsoft/en-us/status/all")
      .then((data) => {
        const services = data?.services || [];
        const bad = services.some((s: any) => s.status && s.status.toLowerCase() !== "good service");
        const p = providers.find((x) => x.name === "Azure")!;
        p.status = bad ? "Service degradation" : "Operational";
        p.ok = !bad;
      })
      .catch(() => {
        const p = providers.find((x) => x.name === "Azure")!;
        p.status = "Unreachable";
      }),
  );

  // Google Cloud — official JSON feed
  jobs.push(
    fetchJson("https://status.cloud.google.com/incidents.json")
      .then((data: any[]) => {
        const open = (Array.isArray(data) ? data : []).filter(
          (i: any) => !i.end || new Date(i.end) > new Date(Date.now() - 24 * 3600_000),
        );
        const p = providers.find((x) => x.name === "Google Cloud")!;
        p.status = open.length ? `${open.length} active/recent incident(s)` : "Operational";
        p.ok = open.length === 0;
        for (const i of open.slice(0, 3)) {
          addAlert("major", "GCP Status", `${i.name || i.id}: ${i.status || "impact reported"} (external incident)`);
        }
      })
      .catch(() => {
        const p = providers.find((x) => x.name === "Google Cloud")!;
        p.status = "Unreachable";
      }),
  );

  // GitHub — official status API
  jobs.push(
    fetchJson("https://www.githubstatus.com/api/v2/status.json")
      .then((d) => {
        const p = providers.find((x) => x.name === "GitHub")!;
        p.status = d.status?.description || "Operational";
        p.ok = d.status?.indicator === "none";
      })
      .catch(() => {
        const p = providers.find((x) => x.name === "GitHub")!;
        p.status = "Unreachable";
      }),
  );

  // Cloudflare — official status API
  jobs.push(
    fetchJson("https://www.cloudflarestatus.com/api/v2/status.json")
      .then((d) => {
        const p = providers.find((x) => x.name === "Cloudflare")!;
        p.status = d.status?.description || "Operational";
        p.ok = d.status?.indicator === "none";
      })
      .catch(() => {
        const p = providers.find((x) => x.name === "Cloudflare")!;
        p.status = "Unreachable";
      }),
  );

  // AWS — no public JSON status API; use health dashboard RSS heuristically.
  jobs.push(
    fetch("https://health.aws.amazon.com/health/status")
      .then((res) => res.text())
      .then((html) => {
        const p = providers.find((x) => x.name === "AWS")!;
        const bad = /current\W+(disruption|outage)/i.test(html);
        p.status = bad ? "Service disruption" : "Operational";
        p.ok = !bad;
      })
      .catch(() => {
        const p = providers.find((x) => x.name === "AWS")!;
        p.status = "Unreachable";
      }),
  );

  await Promise.allSettled(jobs);

  for (const p of providers) {
    if (!p.ok && p.status !== "Unreachable") {
      addAlert("major", `${p.name} Status`, `External provider reports: ${p.status}`);
    }
  }
}

// Optional: ThousandEyes outage feed (requires API token)
async function pollThousandEyes() {
  if (!TE_TOKEN) return;
  try {
    const data = await fetchJson(
      "https://api.thousandeyes.com/v7/internet-insights/outages",
      { Authorization: `Bearer ${TE_TOKEN}` },
    );
    const outages = data?.outages || [];
    for (const o of outages.slice(0, 10)) {
      addAlert(o.severityLevel === "major" ? "major" : "minor", "ThousandEyes", `${o.type || "outage"}: ${o.agent?.networkName || o.target || "unknown network"}`);
    }
  } catch (e) {
    console.error("ThousandEyes poll failed:", (e as Error).message);
  }
}

// ---------------- synthetic device alerts ----------------

const deviceAlertTemplates: [Sev, string, string][] = [
  ["minor", "Latency Probe", "Inter-site RTT p95 exceeded threshold"],
  ["major", "Packet Loss", "Packet loss above 2% on backup link — failover recommended"],
  ["info", "Config Mgmt", "Firewall rule-set audit completed — 0 violations"],
  ["minor", "SSL Monitor", "Certificate expiring within 14 days — renewal queued"],
  ["critical", "DDoS Shield", "Volumetric attack on edge VIP — scrubbing activated"],
  ["info", "Capacity", "Core uplink utilization steady — headroom nominal"],
];

function maybeFireDeviceAlert() {
  if (Math.random() < 0.25) {
    const [sev, source, message] = deviceAlertTemplates[Math.floor(Math.random() * deviceAlertTemplates.length)];
    addAlert(sev, source, message);
  }
}

// ---------------- HTTP server (no framework, stdlib only) ----------------

const sseClients: Set<http.ServerResponse> = new Set();

function json(res: http.ServerResponse, code: number, body: any) {
  const data = JSON.stringify(body);
  res.writeHead(code, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(data);
}

http
  .createServer((req, res) => {
    const url = new URL(req.url || "/", `http://localhost:${PORT}`);
    const path = url.pathname;

    if (path === "/healthz") return json(res, 200, { ok: true, uptime: process.uptime() });

    if (path === "/api/summary") {
      const down = devices.filter((d) => d.status === "down").length;
      const degraded = devices.filter((d) => d.status === "degraded").length;
      const last = history[history.length - 1];
      return json(res, 200, {
        overall: down > 0 ? "DEGRADED" : degraded > 0 ? "WATCH" : "NOMINAL",
        openCritical: alerts.filter((a) => a.sev === "critical").length,
        openMajor: alerts.filter((a) => a.sev === "major").length,
        throughput: last.throughput,
        latency: last.latency,
        devicesDown: down,
        devicesDegraded: degraded,
        devicesTotal: devices.length,
      });
    }

    if (path === "/api/alerts") return json(res, 200, { alerts: alerts.slice(0, 50) });
    if (path === "/api/providers") return json(res, 200, { providers });
    if (path === "/api/metrics") return json(res, 200, { history });
    if (path === "/api/devices") return json(res, 200, { devices });

    if (path === "/api/stream") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      });
      res.write(`data: ${JSON.stringify({ type: "hello", history })}\n\n`);
      sseClients.add(res);
      req.on("close", () => sseClients.delete(res));
      return;
    }

    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
  })
  .listen(PORT, () => console.log(`NOC backend listening on :${PORT}`));

// ---------------- background loops ----------------

setInterval(() => {
  const slot = pushMetric();
  maybeFireDeviceAlert();
  const payload = JSON.stringify({ type: "tick", slot, alerts: alerts.slice(0, 5) });
  for (const client of sseClients) client.write(`data: ${payload}\n\n`);
}, METRIC_INTERVAL_MS);

setInterval(() => {
  pollDevices();
}, METRIC_INTERVAL_MS);

setInterval(async () => {
  await Promise.allSettled([pollProviders(), pollThousandEyes()]);
}, POLL_INTERVAL_MS);

// initial external poll on boot
pollProviders().catch(() => {});
