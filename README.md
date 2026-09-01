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
| `yarn lint` | Lint (oxlint) |

## The standard agent workflow

Feature work runs through four Claude Code agents in `.claude/agents/`, the same four in every
ProjectTech4Dev repo. Use them rather than ad-hoc prompting.

| Agent | Takes | Produces |
|-------|-------|----------|
| `planner` | a rough plan, ticket, or feature request | a detailed implementation plan at `plans/<slug>.md` |
| `engineer` | that plan | the implementation |
| `test-engineer` | the implementation | the test layer (Vitest) |
| `reviewer` | the diff + the plan + the original request | a prioritised review verdict |

Skip the planner only for changes small enough to hold in one file. The reviewer checks the diff
against the plan first, so a plan that names real files and testable acceptance criteria is what
makes the rest of the chain work.

## Configuration

Endpoints are resolved in `src/config.ts`. In **dev** leave the env vars unset — relative
paths + the Vite proxy handle everything. In **prod**, set (see `.env.example`):

```
VITE_GLIFIC_API_URL=https://api.<org>.glific.com/api
VITE_WEB_SOCKET=wss://api.<org>.glific.com/web_socket
```

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
  routes/
    Login.tsx                # phone -> OTP (react-hook-form + zod)
    Chat.tsx                 # conversation: realtime, optimistic send, reverse-infinite scroll
  components/
    chat/MessageBubble.tsx   # WhatsApp-style bubble
    chat/EditName.tsx        # inline contact rename
    ui/                      # shadcn components (owned in-repo)
  lib/
    whatsapp.tsx             # safe WhatsApp-markup -> JSX + time formatting
    utils.ts                 # shadcn cn()
  App.tsx                    # routes (/login, /chat)
  main.tsx                   # BrowserRouter entry
```

## Roadmap

Built as an SPA now, structured so it can later be packaged as an **embeddable widget**
(script/iframe snippet for third-party NGO sites) with Shadow-DOM / scoped-Tailwind style
isolation — the shadcn "you own the component code" model makes that migration local.
