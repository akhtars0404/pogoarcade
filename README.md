# PoGo Arcade (pogoarcade.com)

A free browser game portal — 21 games (Chess, Checkers, Tic Tac Toe, Connect
Four, Dots & Boxes, Carrom, 8-Ball Pool, Snooker, Memory Match, Minesweeper,
2048, Hangman, Snake, Whack-a-Mole, and a 7-game Kids Zone) with real user
accounts, a global leaderboard, and real-time **online multiplayer** for the
five turn-based board games (Tic Tac Toe, Connect Four, Chess, Checkers,
Dots & Boxes).

## Project layout

```
pogoarcade/
  backend/    Node.js + Express + Socket.io + SQLite — auth, leaderboard, multiplayer
  frontend/   React + Vite + react-router-dom — the game portal itself
```

Two separate deployables. The frontend is a static site; the backend is a
small always-on Node process (it needs to stay running for Socket.io and to
keep the SQLite file on disk).

## How online multiplayer works (read this before extending it)

Every "Online" mode match is a Socket.io room. The server enforces **whose
turn it is** (you can't move when it isn't your turn) but does **not**
re-validate full game rules server-side — each client runs the same game
logic already used for local play, and after every move sends the resulting
board state to the server, which just relays it to the opponent. This keeps
five different games' worth of rules in one place (the client) instead of
duplicating chess/checkers logic on the server too.

This is a deliberate, documented trade-off for a first version: a modified
client could send an illegal board state. The risk is low (there's no money
on the line, per the Disclaimer page), but if you later add ranked
competitions with real prizes, move validation should be duplicated
server-side (or the whole game re-simulated server-side from a move log)
before trusting the results.

Score awarding also follows a simple rule to avoid double-awarding: **only
the winning player reports the result** (`mp.reportGameOver`); on a draw,
either player may report it. See `backend/src/multiplayer.js` and each
game's `reportedRef` logic in `frontend/src/App.jsx` for the exact rule per
game.

Carrom, 8-Ball Pool, and Snooker are **not** online-multiplayer-enabled —
they're physics simulations, and syncing physics fairly between two
browsers needs a server-authoritative physics step (or heavy client
prediction/reconciliation), which is a separate, bigger project. They stay
solo/local for now.

## Local development

**Backend:**
```bash
cd backend
npm install
cp .env.example .env      # edit JWT_SECRET at minimum
npm run dev                 # http://localhost:4000
```

**Frontend** (in a second terminal):
```bash
cd frontend
npm install
cp .env.example .env        # points at http://localhost:4000 by default
npm run dev                  # http://localhost:5173
```

Sign up a test account, and open the same page in a second browser (or an
incognito window) to test online multiplayer against yourself.

## Deploying to pogoarcade.com

### 1. Backend first (the frontend needs its URL)

The backend needs to be an always-on process with persistent disk (for the
SQLite file), so a serverless platform (Vercel functions, Netlify
functions) won't work for it — use a small VM/container host instead.

**Render.com (easiest, has a free tier):**
1. Push this repo to GitHub.
2. New → Web Service → pick the repo, set the root directory to `backend`.
3. Render will detect `render.yaml` and pre-fill the build/start commands
   and a 1GB persistent disk mounted at `/var/data`. Set `CORS_ORIGIN` to
   `https://pogoarcade.com` (and `https://www.pogoarcade.com` if you'll use
   the www subdomain — comma-separate isn't supported by the `cors` package
   directly, so switch `CORS_ORIGIN` handling to an array if you need both).
4. Deploy. Note the resulting URL, e.g. `https://pogoarcade-backend.onrender.com`.

**Railway / Fly.io / any Docker host:** use the included `Dockerfile`. Set
env vars `JWT_SECRET`, `CORS_ORIGIN`, and mount a volume for `/app/data` (or
set `DB_PATH` to wherever your volume is mounted) so the database survives
restarts and redeploys.

If you'd rather point `api.pogoarcade.com` at this service, add that as a
custom domain on whichever host you pick, once DNS is set up (step 3).

### 2. Frontend

**Vercel (recommended):**
1. New Project → import the repo → set root directory to `frontend`.
2. Framework preset: Vite. Build command `npm run build`, output `dist`
   (Vercel auto-detects these).
3. Add environment variables:
   - `VITE_API_URL` = your backend URL (e.g. `https://api.pogoarcade.com`)
   - `VITE_SOCKET_URL` = same value (Socket.io reuses the same server)
4. Deploy. `vercel.json` is already set up to rewrite all paths to
   `index.html` so client-side routes like `/games/chess` work on refresh
   and direct link.

**Netlify** works the same way — `netlify.toml` is included with the
equivalent redirect rule.

### 3. Point pogoarcade.com at both

In your domain registrar's DNS settings:
- `pogoarcade.com` (and `www`) → your frontend host's instructions (usually
  a couple of A/CNAME records — Vercel/Netlify show you the exact records
  once you add the custom domain in their dashboard).
- `api.pogoarcade.com` → CNAME to your backend host, if you gave it a
  custom domain. Otherwise the frontend can just call the host's default
  URL (e.g. `*.onrender.com`) directly via `VITE_API_URL` — a custom
  subdomain is a nice-to-have, not required.
- Update `CORS_ORIGIN` on the backend and `VITE_API_URL`/`VITE_SOCKET_URL`
  on the frontend to match whatever you land on, and redeploy both.

### 4. Before applying for AdSense

This build already has the structural pieces AdSense reviewers look for:
Privacy Policy, Terms, Disclaimer, About, Contact, a cookie consent banner,
semantic HTML with breadcrumbs, and real per-page URLs (via
`react-router-dom`) so every game and legal page is independently
indexable and crawlable — rather than everything living behind client-side
state at a single `/` URL. `public/sitemap.xml` and `public/robots.txt` are
included and reference `https://pogoarcade.com` — update them if your final
domain differs.

Still to do before submitting:
- Replace the `G-XXXXXXXXXX` placeholder in `frontend/index.html` with a
  real Google Analytics Measurement ID (or remove the block if you don't
  want GA).
- Run the live site for a few weeks with real visitors/content — Google
  generally wants to see an established site, not a same-day submission.
- Once approved, replace the `AdSlot` placeholder `<div>`s in
  `frontend/src/App.jsx` with your real AdSense `<ins>` snippets, and add
  the AdSense verification `<script>` tag (commented placeholder already in
  `index.html`).
- For meaningfully better SEO than client-side routing alone provides,
  consider server-side rendering or prerendering (e.g. migrating to
  Next.js, or using `vite-plugin-ssr`/`vite-react-ssg`) so crawlers get
  fully-rendered HTML per page rather than relying on JS execution. Not
  required for AdSense approval, but it helps organic search ranking.

## What's still a placeholder / known limitation

- **Physics games (Carrom, Pool, Snooker) are solo-only** — see the
  multiplayer section above.
- **No password reset flow** — if a user forgets their password there's
  currently no email-based recovery (there's no email collection at all,
  by design, per the Privacy Policy). Add one if you want it.
- **No rate limiting** on the auth endpoints — add something like
  `express-rate-limit` before this is public, to blunt brute-force login
  attempts.
- **Ad slots are placeholders** — see step 4 above.
