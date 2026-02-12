# Cheatsheet

## Backend (uvicorn)
```bash
source /Users/deslang/Documents/tgminiapp/telegram_mini_app/.venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

## ngrok
```bash
ngrok http 8000
```
If you see `ERR_NGROK_334` (endpoint already online):
```bash
# stop old tunnel
ps aux | rg ngrok
pkill ngrok

# then start again
ngrok http 8000
```
Or run with load‑balancing:
```bash
ngrok http 8000 --pooling-enabled
```

## Frontend build (Figma)
```bash
cd figma_design
npm install
npm run build
```

## Frontend dev (optional)
```bash
cd figma_design
npm run dev
```

## SQLite
```bash
sqlite3 app.db
.tables
.schema transactions
SELECT * FROM transactions LIMIT 10;
```
потр