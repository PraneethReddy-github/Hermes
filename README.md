# Hermes

**Hermes — a self-hosted personal command center for tasks, deadlines, calendar and notes, built for your phone.**

Hermes is a single-user progressive web app that you run on your own laptop or server. Everything lives in one SQLite file that you own, the app makes no outbound network requests, and it installs to your phone's home screen like a native app. Type a sentence like `SCAD report +Uni #assignment !3 fri 23:59 ~4h` and it becomes a task with a project, label, priority, deadline and time estimate.

## Features

- **Tasks** with priorities (0-4), due dates and times, time estimates, labels, projects, subtasks and repeating schedules. Views for Today, Upcoming and Completed.
- **Quick-add** natural-language input (English and German), with live chips showing what was understood.
- **Shopping** checklist for quick grocery-style items.
- **Calendar** with agenda, day, 3-day, week and month views. Tasks with deadlines show up alongside events.
- **Repeating events** with "this event", "this and following" and "all events" edits.
- **ICS import** for existing calendars (`.ics` files up to 2 MB).
- **Capture sheet**: one input that auto-detects whether you typed a task, an event (`dentist tomorrow 14-15`), a note or a shopping item.
- **Notes** with Markdown.
- **Full-text search** across tasks, events and notes.
- **Today overview** with deadlines, a timeline of today's events and a summary strip.
- **Installable PWA** with an offline fallback page, light and dark themes.
- **Optional TOTP two-factor authentication** (any authenticator app).
- **Nightly automatic backups** of the database.

### Quick-add syntax

| Token                        | Meaning                 | Example                                     |
| ---------------------------- | ----------------------- | ------------------------------------------- |
| `+Project` / `+"Two Words"`  | Project (must exist)    | `+Uni`, `+"Home Lab"`                       |
| `#label`                     | Label (repeatable)      | `#assignment #urgent`                       |
| `!0` to `!4`                 | Priority                | `!3`                                        |
| `~30m`, `~2h`                | Time estimate           | `~4h`                                       |
| `fri 23:59`, `tomorrow 9am`  | Due date and time       | `next monday`, `in 3 days`, `24.12.`, `3/5` |
| `every day`, `every 2 weeks` | Repeat                  | `every monday`, `every month`               |
| `"quoted text"`              | Kept literally in title | `Read "Friday Night Lights" chapter 2`      |

Example: `SCAD report +Uni #assignment !3 fri 23:59 ~4h` creates the task "SCAD report" in project Uni, labelled `assignment`, priority 3, due Friday 23:59, estimated at 4 hours. A date without a time means end of that day. Numeric dates are day-first (`3/5` is 3 May).

## Privacy and security

- Single user. Your data stays in one SQLite file (`hermes.db`) that you own.
- No outbound network calls: no analytics, no fonts or scripts from CDNs, no telemetry.
- Passwords are hashed with argon2id.
- Login is rate-limited per client address, with growing lockouts after repeated failures.
- A strict Content Security Policy is sent with every page (`default-src 'self'`, no framing).
- The TOTP secret is stored encrypted (AES-256-GCM) with a key that is generated on first run and kept outside the database.
- Account creation is gated by a one-time setup token printed to the server log, so nobody else can claim a fresh instance.

## Requirements

- Docker or Podman with Compose, **or**
- Node.js 22 and npm to run without Docker.

## Quick start (Docker Compose)

```sh
git clone https://github.com/PraneethReddy-github/Hermes.git hermes
cd hermes
mkdir -p data
```

