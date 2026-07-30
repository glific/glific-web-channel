# Deploying the Glific web-channel demo on Bunnyshell

A shareable preview environment that assembles three repos + Postgres into one stack:

| Component | Repo / source | Public URL | Notes |
|---|---|---|---|
| `db` | `postgres:15-alpine` | — (internal `db:5432`) | persistent 2Gi volume |
| `backend` | `glific/glific` @ `web-channel-prototype` | `https://glific-backend-…` | Elixir/Phoenix, dev mode |
| `widget` | `glific/glific-web-channel` @ `web-channel-prototype` | `https://glific-widget-…` | end-user chat |
| `staff` | `glific/glific-frontend` @ `web-channel-prototype` | `https://glific-staff-…` | staff console |

The full definition is in [`bunnyshell.yaml`](./bunnyshell.yaml).

## Why it works across different hostnames

Vite inlines `VITE_*` at **build time**, so each frontend bakes in the backend's public URL
as a Docker build arg (Bunnyshell fills it from `{{ components.backend.ingress.hosts[0].hostname }}`).
On the backend, `config/dev.exs` reads two env vars (set by `bunnyshell.yaml`):

- `BACKEND_HOST` → endpoint `url:host`, so `GlificWeb.SubdomainPlug` resolves the seeded
  **"glific"** org for requests to the backend's own hostname.
- `CHECK_ORIGIN` → allow-list of the widget + staff origins, so their WebSocket handshakes
  pass Phoenix's `check_origin` (the cross-host 403 shows up in the **backend** log, not the UI).

No ngrok needed: every component gets a real public HTTPS URL for any flow-webhook callbacks.
The web channel bypasses WhatsApp, so no inbound BSP (Gupshup) callbacks are required.

## One-time setup

1. **Push the branches** — Bunnyshell clones from a git remote; it cannot see local commits.
   - `glific` and `glific-frontend`: push `web-channel-prototype` to their `origin`.
   - `glific-web-channel`: create the GitHub repo first, add it as `origin`, then push.
2. **Connect the repos** in Bunnyshell → Integrations → Git (GitHub app, read-only).
3. **Encrypt secrets** and paste into `bunnyshell.yaml`'s `SECRET[...]` slots:
   ```bash
   bns secrets encrypt --value '<postgres-password>'
   bns secrets encrypt --value '<oban-pro-fingerprint>'   # FP
   bns secrets encrypt --value '<oban-pro-auth-key>'      # AUTH_KEY
   ```
   The Oban Pro credentials are required because the backend Dockerfile fetches deps from
   `getoban.pro`. Get them from your existing local backend build setup.
4. **Confirm backend build-arg versions** in `bunnyshell.yaml` (`ELIXIR_VERSION`, `ALPINE_VERSION`,
   `NODE_VERSION`, `POSTGRES_VERSION`) match your working local `docker build` — the Dockerfile
   ARGs have no defaults.

## Deploy

```bash
bns configure                                  # store API token
bns environments create --project <id> ...     # or create in the web console
bns environments deploy --environment <id>
```

**Bring it up incrementally:** deploy `db` + `backend` first and confirm
`GET https://glific-backend-…/api/v1/session/name` returns the org name, then hit the widget.
First backend boot runs `mix setup` (migrations + seeds the "glific" org) via `config/entrypoint.sh`.

## MCP (drive this from Claude)

Add the official hosted Bunnyshell MCP — no local install:
```json
{ "mcpServers": { "bunnyshell": { "url": "https://documentation.bunnyshell.com/mcp" } } }
```

## Known caveats

- **Data resets on redeploy.** `entrypoint.sh`'s first-boot marker lives in the image, so a new
  container re-runs `mix setup` (which does `ecto.reset` → drops the DB). Fine for a demo; make
  it idempotent if you need persistence across redeploys.
- **First build is slow** — compiling Glific's dep tree is heavy. Set `deploy.resources` if the
  builder OOMs.
- **OTP is `9999`** (`web_channel_otp_bypass: true` in dev) — there's no SMS gateway in the env.
