# Troubleshooting: frontend edits not showing up in the browser

## Symptom

Edited a React component (in this case, styling changes to `LandingPage.tsx` — text size, color, margin), refreshed `http://localhost:5173/` in the browser, and saw no change at all, even after multiple refreshes.

## What was ruled out first

Before assuming anything structural was wrong, each of these was checked directly and came back clean:

- The edited file on disk had the correct, saved content.
- Fetching the file straight from the Vite dev server (`curl http://localhost:5173/src/pages/LandingPage.tsx`) returned the updated source, with a `Cache-Control: no-cache` response header — so Vite itself wasn't caching a stale copy.
- The full import chain (`index.html` → `src/main.tsx` → `App.tsx` → the page component) had no errors and routed correctly.
- A full repo-wide audit confirmed there's only **one** of each config: `tailwind.config.js`, `postcss.config.js`, `vite.config.ts`, `index.html`, `src/main.tsx` entry point, `package.json`, and `src/index.css`. No second frontend app, no stale `dist/`/`build/` output anywhere, nothing committed that shouldn't be.
- The FastAPI backend (port 8000) mounts no static files and serves no frontend bundle — it isn't a second thing a browser could accidentally be pointed at instead of Vite (port 5173).

So this was **not** a case of CSS/config being defined in multiple competing places (that hypothesis was reasonable to suspect given past history, but didn't hold up here).

## Actual root cause

The Vite dev server process had been running continuously for about a month without ever being restarted. A dev server left running that long — through a huge number of file edits and hot-reload updates across many sessions — can end up with its file-watcher or module graph (and/or the browser tab's hot-reload WebSocket connection) in a stale state, even while it still answers plain HTTP requests correctly. Since `curl` only tests plain HTTP requests, it couldn't detect this — every file-level check passed while the actual live browser session was still stuck.

## Fix

1. Kill the long-running Vite process:
   ```
   ps -ef | grep vite   # find the PID
   kill <pid>
   ```
2. Clear Vite's dependency cache to rule out anything stale in it:
   ```
   rm -rf frontend/node_modules/.vite
   ```
3. Start a fresh dev server:
   ```
   cd frontend && npm run dev
   ```
4. **Close and reopen the browser tab** — not just hit refresh. A plain refresh can reuse an existing (possibly dead) hot-reload WebSocket connection; a fresh tab guarantees a clean connection to the new server.

## Quick checklist for next time

If a frontend edit genuinely isn't showing up after a refresh:

1. Confirm the edit is actually saved on disk (`grep` for the new text/class in the file).
2. Confirm Vite is serving that exact content: `curl http://localhost:5173/src/<path-to-file>` and look for your change in the response.
3. If both of those are correct but the browser still shows the old version — stop looking at the code, and restart the dev server (steps above) plus open a fresh browser tab. This was the actual fix both times this has come up.
4. Only if the problem persists after a clean server + fresh tab is it worth re-auditing for genuine config duplication (multiple `tailwind.config.js`/`vite.config.ts`/`index.html`, a stale `dist/` folder, or the backend accidentally serving a built frontend bundle).

## Related cleanup done at the same time

Found (not the cause of the bug above, but a real instance of "same styling loaded from two places"): Leaflet's CSS was being loaded twice — once via a CDN `<link>` tag in `frontend/index.html`, and again via the npm package import already in `frontend/src/components/map/ActivityMap.tsx`. Removed the CDN link so the npm-imported copy (version-pinned via `package.json`, bundled by Vite) is the single source.