Open `docker-compose.yml` and set `ORIGIN` to the exact URL you will use in the browser (see [Remote access](#remote-access)). For a local test, `http://localhost:3000` works.

```sh
docker compose up -d
```

Then open your `ORIGIN` in a browser. You are sent to `/setup`. The one-time setup token is printed in the server log:

```sh
docker compose logs hermes
# look for: [hermes] Setup token: ...
```

Paste the token and choose your own username, password and timezone. Nothing personal is shipped in the repository; your account is created at first run.

The container runs as uid 1000, so `./data` must be writable by that user before the first start:

```sh
sudo chown 1000:1000 data            # rootful Docker
podman unshare chown 1000:1000 data  # rootless Podman
```

If the app is unreachable and `docker compose logs hermes` shows `SQLITE_CANTOPEN`, this step was missed: run it, then `docker compose restart`.

## Remote access

By default the compose file publishes Hermes on `127.0.0.1:3000` only. To reach it from your phone, put HTTPS in front of it. **Installing the PWA requires HTTPS** (plain `http://localhost` is the only exception).

**Tailscale (recommended).** Install Tailscale on the host and your phone, enable HTTPS certificates for your tailnet, then run:

```sh
tailscale serve --bg 3000
```

Set `ORIGIN` to `https://<machine>.<tailnet>.ts.net` and restart (`docker compose up -d`). Your app is reachable only from devices on your tailnet.

**Reverse proxy** (Caddy, nginx, Traefik). Point it at `127.0.0.1:3000`, terminate TLS, set `ORIGIN` to the public URL, and make the proxy send the real client address in `X-Forwarded-For`. Keep `ADDRESS_HEADER=X-Forwarded-For` and set `XFF_DEPTH` to the number of trusted proxies in front of Hermes (the compose file uses `1`). Without these, every client appears to come from the proxy's address and login rate limiting would lock you out after a few failed attempts. Only enable them behind a proxy you control, since a client could otherwise spoof the header.

`ORIGIN` must match the URL in the browser exactly (scheme, host and port); otherwise form submissions are rejected.

## Install on your phone

- **iOS (Safari):** open your Hermes URL, tap Share, then **Add to Home Screen**.
- **Android (Chrome):** open your Hermes URL, open the menu, then **Install app** (or **Add to Home screen**).

## Configuration

Set these in the `environment:` section of `docker-compose.yml` (or in your shell when running without Docker).

| Variable            | Default                       | Meaning                                                                                                            |
| ------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `ORIGIN`            | none (required in production) | Public URL of the app, e.g. `https://hermes.example.com`. Must match the browser URL.                              |
| `HERMES_DATA_DIR`   | `./data` (`/data` in Docker)  | Directory holding `hermes.db`, `secrets.key` and `backups/`.                                                       |
| `HERMES_SECRET_KEY` | unset                         | Optional base64-encoded 32-byte key for encrypting the TOTP secret. If unset, a key is generated in `secrets.key`. |
| `PORT`              | `3000`                        | Port the server listens on.                                                                                        |
| `HOST`              | `0.0.0.0`                     | Interface to bind when running without Docker.                                                                     |
| `BODY_SIZE_LIMIT`   | `512K` (`3M` in Docker image) | Maximum request body size. Must be at least `3M` for `.ics` uploads (limit 2 MB).                                  |
| `ADDRESS_HEADER`    | unset                         | Header containing the client address behind a proxy, e.g. `X-Forwarded-For`. Used for login rate limiting.         |
| `XFF_DEPTH`         | `1`                           | Number of trusted proxies when `ADDRESS_HEADER` is `X-Forwarded-For`.                                              |
| `TZ`                | `UTC` (in Docker image)       | Process timezone. Your display timezone is chosen in the app; nightly backups run at 03:30 in that timezone.       |

Generate a key if you prefer to supply your own: `openssl rand -base64 32`.

## Running without Docker

```sh
git clone https://github.com/PraneethReddy-github/Hermes.git hermes
cd hermes
npm ci
npm run build
ORIGIN=http://localhost:3000 \
HERMES_DATA_DIR=./data \
BODY_SIZE_LIMIT=3M \
node build
```

The setup token is printed to the terminal on first visit to `/setup`. Database migrations are applied automatically at startup. Use a process manager such as systemd to keep it running.

## Backups and restore

A backup runs every night at 03:30 in your timezone, and at startup if none exists from the last 24 hours. Files go to `data/backups/hermes-YYYYMMDD-HHmm.db` (UTC timestamp) and the newest 14 are kept.

`data/secrets.key` encrypts your TOTP secret and **must be backed up together with the database**. For an off-site copy, take `data/backups/` and `data/secrets.key` (or the whole `data/` directory).

To restore:

```sh
docker compose stop hermes
cp data/backups/hermes-YYYYMMDD-HHmm.db data/hermes.db
rm -f data/hermes.db-wal data/hermes.db-shm
docker compose start hermes
```

## Lost your two-factor device

If you enabled TOTP and lost your authenticator, turn it off directly in the database (requires the `sqlite3` command-line tool on the host):

```sh
docker compose stop hermes
sqlite3 data/hermes.db "UPDATE users SET totp_secret_enc = NULL;"
docker compose start hermes
```

Log in with your password and re-enable two-factor in Settings, Security.

## Updating

```sh
git pull
docker compose up -d --build
```

Without Docker: `git pull && npm ci && npm run build`, then restart `node build`. Your data in `data/` is untouched; migrations run automatically.

## Development

```sh
npm install
npm run dev            # dev server on http://localhost:5173
npm run test:unit      # unit tests (vitest, watch mode; add -- --run for one pass)
npx playwright install chromium   # once, for end-to-end tests
npm run test:e2e       # end-to-end tests (Playwright)
npm run check          # svelte-check / TypeScript
npm run lint           # prettier + eslint
```

## Tech stack

- [SvelteKit](https://svelte.dev/docs/kit) (Svelte 5) with the Node adapter
- SQLite via better-sqlite3 and Drizzle ORM, with FTS5 for search
- Tailwind CSS
- vite-pwa (service worker, web manifest)
- chrono-node for natural-language dates, rrule for recurrence, marked for Markdown
- argon2id (`@node-rs/argon2`) for passwords, TOTP for two-factor
- Vitest and Playwright for tests

## License

[MIT](LICENSE)
