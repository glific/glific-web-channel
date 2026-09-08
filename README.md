# Glific Web Channel

Standalone front-end for the Glific **web channel** — a public, WhatsApp-style chat app
that end users open in a browser to converse with an NGO running on Glific. It is a
dedicated SPA (deployed at e.g. `web.<org>.glific.com`), fully decoupled from the Glific
staff console (`glific-frontend`).

It talks to the Glific backend over **REST** (OTP auth) and a **Phoenix websocket**
(`/web_socket`) — there is no Apollo/GraphQL here.

## Stack

- **React 19 + Vite + TypeScript**
- **Tailwind CSS v4** + **shadcn/ui** (Radix primitives)
- **react-hook-form + zod** (forms/validation)
- **phoenix** JS client (realtime), **axios** (REST)
- **Vitest + React Testing Library** (tests)
- Package manager: **yarn** · Node pinned via `.tool-versions` (24.20.0)

## Getting started

```bash
yarn install
yarn dev        # https://glific.test:5173 (trusted mkcert cert via vite-plugin-mkcert)
```

The dev server runs on **https://glific.test:5173** — add `127.0.0.1 glific.test` to
`/etc/hosts` if needed. On first run, `vite-plugin-mkcert` may prompt to install its
local CA. Generated certs are saved under `certs/` (gitignored).

The dev server proxies `/api` and `/web_socket` to the Glific backend on
`https://localhost:4001` (see `vite.config.ts`). Start the backend first. There is no
bypass code — the backend mints a real OTP and delivers it over WhatsApp.

### Scripts

| Command | What |
|---|---|
| `yarn dev` | Start the Vite dev server (with backend proxy) |
| `yarn build` | Typecheck (`tsc -b`) + production build to `dist/` |
| `yarn test` | Run the Vitest suite once |
| `yarn test:watch` | Watch mode |
| `yarn e2e` | Run the Playwright end-to-end suite against a production build |
| `yarn e2e:live` | Run the opt-in journeys against a real backend (see below) |
| `yarn e2e:ui` | Playwright's interactive UI mode |
| `yarn e2e:report` | Open the last HTML report |
| `yarn lint` | Lint (oxlint) |

## Configuration

Endpoints are resolved in `src/config.ts`. In **dev** leave the env vars unset — relative
paths + the Vite proxy handle everything. In **prod**, set (see `.env.example`):

```
VITE_GLIFIC_API_URL=https://api.<org>.glific.com/api
VITE_WEB_SOCKET=wss://api.<org>.glific.com/web_socket
```

## Branding

Branding is **per organisation and fetched at runtime** — one build serves every NGO. At boot
the app calls `GET /api/v1/web_channel/branding`; the backend resolves the organisation from the
request `Host`, so the client sends no organisation identifier. Admins set the values from
Glific's Settings page under **Web Channel**, and a change takes effect on reload with no
redeploy.

| Value | Where it lands |
|---|---|
| Theme (a named palette) | `--primary` and its matched `--primary-foreground` |
| Logo URL (`https` only) | Login card and chat header |
| Display name | Login card and `document.title` |

Three properties worth knowing before changing `src/services/branding.ts`:

- **First paint is held** behind the fetch (`src/main.tsx`), so there is no flash of the default
  palette.
- **A failed fetch does not fall back.** `loadBranding` returns `ok` / `disabled` / `unavailable`:
  a 404 renders the app with a "not enabled" banner, but an unreachable backend renders a
  retryable error page. Quietly serving the default palette under an NGO's own domain would read
  as the wrong organisation rather than as a failure.
- **The foreground ships with the palette, never supplied by the org.** An organisation that
  picked its own foreground could make its button text vanish; contrast is an accessibility
  obligation, not a preference. `themes.test.ts` asserts every pair clears WCAG AA.
- **Override the raw custom properties** (`--primary`), not the `--color-*` aliases — those are
  compiled through Tailwind's `@theme inline` and cannot be set at runtime.

## End-to-end tests

Playwright, in `e2e/`, running against the **production build** via `vite preview` — not the dev
server. `yarn e2e` builds nothing itself, so run `yarn build` first if `dist/` is stale.

```bash
yarn build && yarn e2e
```

**The convention: every ticket adds its own journeys here.** The harness landed with the first
user-visible feature precisely so it never trails the features it is meant to guard — a ticket
that changes user-visible behaviour is not done until `e2e/` covers it.

Journeys are grouped one file per feature area, with shared fixtures in `e2e/support/`. Backend
responses are stubbed with `page.route`, which is what lets a single build be exercised as two
different organisations without standing up two backends.

