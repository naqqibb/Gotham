import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

// ---------------- data ----------------

type Sev = "critical" | "major" | "minor" | "info";

interface Alert {
  id: string;
  sev: Sev;
  time: string;
  source: string;
  message: string;
}

// Seed incidents drawn from real, publicly reported network/cloud events.
const SEED_ALERTS: Alert[] = [
  {
    id: "a1",
    sev: "critical",
    time: "00:14",
    source: "BGP Monitor",
    message: "Arelion AS1299 route withdrawal — Chicago/Boston/Newark/Dallas nodes affected, ~20 min impact window",
  },
  {
    id: "a2",
    sev: "major",
    time: "10:45",
    source: "Cloud Health",
    message: "Microsoft West US network degradation — downstream partners impacted across 15+ regions",
  },
  {
    id: "a3",
    sev: "major",
    time: "16:03",
    source: "GCP Status",
    message: "us-central1-b — multiple products experiencing network service degradation (incident 847028556)",
  },
  {
    id: "a4",
    sev: "minor",
    time: "22:08",
    source: "DNS Probe",
    message: "Elevated DNS resolution latency on CDN edge — Frankfurt POP p95 above threshold",
  },
];

const EXTRA_ALERTS: Omit<Alert, "id" | "time">[] = [
  { sev: "minor", source: "Latency Probe", message: "KUL–SIN path RTT p95 up 18% — possible congestion on Tier-1 transit" },
  { sev: "info", source: "Config Mgmt", message: "Firewall rule-set audit completed — 0 policy violations found" },
  { sev: "major", source: "Packet Loss", message: "2.4% packet loss on backup MPLS link — failover to secondary carrier recommended" },
  { sev: "info", source: "Patching", message: "Edge router firmware rollout 60% complete — no traffic impact observed" },
  { sev: "minor", source: "SSL Monitor", message: "Certificate for api.internal expires in 14 days — renewal queued" },
  { sev: "critical", source: "DDoS Shield", message: "Volumetric attack detected on edge VIP — scrubbing activated, 41 Gbps peak" },
  { sev: "info", source: "Capacity", message: "Core uplink utilization steady at 58% — headroom nominal for next 7 days" },
  { sev: "minor", source: "Uptime Bot", message: "SaaS dependency (collaboration suite) showing elevated 5xx rate from vendor side" },
];

interface Device {
  name: string;
  site: string;
  kind: string;
  status: "up" | "degraded" | "down" | "maintenance";
  uptime: string;
  load: number;
}

const DEVICES: Device[] = [
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

const PROVIDERS = [
  { name: "AWS", status: "Operational" },
  { name: "Azure", status: "Operational" },
  { name: "Google Cloud", status: "Degraded — us-central1-b" },
  { name: "Cloudflare", status: "Operational" },
  { name: "GitHub", status: "Operational" },
  { name: "Arelion (Tier-1)", status: "Recovered" },
];

const ONCALL = [
  { tier: "Primary", name: "A. Rahman", handle: "@arahman", phone: "+60 3-xxx-1141", since: "06:00", status: "active" },
  { tier: "Secondary", name: "S. Lee", handle: "@slee", phone: "+65 8xxx-2209", since: "06:00", status: "standby" },
  { tier: "Escalation", name: "M. Idris", handle: "@midris", phone: "+60 1x-xxx-7783", since: "18:00", status: "standby" },
  { tier: "Vendor bridge", name: "Telco L2 NOC", handle: "#noc-bridge", phone: "1800-xxx-442", since: "—", status: "standby" },
];

const SITES = [
  { name: "Kuala Lumpur DC1", region: "MY", health: 99.98, status: "nominal" },
  { name: "Singapore POP", region: "SG", health: 97.4, status: "watch" },
  { name: "Frankfurt POP", region: "DE", health: 99.87, status: "nominal" },
  { name: "Bangkok POP", region: "TH", health: 99.95, status: "nominal" },
  { name: "Kuala Lumpur DC2", region: "MY", health: 91.2, status: "incident" },
  { name: "Sydney POP", region: "AU", health: 99.99, status: "nominal" },
];

// ---------------- helpers ----------------

const sevColor: Record<Sev, string> = {
  critical: "bg-red-100 text-red-700",
  major: "bg-orange-100 text-orange-700",
  minor: "bg-yellow-100 text-yellow-700",
  info: "bg-slate-100 text-slate-700",
};

const deviceColor: Record<Device["status"], string> = {
  up: "bg-emerald-500",
  degraded: "bg-amber-500",
  down: "bg-red-500",
  maintenance: "bg-sky-500",
};

function jitter(base: number, amp: number, min = 0, max = 100) {
  const v = base + (Math.random() - 0.5) * 2 * amp;
  return Math.min(max, Math.max(min, Math.round(v * 10) / 10));
}

function makeHistory(n: number) {
  const points: { t: string; throughput: number; latency: number; errors: number }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const hour = (new Date().getHours() - Math.floor(i / 2) + 24) % 24;
    const label = `${String(hour).padStart(2, "0")}:${i % 2 === 0 ? "00" : "30"}`;
    const wave = Math.sin(i / 4) * 12 + 60;
    points.push({
      t: label,
      throughput: jitter(wave, 8, 5, 100),
      latency: jitter(24, 10, 2, 200),
      errors: Math.max(0, Math.round(jitter(1.2, 1.8, 0, 8))),
    });
  }
  return points;
}

