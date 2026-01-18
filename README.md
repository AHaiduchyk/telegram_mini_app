# Telegram Mini App QR Scanner

A production-ready Telegram Mini App for QR scanning with a Python backend. The Mini App uses Telegram's native QR scanner, sends the raw text to the backend for storage and post-processing, and returns structured results that render as cards in the UI.

## Features

- **Telegram bot** with `/start` command and WebApp button.
- **Mini App UI** with scan button, continuous mode, history list, and details view.
- **FastAPI backend** with SQLite persistence and QR parsing helpers.
- **Structured QR parsing**: URL, WiFi, Geo, vCard, and fallback text.
- **Clean error handling** with no stack traces exposed to clients.

## Project layout

```
app/
  main.py
  db.py
  models.py
  qr_parse.py
bot/
  bot.py
web/
  index.html
requirements.txt
.env.example
```

## Setup

### 1) Create a Telegram bot

1. Talk to **@BotFather** and create a bot.
2. Enable the Mini App domain in BotFather (e.g., `https://your-domain.example`).
3. Copy the bot token.

### 2) Configure environment

Copy `.env.example` to `.env` and fill values:

```bash
cp .env.example .env
```

- `BOT_TOKEN`: your bot token.
- `MINIAPP_URL`: full URL to the Mini App (e.g., `https://your-domain.example/` or `https://your-domain.example/web/index.html`).
- `MINIAPP_ORIGIN`: origin used for CORS (e.g., `https://your-domain.example`).
- `DATABASE_URL`: SQLite URL (default: `sqlite:///./app.db`).

> **Important:** Telegram Mini Apps must be served over HTTPS in production.

### 3) Install dependencies

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 4) Run the backend

```bash
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

The backend serves the Mini App from `/` (or `/web/index.html`) and the API endpoints from `/api/*`.

### 5) Run the bot

```bash
python bot/bot.py
```

### 6) Use the Mini App

1. Open Telegram and run `/start` in your bot.
2. Tap **Open QR Scanner**.
3. Scan a QR code. The raw text is:
   - Shown in the UI immediately.
   - Sent to the backend for storage and parsing.
   - Returned to the bot via `Telegram.WebApp.sendData`.

## API endpoints

- `POST /api/scan` — store a scan and return enriched data.
- `POST /api/find_check` — fetch a DPS receipt page and return the parsed `<pre>` text.
- `POST /api/save_check` — persist a DPS receipt as a `tax_receipt` scan entry.
- `GET /api/history?user_id=...` — list scans newest-first for a user.
- `GET /api/scan/{id}` — get a single scan by id.

## Post-processing hook

Look for the comment in `app/main.py` where you can add custom post-processing or enrichment logic for the parsed QR data.