Journeys run on **Pixel 7, iPhone 14, iPhone SE and Desktop Chrome** — beneficiaries reach this
on a phone, often a shared or borrowed one, so mobile is the primary target rather than an
afterthought.

CI (`.github/workflows/ci.yml`) runs install → typecheck → lint → `vitest run` → production
build → `playwright test` on every push and pull request.

### Against a real backend

`e2e/live/` holds one journey that runs with **nothing stubbed**: a real request to
`/api/v1/web_channel/request-otp`, a code minted by `Glific.OTP`, a real message row, a real
signed token. It is opt-in and excluded from CI, which has neither Postgres nor Phoenix.

```bash
yarn e2e:live
```

The code cannot be read from the API — `PasswordlessAuth` keeps it in the backend's memory and
there is deliberately no route that hands it back. Both send paths compose it into `messages.body`
before the message reaches Gupshup, so the test reads it from there. That keeps every server-side
step real without a test-only door into production code.

The one hop it does **not** cover is Gupshup handing the message to WhatsApp: that needs a real
handset and a human reading it, so it stays a manual acceptance check.

Preconditions, all on the org the backend resolves from the request host:

| | |
|---|---|
| Backend | running on `https://localhost:4001` |
| `web_channel_enabled` | on for the organisation |
| Database | reachable at `E2E_DATABASE_URL` (default `postgres://postgres:postgres@localhost:5432/glific_dev`) |

The suite seeds its own contacts. It has to: glific#5710 creates contacts with no consent and no
session, so a number typed into the login box for the first time is deliberately sent nothing at
all until #5713 adds the exemption.

| Variable | Default |
|---|---|
| `E2E_DATABASE_URL` | `postgres://postgres:postgres@localhost:5432/glific_dev` |
| `E2E_ORGANIZATION_ID` | `1` |
| `E2E_LIVE_URL` | `https://glific.test:5173` |
| `E2E_PHONE` / `E2E_PHONE_ALT` | `919999900001` / `919999900002` |

Runs are serial with retries off, because the backend throttles a phone to one OTP per 30 seconds
and a retry would fail on the throttle rather than on whatever went wrong.

## Deploy on Vercel

This repo is configured for [Vercel](https://vercel.com) as a static Vite SPA (`vercel.json`).

1. Import the repository in the Vercel dashboard (or run `vercel` from the project root).
2. Vercel detects **Vite** automatically. Build settings are pinned in `vercel.json`:
   - **Install:** `yarn install`
   - **Build:** `yarn build`
   - **Output:** `dist`
3. Add **Environment Variables** for production (required — Vite inlines `VITE_*` at build time):

   | Variable | Example |
   |---|---|
   | `VITE_GLIFIC_API_URL` | `https://api.your-org.glific.com/api` |
   | `VITE_WEB_SOCKET` | `wss://api.your-org.glific.com/web_socket` |

   Apply them to **Production** (and Preview if previews should hit a real backend).
4. Deploy. Client-side routes (`/login`, `/chat`) are rewritten to `index.html` so hard refreshes work.

Node **24.20.0** is pinned via `.nvmrc` and `package.json` `engines`.

## Structure

```
src/
  config.ts                  # backend endpoints (env-driven, relative defaults)
  services/
    webChannelSocket.ts      # phoenix socket: join, send, load-more, rename
    webChannelAuth.ts        # OTP request/verify + localStorage session
    branding.ts              # per-org branding: fetch, apply, module store
    themes.ts                # the named colour palettes
  routes/
    Login.tsx                # phone -> OTP (react-hook-form + zod)
    Chat.tsx                 # conversation: realtime, optimistic send, reverse-infinite scroll
  components/
    chat/MessageBubble.tsx   # WhatsApp-style bubble
    chat/EditName.tsx        # inline contact rename
    branding/Logo.tsx        # the org's logo, or nothing when unset
    ui/                      # shadcn components (owned in-repo)
  lib/
    whatsapp.tsx             # safe WhatsApp-markup -> JSX + time formatting
    utils.ts                 # shadcn cn()
  App.tsx                    # routes (/login, /chat)
  main.tsx                   # resolves branding, then mounts BrowserRouter
e2e/                         # Playwright journeys (see "End-to-end tests")
```

## Roadmap

Built as an SPA now, structured so it can later be packaged as an **embeddable widget**
(script/iframe snippet for third-party NGO sites) with Shadow-DOM / scoped-Tailwind style
isolation — the shadcn "you own the component code" model makes that migration local.
