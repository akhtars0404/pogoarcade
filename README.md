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
  backend/    Node.js + Express + Socket.io + Postgres (Cloud SQL) — auth, leaderboard, multiplayer
  frontend/   React + Vite + react-router-dom — the game portal itself
```

Two separate deployables. The frontend is a static site; the backend is a
small always-on Node process (it needs to stay running for Socket.io) that
talks to a Cloud SQL Postgres instance for everything durable — accounts,
scores, login history.

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
cp .env.example .env      # edit JWT_SECRET, and point DB_* at a local Postgres
npm run dev                 # http://localhost:4000
```
Needs a Postgres to talk to — the simplest local option is
`createdb pogoarcade` against a locally installed Postgres, then set
`DB_HOST=localhost`, `DB_USER`/`DB_PASSWORD` to match in `.env`. The backend
creates its own tables on boot (`initSchema()` in `src/db.js`), so an empty
database is fine to start from.

**Frontend** (in a second terminal):
```bash
cd frontend
npm install
cp .env.example .env        # points at http://localhost:4000 by default
npm run dev                  # http://localhost:5173
```

Sign up a test account, and open the same page in a second browser (or an
incognito window) to test online multiplayer against yourself.

## Deploying to pogoarcade.com (GCP Cloud Build → Cloud Run)

This repo already has a working Cloud Build → Artifact Registry → Cloud Run
pipeline from an earlier, simpler version of the site (static-only, no
accounts). This branch (`full-rebuild`) adapts that same pipeline for the
full app instead of replacing it with a different host: **one Dockerfile,
one Cloud Run service**, same as before — it just now builds and runs both
the frontend and backend together (see the root `Dockerfile`: it builds
`frontend/` into static assets, then the single Node process in `backend/`
serves the API, Socket.io, *and* those static assets, all from one
container). `cloudbuild.yaml` at the repo root builds and deploys it.

### Data storage: Cloud SQL (Postgres), not a local file

User accounts, scores, login history, and password-reset tokens live in a
Cloud SQL Postgres instance — a separate, durable GCP service — not on the
Cloud Run container's own disk. This project originally used a SQLite file
sitting on that local disk, which caused real data loss in practice: Cloud
Run wipes a container's local filesystem every time it replaces that
container instance, and that can happen at *any* time — not just on a
redeploy, but on a crash or routine infrastructure-side instance recycling.
Accounts were disappearing minutes after being created. Cloud SQL fixes
this because it's not tied to the Cloud Run container's lifecycle at all;
the app connects to it fresh on every boot the same way, and the data is
simply still there.

See "Cloud SQL setup" below to provision the instance this depends on —
required before the app will boot successfully in production, since
`backend/src/server.js` won't start listening until it can reach the
database and create its tables.

### Why still one instance, not autoscaled

`cloudbuild.yaml` still pins the service to exactly **one always-on
instance** (`--min-instances 1 --max-instances 1`), but for a different
reason than before: real-time multiplayer (Socket.io room/matchmaking
state) lives in that one process's memory, not the database, so two
instances couldn't match players against each other. If this ever needs to
scale past one instance, that requires a shared Socket.io adapter (e.g.
Redis) — a separate future upgrade, not needed to launch. The database
itself has no such limit; Cloud SQL handles concurrent connections fine.

### First-time GCP setup (one-time only — run these in Cloud Shell)

Open [Cloud Shell](https://shell.cloud.google.com) (it's pre-authenticated
as you, with `gcloud` already installed — nothing to install locally), make
sure it's pointed at the right project (`gcloud config set project
YOUR_PROJECT_ID`), then run:

```bash
# 1. Create a random JWT signing secret and store it in Secret Manager
#    (never commit this to the repo).
openssl rand -base64 32 | gcloud secrets create pogo-jwt-secret --data-file=-

# 2. Let Cloud Run's runtime service account read that secret.
PROJECT_NUMBER=$(gcloud projects describe "$(gcloud config get-value project)" --format='value(projectNumber)')
gcloud secrets add-iam-policy-binding pogo-jwt-secret \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

# 3. (Only needed once — skip if a trigger already deploys this repo on
#    push to main.) Point a Cloud Build trigger at this branch so pushes to
#    full-rebuild deploy automatically too, for testing before it's merged:
gcloud builds triggers create github \
  --repo-name=pogoarcade --repo-owner=akhtars0404 \
  --branch-pattern="^full-rebuild$" \
  --build-config=cloudbuild.yaml \
  --name=pogo-arcade-full-rebuild
```

### Cloud SQL setup (required — the app won't boot without this)

Also one-time, also from Cloud Shell. This creates the Postgres instance
`cloudbuild.yaml` already expects (it references it as `pogo-db` and passes
`--add-cloudsql-instances` + `DB_HOST`/`DB_NAME`/`DB_USER`/`DB_PASSWORD`
automatically on every deploy — nothing else to wire up after this):

```bash
# 1. Create the Cloud SQL Postgres instance. This takes several minutes —
#    it's provisioning a real managed database server, not a container.
#    db-f1-micro is the cheapest tier; fine for a new site's traffic level,
#    resizable later without losing data if it needs more.
gcloud sql instances create pogo-db \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region=us-central1 \
  --storage-size=10GB \
  --storage-auto-increase