// ---------------- components ----------------

function KpiCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub: string;
  tone: "good" | "warn" | "bad" | "neutral";
}) {
  const tones = {
    good: "text-emerald-600",
    warn: "text-amber-600",
    bad: "text-red-600",
    neutral: "text-slate-900",
  } as const;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-slate-500">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className={`text-3xl font-semibold ${tones[tone]}`}>{value}</div>
        <div className="mt-1 text-xs text-slate-500">{sub}</div>
      </CardContent>
    </Card>
  );
}

function AlertsFeed({ alerts }: { alerts: Alert[] }) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Live alerts</CardTitle>
      </CardHeader>
      <CardContent className="max-h-96 space-y-2 overflow-y-auto">
        {alerts.map((a) => (
          <div key={a.id} className="flex items-start gap-3 rounded-lg border p-3">
            <Badge className={`${sevColor[a.sev]} shrink-0 uppercase`}>{a.sev}</Badge>
            <div className="min-w-0">
              <div className="text-xs text-slate-500">
                {a.time} · {a.source}
              </div>
              <div className="text-sm text-slate-800">{a.message}</div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function DeviceTable() {
  const [filter, setFilter] = useState<"all" | "problems">("all");
  const rows = useMemo(
    () => (filter === "all" ? DEVICES : DEVICES.filter((d) => d.status !== "up")),
    [filter],
  );
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Devices</CardTitle>
        <Tabs value={filter} onValueChange={(v) => setFilter(v as "all" | "problems")}>
          <TabsList>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="problems">Problems</TabsTrigger>
          </TabsList>
        </Tabs>
      </CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="py-2">Status</th>
              <th className="py-2">Device</th>
              <th className="py-2">Kind</th>
              <th className="py-2">Site</th>
              <th className="py-2">Uptime</th>
              <th className="py-2 text-right">Load</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.name} className="border-b last:border-0">
                <td className="py-2">
                  <span className={`inline-block h-2.5 w-2.5 rounded-full ${deviceColor[d.status]}`} />
                </td>
                <td className="py-2 font-medium">{d.name}</td>
                <td className="py-2 text-slate-500">{d.kind}</td>
                <td className="py-2 text-slate-500">{d.site}</td>
                <td className="py-2 text-slate-500">{d.uptime}</td>
                <td className="py-2 text-right">
                  <span className="inline-flex items-center gap-2">
                    <span className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200">
                      <span
                        className={`block h-full rounded-full ${
                          d.load > 80 ? "bg-red-500" : d.load > 60 ? "bg-amber-500" : "bg-emerald-500"
                        }`}
                        style={{ width: `${d.load}%` }}
                      />
                    </span>
                    <span className="w-8 tabular-nums text-slate-600">{d.load}%</span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function ProviderStatus() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>External dependencies</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {PROVIDERS.map((p) => {
          const bad = p.status !== "Operational" && p.status !== "Recovered";
          const rec = p.status === "Recovered";
          return (
            <div key={p.name} className="flex items-center justify-between rounded-lg border px-3 py-2">
              <span className="text-sm font-medium">{p.name}</span>
              <Badge
                className={
                  bad
                    ? "bg-red-100 text-red-700"
                    : rec
                      ? "bg-sky-100 text-sky-700"
                      : "bg-emerald-100 text-emerald-700"
                }
              >
                {p.status}
              </Badge>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

// topology nodes: x/y are percentage coords on the canvas
const NODES = [
  { id: "kul1", label: "KUL-DC1", x: 76, y: 57, status: "ok" },
  { id: "kul2", label: "KUL-DC2", x: 72, y: 62, status: "alert" },
  { id: "sg", label: "SG-POP", x: 79, y: 59, status: "warn" },
  { id: "bkk", label: "BKK-POP", x: 74, y: 50, status: "ok" },
  { id: "fra", label: "FRA-POP", x: 49, y: 31, status: "ok" },
  { id: "syd", label: "SYD-POP", x: 87, y: 77, status: "ok" },
  { id: "ix", label: "IX / Transit", x: 62, y: 44, status: "ok" },
];

const LINKS: [string, string][] = [
  ["kul1", "sg"],
  ["kul1", "kul2"],
  ["kul2", "sg"],
  ["sg", "syd"],
  ["bkk", "sg"],
  ["bkk", "ix"],
  ["fra", "ix"],
  ["ix", "sg"],
  ["fra", "kul1"],
];

const nodeColor: Record<string, string> = {
  ok: "#34d399",
  warn: "#fbbf24",
  alert: "#f87171",
};

function TopologyMap() {
  const byId = Object.fromEntries(NODES.map((n) => [n.id, n]));
  return (
    <Card>
      <CardHeader>
        <CardTitle>Network topology</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="relative h-72 overflow-hidden rounded-lg bg-slate-900">
          {/* faint lat/long grid */}
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            {Array.from({ length: 9 }, (_, i) => (
              <line key={`h${i}`} x1="0" y1={(i + 1) * 10} x2="100" y2={(i + 1) * 10} stroke="#1e293b" strokeWidth="0.2" />
            ))}
            {Array.from({ length: 9 }, (_, i) => (
              <line key={`v${i}`} x1={(i + 1) * 10} y1="0" x2={(i + 1) * 10} y2="100" stroke="#1e293b" strokeWidth="0.2" />
            ))}
            {LINKS.map(([a, b]) => {
              const na = byId[a];
              const nb = byId[b];
              const hot = na.status === "alert" || nb.status === "alert";
              return (
                <line
                  key={`${a}-${b}`}
                  x1={na.x}
                  y1={na.y}
                  x2={nb.x}
                  y2={nb.y}
                  stroke={hot ? "#f87171" : "#475569"}
                  strokeWidth={hot ? "0.6" : "0.35"}
                  strokeDasharray={hot ? "1.5 1" : undefined}
                />
              );
            })}
          </svg>
          {NODES.map((n) => (
            <div
              key={n.id}
              className="absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${n.x}%`, top: `${n.y}%` }}
            >
              <div className="flex flex-col items-center gap-1">
                <span
                  className={`h-3 w-3 rounded-full ${n.status === "alert" ? "animate-ping" : ""}`}
                  style={{ backgroundColor: nodeColor[n.status] }}
                />
                <span className="rounded bg-slate-950/80 px-1.5 py-0.5 font-mono text-[10px] text-slate-300">
                  {n.label}
                </span>
              </div>
            </div>
          ))}
          <div className="absolute bottom-2 left-2 flex gap-3 text-[10px] text-slate-400">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-emerald-400" /> nominal</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-amber-400" /> watch</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-400" /> incident</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function OnCall() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>On-call rotation</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {ONCALL.map((p) => (
          <div
            key={p.tier}
            className={`flex items-center justify-between rounded-lg border px-3 py-2 ${
              p.status === "active" ? "border-emerald-700/50 bg-emerald-500/10" : "border-slate-800 bg-slate-900"
            }`}
          >
            <div>
              <div className="text-sm font-medium">
                {p.name} <span className="text-xs text-slate-500">{p.handle}</span>
              </div>
              <div className="text-xs text-slate-500">
                {p.tier} · on shift since {p.since} · {p.phone}
              </div>
            </div>
            <Badge
              className={p.status === "active" ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-800 text-slate-400"}
            >
              {p.status === "active" ? "ON CALL" : "STANDBY"}
            </Badge>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function SiteHealth() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Site health (30d)</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {SITES.map((s) => {
          const tone =
            s.status === "incident" ? "bg-red-500" : s.status === "watch" ? "bg-amber-500" : "bg-emerald-500";
          return (
            <div key={s.name} className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span>
                  {s.name} <span className="text-xs text-slate-400">{s.region}</span>
                </span>
                <span className="tabular-nums text-slate-600">{s.health.toFixed(2)}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-slate-200">
                <div className={`h-full rounded-full ${tone}`} style={{ width: `${s.health}%` }} />
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

// ---------------- app ----------------

export default function App() {
  const [history, setHistory] = useState(() => makeHistory(48));
  const [alerts, setAlerts] = useState<Alert[]>(SEED_ALERTS);
  const [clock, setClock] = useState(() => new Date());
  const [, setExtraIdx] = useState(0);

  useEffect(() => {
    const tick = setInterval(() => {
      setClock(new Date());
      setHistory((prev) => {
        const next = [...prev];
        const last = next[next.length - 1];
        next.shift();
        next.push({
          t: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          throughput: jitter(last.throughput, 8, 5, 100),
          latency: jitter(last.latency, 10, 2, 200),
          errors: Math.max(0, Math.round(jitter(last.errors, 1.5, 0, 8))),
        });
        return next;
      });
    }, 3000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    const fire = setInterval(() => {
      setExtraIdx((i) => {
        const e = EXTRA_ALERTS[i % EXTRA_ALERTS.length];
        setAlerts((prev) =>
          [
            {
              ...e,
              id: `gen-${Date.now()}`,
              time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            },
            ...prev,
          ].slice(0, 14),
        );
        return i + 1;
      });
    }, 12000);
    return () => clearInterval(fire);
  }, []);

  const openCrit = alerts.filter((a) => a.sev === "critical").length;
  const openMajor = alerts.filter((a) => a.sev === "major").length;
  const devicesDown = DEVICES.filter((d) => d.status === "down").length;
  const devicesDegraded = DEVICES.filter((d) => d.status === "degraded").length;
  const avgLatency = history[history.length - 1].latency;

  const overall = devicesDown > 0 || openCrit > 0 ? "DEGRADED" : devicesDegraded > 0 ? "WATCH" : "NOMINAL";

  return (
    <div className="min-h-screen bg-slate-950 p-6 text-slate-100">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Badge variant="outline" className="border-slate-700 text-slate-300">
                Network Operations Center
              </Badge>
              <Badge
                className={
                  overall === "NOMINAL"
                    ? "bg-emerald-500/20 text-emerald-300"
                    : overall === "WATCH"
                      ? "bg-amber-500/20 text-amber-300"
                      : "bg-red-500/20 text-red-300"
                }
              >
                <span className="mr-1 inline-block h-2 w-2 animate-pulse rounded-full bg-current" />
                {overall}
              </Badge>
            </div>
            <h1 className="text-3xl font-semibold tracking-tight">Global Network Health</h1>
            <p className="text-sm text-slate-400">Sites: MY · SG · DE · TH · AU — refreshed every 3s</p>
          </div>
          <div className="text-right">
            <div className="font-mono text-2xl tabular-nums">
              {clock.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </div>
            <div className="text-xs text-slate-500">
              {clock.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" })}
            </div>
          </div>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <KpiCard
            label="Critical alerts"
            value={String(openCrit)}
            sub={`${openMajor} major open`}
            tone={openCrit > 0 ? "bad" : "good"}
          />
          <KpiCard
            label="Devices down"
            value={String(devicesDown)}
            sub={`${devicesDegraded} degraded`}
            tone={devicesDown > 0 ? "bad" : devicesDegraded > 0 ? "warn" : "good"}
          />
          <KpiCard
            label="Avg latency"
            value={`${avgLatency} ms`}
            sub="edge p95, last sample"
            tone={avgLatency > 80 ? "bad" : avgLatency > 40 ? "warn" : "good"}
          />
          <KpiCard
            label="Overall"
            value={overall}
            sub="rolled up from sites & devices"
            tone={overall === "NOMINAL" ? "good" : overall === "WATCH" ? "warn" : "bad"}
          />
        </div>

        {/* charts */}
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Throughput (%)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={history}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="t" tick={{ fontSize: 10, fill: "#94a3b8" }} interval={7} />
                  <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} domain={[0, 100]} />
                  <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", fontSize: 12 }} />
                  <Area type="monotone" dataKey="throughput" stroke="#34d399" fill="#34d39933" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Latency &amp; errors</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={140}>
                <LineChart data={history}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="t" tick={{ fontSize: 10, fill: "#94a3b8" }} interval={11} />
                  <YAxis tick={{ fontSize: 10, fill: "#94a3b8" }} />
                  <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", fontSize: 12 }} />
                  <Line type="monotone" dataKey="latency" stroke="#60a5fa" dot={false} strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
              <ResponsiveContainer width="100%" height={72}>
                <BarChart data={history}>
                  <XAxis dataKey="t" hide />
                  <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", fontSize: 12 }} />
                  <Bar dataKey="errors" fill="#f87171" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* main grid */}
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="space-y-4 lg:col-span-2">
            <TopologyMap />
            <DeviceTable />
            <div className="grid gap-4 md:grid-cols-2">
              <SiteHealth />
              <ProviderStatus />
            </div>
          </div>
          <div className="space-y-4">
            <AlertsFeed alerts={alerts} />
            <OnCall />
          </div>
        </div>
      </div>
    </div>
  );
}
