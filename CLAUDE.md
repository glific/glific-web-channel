# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**glific-web-channel** is the public, WhatsApp-style chat SPA that *end users* open in a browser
to converse with an NGO running on Glific. It is deployed at `web.<org>.glific.com` and is fully
decoupled from the staff console (`glific-frontend`) — **no Apollo, no GraphQL, no MUI here**. It
talks to the Glific backend over REST (OTP auth) and a Phoenix websocket (`/web_socket`).

## Commands

```bash
yarn install
yarn dev             # https://glific.test:5173 (mkcert cert, proxies /api + /web_socket)
yarn build           # tsc -b + vite build — this is the real typecheck gate
yarn lint            # oxlint
yarn test            # vitest run
yarn test:watch      # vitest watch mode
yarn test:coverage   # v8 coverage
yarn preview         # serve the production build

npx vitest run src/routes/Login.test.tsx   # a single test file
```

There is no CI workflow in this repo yet. `yarn lint`, `yarn build`, and `yarn test` are the
gates — run all three before calling anything done. `yarn dev` alone will not catch every type
error; `yarn build` will.

## Dev Environment Prerequisites

- Add `127.0.0.1 glific.test` to `/etc/hosts`.
- **Start the Glific backend first** — the dev server proxies `/api` and `/web_socket` to
  `https://localhost:4001` (see `vite.config.ts`).
- On first `yarn dev`, `vite-plugin-mkcert` may prompt to install a local CA. Certs land in
  `certs/` (gitignored). mkcert is skipped for `vite build` so Vercel deploys don't need it.
- Node 24.20.0, pinned via `.tool-versions` / `.nvmrc` / `package.json` `engines`. Use **yarn**.
- The prototype login OTP is `9999`.

## The standard agent workflow

Feature work runs through four agents in `.claude/agents/`, the same four in every
ProjectTech4Dev repo. Use them rather than ad-hoc prompting — they encode the conventions in
this document.

| Agent | Takes | Produces |
|-------|-------|----------|
| `planner` | a rough plan, ticket, or feature request | a detailed implementation plan at `plans/<slug>.md` |
| `engineer` | that plan | the implementation |
| `test-engineer` | the implementation | the test layer (Vitest) |
| `reviewer` | the diff + the plan + the original request | a prioritised review verdict |

Skip the planner only for changes small enough to hold in one file. The reviewer checks the diff
against the plan first, so a plan that names real files, the components to reuse, and testable
acceptance criteria is what makes the rest of the chain work.

## Architecture

### Tech Stack

- **React 19 + Vite + TypeScript** (strict; `noUnusedLocals`, `noUnusedParameters`,
  `verbatimModuleSyntax`, `erasableSyntaxOnly`)
- **Tailwind CSS v4** + **shadcn/ui** (Radix primitives, `radix-nova` style, `lucide` icons) —
  components are generated into `src/components/ui/` and **owned in-repo**
- **react-hook-form + zod** (via `@hookform/resolvers`) for forms and validation
- **phoenix** JS client for realtime, **axios** for REST
- **react-router** v8 for routing
- **Vitest + React Testing Library** (jsdom); Vitest config lives inside `vite.config.ts`

### Directory Structure

| Path | Purpose |
|------|---------|
| `src/config.ts` | Backend endpoint resolution |
| `src/services/webChannelAuth.ts` | OTP request/verify + `localStorage` session |
| `src/services/webChannelSocket.ts` | Phoenix socket: join, send, load-more, rename, disconnect |
| `src/routes/Login.tsx` | Phone → OTP (react-hook-form + zod) |
| `src/routes/Chat.tsx` | Conversation: realtime, optimistic send, reverse-infinite scroll |
| `src/components/chat/` | Feature components (`MessageBubble`, `EditName`) |
| `src/components/ui/` | shadcn primitives (`button`, `input`, `card`, `dialog`, `label`, `scroll-area`) |
| `src/lib/whatsapp.tsx` | Safe WhatsApp-markup → JSX, plus time formatting |
| `src/lib/utils.ts` | The shadcn `cn()` helper |
| `src/index.css` | Tailwind v4 `@theme` tokens (shadcn CSS-variable palette) |
| `src/App.tsx` | Routes (`/login`, `/chat`) and the auth guards |
| `src/test/setup.ts` | Vitest setup (`@testing-library/jest-dom/vitest`) |

Imports use the `@/` alias for `src/` (`vite.config.ts` + `tsconfig.app.json`).

## Deployment model — one build, many orgs

**This is the constraint that shapes most decisions here.** The widget is deployed as a *single
build serving every organisation*, not one build or deployment per NGO. Each org's
`web.<shortcode>.glific.com` hostname is a CNAME pointing at the same deployment; the backend
resolves the organisation from the request Host header, and the widget fetches that org's branding
(accent colour, logo, display name) at runtime before first paint.

Consequences:

- **No org-specific value may be inlined at build time.** Vite inlines `VITE_*` into the bundle,
  so anything that varies per organisation — the API base URL above all — must be derived at
  runtime from `location.hostname`. Before adding a `VITE_*` variable, ask whether its value is
  identical for every NGO; if it isn't, that's a design error, not a config detail.
