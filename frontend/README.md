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
