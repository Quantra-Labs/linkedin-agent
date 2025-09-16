LinkedIn Lead Gen Agent (MCP-ready)

Overview
- Backend: TypeScript + Express + Prisma (SQLite)
- Services: Safety caps, AI generation, cadence engine, scheduler worker
- MCP-like stdio server: `src/mcp/server.ts` exposes JSON-RPC tools

Compliance & Safety
- Respect LinkedIn policies. Do not scrape or automate without explicit authorization.
- Hard caps via env:
  - DAILY_DM_LIMIT (default 50)
  - DAILY_CONNECTION_LIMIT (default 50)
- Provider is a safe stub; integrate only with approved APIs or user-authorized flows.

Setup
1) Install deps
```
npm install
```
2) Configure env
```
cp .env.example .env
```
3) DB setup
```
npx prisma migrate dev
```
4) Dev server
```
npm run dev
```

MCP-like server
Build and run:
```
npm run build
node dist/mcp/server.js
```
Send JSON-RPC lines on stdin, e.g.:
```
{"jsonrpc":"2.0","id":1,"method":"scheduler.run"}
```

Key Endpoints
- `GET /health`
- `POST /campaigns` { ownerId, name, audienceJson }
- `POST /campaigns/:id/assign` { leadId, sequenceId }
- `POST /scheduler/run` trigger processing

Development Notes
- Prisma schema models users, campaigns, sequences, steps, leads, messages, interactions, and safety counters.
- `src/services/safety.ts` enforces caps and backoff.
- `src/services/ai.ts` supports templating fallback or OpenAI.
- `src/services/cadence.ts` executes connection/send message/wait steps.
- `src/providers/linkedin.ts` is a safe stub; replace with compliant adapter.
