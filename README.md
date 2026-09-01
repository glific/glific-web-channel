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
`https://localhost:4001` (see `vite.config.ts`). Start the backend first. The login OTP in
the prototype is **9999**.

### Scripts

| Command | What |
|---|---|
| `yarn dev` | Start the Vite dev server (with backend proxy) |
| `yarn build` | Typecheck (`tsc -b`) + production build to `dist/` |
| `yarn test` | Run the Vitest suite once |
| `yarn test:watch` | Watch mode |
| `yarn e2e` | Run the Playwright end-to-end suite against a production build |
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

## Theming

Branding is **per organisation and fetched at runtime** — one build serves every NGO. At boot
the app calls `GET /api/v1/web_channel/theme`; the backend resolves the organisation from the
request `Host`, so the client sends no organisation identifier. Admins set the values from
Glific's Settings page under **Web Channel**, and a change takes effect on reload with no
redeploy.

| Value | Where it lands |
|---|---|
| Accent colour (`#rrggbb`) | `--primary`, converted to `oklch()` |
| — | `--primary-foreground`, **computed** from the accent |
| Logo URL (`https` only) | Login card and chat header |
| Display name | Login card and `document.title` |

Three properties worth knowing before changing `src/services/theme.ts`:

- **First paint is held** behind the fetch (`src/main.tsx`), so there is no flash of the default
  palette. A failed or 404'd fetch falls back to `index.css` and still renders.
- **The foreground is computed, never supplied.** An organisation that picked its own foreground
  could make its button text vanish; contrast is an accessibility obligation, not a preference.
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

CI (`.github/workflows/ci.yml`) runs install → typecheck → lint → `vitest run` → production
build → `playwright test` on every push and pull request.

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
    theme.ts                 # per-org branding: fetch, hex->oklch, computed foreground
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
  main.tsx                   # resolves the theme, then mounts BrowserRouter
e2e/                         # Playwright journeys (see "End-to-end tests")
```

## Roadmap

Built as an SPA now, structured so it can later be packaged as an **embeddable widget**
(script/iframe snippet for third-party NGO sites) with Shadow-DOM / scoped-Tailwind style
isolation — the shadcn "you own the component code" model makes that migration local.