# 2. Create the database and a dedicated app user (not the default
#    postgres superuser) inside that instance.
gcloud sql databases create pogoarcade --instance=pogo-db
gcloud sql users create pogoarcade --instance=pogo-db --password="$(openssl rand -base64 24)"
# ⚠️ That password is only shown once, generated inline above and not
# echoed back — capture it immediately and store it in Secret Manager in
# the same command, rather than trying to recall it afterward. If you'd
# rather set a password you can see, run instead:
#   gcloud sql users set-password pogoarcade --instance=pogo-db --password='choose-a-strong-password-here'
# then use that same value in step 3.

# 3. Store that password in Secret Manager (this is DB_PASSWORD in
#    cloudbuild.yaml) and let Cloud Run's service account read it — same
#    pattern as the JWT secret above.
echo -n "PASTE_THE_PASSWORD_FROM_STEP_2_HERE" | gcloud secrets create pogo-db-password --data-file=-
PROJECT_NUMBER=$(gcloud projects describe "$(gcloud config get-value project)" --format='value(projectNumber)')
gcloud secrets add-iam-policy-binding pogo-db-password \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

# 4. Let Cloud Run's service account connect to Cloud SQL instances at all
#    (separate from being able to read the password secret above).
gcloud projects add-iam-policy-binding "$(gcloud config get-value project)" \
  --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
  --role="roles/cloudsql.client"
```

After this, a normal `gcloud builds submit --config=cloudbuild.yaml .` (or a
push, if a trigger is watching) picks up `DB_HOST`/`DB_NAME`/`DB_USER`
automatically from `cloudbuild.yaml` and `DB_PASSWORD` from the secret above
— no per-deploy steps. If you ever need to inspect the database directly:
`gcloud sql connect pogo-db --user=pogoarcade --database=pogoarcade` opens a
`psql` shell against it straight from Cloud Shell.

### Password reset (Resend) setup — optional, do this whenever you want real email delivery

The forgot-password flow (`POST /api/auth/forgot-password` → emailed link →
`POST /api/auth/reset-password`) is already deployed and working end to
end — it just needs an email-sending provider wired in before it can
actually deliver a link. Without it, requests to `/forgot-password` still
return success (by design — the response never reveals whether an email
is registered), but no email goes out; `backend/src/email.js` logs a
warning server-side so this is easy to notice, not a silent failure.

This uses [Resend](https://resend.com) (a free account covers this site's
volume many times over — 3,000 emails/month / 100/day):

1. Sign up at resend.com, then in their dashboard go to **Domains → Add
   Domain** and add `pogoarcade.com`. It'll give you a few DNS records
   (TXT/MX/CNAME) to add wherever `pogoarcade.com`'s DNS is managed (the
   same place you pointed the domain at this Cloud Run service). Domain
   verification usually takes a few minutes to a few hours.
2. Once verified, go to **API Keys → Create API Key** and copy it.
3. Store it in Secret Manager the same way as the JWT secret:
   ```bash
   echo -n "re_your_actual_key_here" | gcloud secrets create pogo-resend-key --data-file=-
   PROJECT_NUMBER=$(gcloud projects describe "$(gcloud config get-value project)" --format='value(projectNumber)')
   gcloud secrets add-iam-policy-binding pogo-resend-key \
     --member="serviceAccount:${PROJECT_NUMBER}-compute@developer.gserviceaccount.com" \
     --role="roles/secretmanager.secretAccessor"
   ```
4. Wire it into the Cloud Run service (`RESEND_FROM_EMAIL` must be an
   address on the domain you just verified):
   ```bash
   gcloud run services update pogo-arcade --region=us-central1 \
     --update-secrets='RESEND_API_KEY=pogo-resend-key:latest' \
     --update-env-vars='RESEND_FROM_EMAIL=PoGo Arcade <noreply@pogoarcade.com>'
   ```
That's it — no code changes or redeploy needed, `backend/src/email.js`
picks up both env vars at request time.

After that, every push to whichever branch a trigger watches runs
`cloudbuild.yaml` automatically: builds the image, pushes it to Artifact
Registry, and deploys it to the `pogo-arcade` Cloud Run service in
`us-central1` — the same service the original pipeline used, so any
existing domain mapping for `pogoarcade.com` keeps working without
re-pointing DNS.

To trigger a deploy manually instead of waiting on a push, from Cloud
Shell inside a checkout of this repo/branch:
```bash
gcloud builds submit --config=cloudbuild.yaml .
```

### Before applying for AdSense

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
- **Password reset needs Resend configured to actually deliver email** —
  the `/forgot-password` → email link → `/reset-password/:token` flow is
  fully built (see "Password reset (Resend) setup" below), but until
  `RESEND_API_KEY`/`RESEND_FROM_EMAIL` are set, requests succeed silently
  without sending anything (the API always returns the same generic
  message either way, so this fails safe rather than looking broken to a
  user). Also: only accounts that supplied an email at signup can use it —
  email is optional, per the Privacy Policy.
- **No rate limiting** on the auth endpoints — add something like
  `express-rate-limit` before this is public, to blunt brute-force login
  attempts.
- **Ad slots are placeholders** — see step 4 above.

Resolved (previously listed here as a known limitation): data used to reset
whenever Cloud Run replaced the container instance for any reason, not just
redeploys — real accounts were disappearing minutes after being created.
Fixed by moving storage from a local SQLite file to Cloud SQL (Postgres);
see "Data storage: Cloud SQL (Postgres), not a local file" above.
