# Gotham NOC — Backend

A dependency-free Node service (stdlib `http` only) that aggregates real
status feeds — Azure, Google Cloud, GitHub, Cloudflare, AWS status pages, and
optionally ThousandEyes outages — alongside device telemetry, and serves them
over HTTP + Server-Sent Events for the `frontend/` NOC dashboard.

## Run

Requires **Node 18+** (for global `fetch`).

```bash
cd backend
npm install
npm run dev              # tsx watch (hot reload)
npm start                # run once
npm run typecheck        # tsc --noEmit
```

Optional environment:

| Var | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8080` | HTTP listen port |
| `THOUSANDEYES_API_TOKEN` | *(unset)* | Enables the ThousandEyes outage poll |

## Endpoints

| Method / path | Returns |
| --- | --- |
| `GET /api/summary` | KPI snapshot (overall status, open alerts, latest metric) |
| `GET /api/alerts` | Alert feed (external incidents + generated device alerts) |
| `GET /api/providers` | Cloud/CDN provider status |
| `GET /api/metrics` | Throughput/latency/error history (last 48 slots) |
| `GET /api/devices` | Device inventory rows |
| `GET /api/stream` | SSE push of new metric slots + recent alerts every 3s |
| `GET /healthz` | Liveness |

All responses send `Access-Control-Allow-Origin: *` so the Vite dev server can
consume them cross-origin.

## Wiring the frontend to live data

The `frontend/` app currently renders seeded, client-side data. To consume this
backend instead, point the dashboard at the API base (e.g. `http://localhost:8080`)
and replace the seed constants / intervals with `fetch` + an `EventSource` on
`/api/stream`. The response shapes mirror the frontend's existing types
(`Alert`, `MetricSlot`, `Device`, provider status).

## Notes

- External status endpoints are polled once a minute; failures degrade to an
  "Unreachable" provider status and are swallowed (`Promise.allSettled`), so a
  blocked egress network never crashes the service.
- Device inventory and the metric stream are simulated; swap `pollDevices()`
  for SNMP/agent polling in production.