- **Origin checks must be wildcarded.** Phoenix's `check_origin` (driven by `REQUEST_ORIGIN` /
  `REQUEST_ORIGIN_WILDCARD` in the backend's `runtime.exs`) has to admit the whole
  `web.*.glific.com` wildcard, or the WebSocket upgrade is rejected for every org but the
  configured one.
- **Known drift:** `src/config.ts`, `.env.example`, and `README.md` still describe the older
  per-org build-time model (`VITE_GLIFIC_API_URL`, `VITE_WEB_SOCKET` set per deployment). When you
  touch that code, move it toward the runtime model rather than extending the old one.

Hosting is Vercel as a static Vite SPA (`vercel.json`): client routes rewrite to `index.html`,
hashed assets get a one-year immutable cache, `index.html` is `no-cache`.

## Conventions

### Layering

- **Network access lives in `src/services/**`.** A route or component calls a typed service
  function; it never builds a URL, touches `axios`, or instantiates a Phoenix `Socket` directly.
  This is also what makes the code testable — the services are the seam the tests fake.
- `src/lib/**` is for pure helpers with no I/O.

### UI

- **Reuse the shadcn primitives in `src/components/ui/`** before hand-rolling anything. If a
  primitive is missing, add it via shadcn (`components.json` is configured) rather than writing a
  bespoke one — the "you own the component code" model means the generated file is yours to adapt
  afterwards.
- **Style with Tailwind utility classes composed through `cn()`.** No inline style objects, no
  one-off CSS files, no arbitrary values where a scale step exists. Colours come from the shadcn
  CSS-variable palette in `src/index.css`; anything that varies per org comes from the runtime
  theme, never a hardcoded colour.
- The roadmap is an **embeddable widget** (script/iframe snippet on third-party NGO sites, with
  Shadow-DOM / scoped-Tailwind isolation). Avoid global-CSS assumptions and anything that assumes
  this app owns the whole page — that's what makes the migration expensive.
- **Mobile-first.** This is used on cheap phones on bad networks by people who are not power
  users. Check narrow viewports.
- **Accessibility:** real labels on inputs (not just placeholders), visible keyboard focus, no
  state conveyed by colour alone.

### Forms

`react-hook-form` + a `zod` schema through `@hookform/resolvers`. Validation lives in the schema,
not scattered through handlers. See `src/routes/Login.tsx`.

### Auth and session

`src/services/webChannelAuth.ts` owns the session, stored in `localStorage` under
`web_channel_session` as `{ token, contactId, name }`. `requestOtp` / `verifyOtp` hit the public
REST endpoints; the token authenticates the Phoenix socket.

Route guards in `src/App.tsx` are deliberately **components** (`RequireAuth`,
`RedirectIfAuthed`), not a value computed in `App`'s body — `App` doesn't consume the location
context, so a value computed once would go stale and trap the user on `/login` right after a
successful verify. Don't "simplify" that.

**This is a public surface.** End users are not staff. Never log or render anything not meant for
the person holding the phone, keep `localStorage` to the session minimum, and don't let backend
internals leak into error messages.

### Realtime

`connectAndJoin` opens the socket, joins `web_channel:<contactId>`, and resolves with the initial
page of messages; `pushNewMessage`, `pushLoadMore`, and `pushUpdateName` are promise wrappers over
channel pushes that reject on `error` and `timeout`; `disconnect` tears down. Server pushes arrive
as `new_message`. The phoenix client provides auto-reconnect and heartbeats.

A chat UI has to survive all of these, and `src/routes/Chat.tsx` shows the established handling —
a `connectionState` of `connecting | open | reconnecting`, a `seenIds` set to dedupe, and
optimistic sends:

- socket `onOpen` / `onError` / `onClose` reflected in the UI (don't leave a live-looking composer
  over a dead socket)
- reconnect rejoins without duplicating the message list
- an optimistic send that is never confirmed has a resolution — not a permanent ghost message
- duplicate or out-of-order `new_message` pushes don't corrupt the list
- `load_more` returning an empty page means end of history

### Rendering user text

`src/lib/whatsapp.tsx` converts WhatsApp markup to JSX safely and is the **only** path for
rendering user-supplied message text. Don't bypass it.

### TypeScript

Strict. No `any` to get past a type error — model the shape. No non-null assertions standing in
for real narrowing.

## Testing

Vitest (jsdom, `globals: true`) + React Testing Library + `@testing-library/user-event`. Tests are
colocated (`src/App.test.tsx`, `src/routes/Login.test.tsx`,
`src/services/webChannelSocket.test.ts`) and excluded from `tsconfig.app.json`'s build include.

- **Never touch the real network.** Fake the Phoenix `Socket`/`Channel` and `axios`; build the
  fake once as a shared helper rather than re-stubbing per file.
- Use fake timers for reconnect/backoff behaviour rather than sleeping.
- Query by role and label, not test ids — a failing role query is usually a real accessibility
  finding.
- Cover the realtime failure modes above, and the loading / empty / error / reconnecting states,
  not just the happy path.
- **There is no e2e harness yet.** If one is needed, check what the rest of the org uses
  (`glific-frontend` runs Cypress against a live Elixir backend) and prefer consistency over
  introducing a third runner. Call out behaviour that is only reachable e2e and therefore
  currently untested.
