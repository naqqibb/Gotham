# Gotham NOC — Global Network Health

A single-page Network Operations Center dashboard: live alert feed, device
inventory with load bars, network topology map, per-site health, external
dependency status, and an on-call rotation, plus throughput / latency / error
charts. All data is seeded and simulated client-side (no backend, no live
telemetry) for demo and UI-development purposes.

## Stack

- Vite + React 18 + TypeScript
- Tailwind CSS
- Recharts (throughput/latency/error charts)
- Radix UI Tabs; local shadcn-style `Badge` / `Card` primitives under
  `src/components/ui/`

## Develop

```bash
cd frontend
npm install
npm run dev      # start the dev server
npm run build    # typecheck (tsc -b) + production build
npm run lint     # tsc --noEmit
```

The `@` import alias maps to `src/` (see `vite.config.ts` and `tsconfig.json`).

## Live data (optional)

By default the dashboard runs on built-in seeded data. To drive it from the
`../backend` service, set `VITE_API_BASE` (see `.env.example`):

```bash
# terminal 1
cd ../backend && npm install && npm start        # serves on :8080

# terminal 2
cd frontend
echo "VITE_API_BASE=http://localhost:8080" > .env.local
npm run dev
```

When `VITE_API_BASE` is set, `src/lib/api.ts` reports `LIVE = true`: the app
fetches `/api/metrics`, `/api/alerts`, `/api/providers`, and `/api/devices` on
load, re-polls them every 15s, and subscribes to `/api/stream` (SSE) for
per-3s metric slots. The header subtitle shows "live feed (backend)" vs
"seeded demo data" so you can tell which mode is active. With the var unset,
no network calls are made and the local simulation runs instead.

## Layout

```
frontend/
  src/
    App.tsx                 # the dashboard (all panels)
    main.tsx                # React entry
    index.css               # Tailwind directives
    lib/utils.ts            # cn() class-merge helper
    components/ui/          # Badge, Card, Tabs primitives
```

## Notes

- Seed alerts reference publicly reported network/cloud incidents purely as
  realistic sample text; they are illustrative, not a live feed.
- Phone numbers / handles in the on-call panel are placeholders.
