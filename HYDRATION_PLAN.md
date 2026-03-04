# Plan: Playwright Render Server for Hydrated HTML

## Problem

The compare page and demo component fetch raw HTML via a CORS proxy (`fetch` through corsproxy.io). This returns server-rendered HTML before any JavaScript runs. For JS-hydrated sites (React, Vue, Next.js, etc.), the fetched HTML is incomplete or empty — content that's injected by client-side JS is missing entirely.

This affects **7 of 7 unfixed edge cases** in `edge-cases.md`:

| Site | Current issue | Why hydration fixes it |
|---|---|---|
| tailwindcss.com | Blank body — content is JS-injected | Hydrated HTML has all content |
| nextjs.org | Below-fold content missing (React hydration) | Same |
| cloudflare.com | Blank body below nav | Same |
| aaronhawkins.nz | CSS loaded via `onload="this.rel='stylesheet'"` never fires | Browser executes the handler |
| pagefind.app | Mobile nav visible — JS that hides it never runs | JS runs and collapses it |
| rosey.app | Same as pagefind.app | Same |
| developer.mozilla.org | Images CORS-blocked from iframe origin | Real browser loads from real origin |

## Approach

A small local Node HTTP server using Playwright that:

1. Receives a URL
2. Opens it in a headless browser
3. Waits for hydration
4. Extracts `document.documentElement.outerHTML`
5. Returns the post-hydration HTML

The compare page (and optionally the demo component) calls this server instead of corsproxy.io when hydrated mode is requested.

## Architecture

```
[Compare page]  --fetch-->  [Render server :3001]  --Playwright-->  [Target site]
                                    |
                                    v
                            Returns hydrated HTML
```

### Render server (`scripts/render-server.js`)

Single file, no new dependencies (Playwright is already in devDependencies).

- Express-free — use Node's built-in `http.createServer`
- Single endpoint: `GET /render?url=<encoded-url>`
- Launch a **persistent** browser instance on startup (not per-request)
- Per request: open a new **context** (isolated cookies/storage), navigate, wait, extract HTML, close context
- CORS headers restricted to the 11ty dev server origin

Key decisions:

- **Wait strategy**: Use `waitUntil: 'networkidle'` with a timeout (e.g. 15s). This waits until no network requests for 500ms, which is a good proxy for "hydration complete". Fall back to the timeout for sites with persistent connections (analytics, websockets). If this proves unreliable, an alternative is `domcontentloaded` + a short fixed delay (~2s).
- **Browser reuse**: Launch once, create a new `BrowserContext` per request (not just a `Page` — context gives full isolation of cookies, cache, and storage). Avoids the ~1-2s cold-start per request while keeping requests independent.
- **Viewport**: Match the existing `VIEWPORT` constant (1280×720) for consistency with batch tests.
- **Resource blocking**: Optionally block images/fonts/media during fetch to speed things up (we only need the DOM). Worth trying but not essential — the demo eventually needs images anyway.
- **URL validation**: Reject non-HTTP(S) schemes and private/reserved IP ranges to prevent SSRF. Even though this is a local dev tool, the server is reachable from any page in the user's browser.
- **Concurrency limit**: Cap in-flight renders (e.g. 3) and return 429 beyond that, so a burst of requests can't exhaust memory.

Rough implementation:

```javascript
const http = require('http');
const { chromium } = require('playwright');
const { URL } = require('url');
const dns = require('dns/promises');
const net = require('net');

const PORT = 3001;
const ALLOWED_ORIGIN = 'http://localhost:8080';
const TIMEOUT = 15_000;
const MAX_CONCURRENT = 3;

let browser;
let inFlight = 0;

// Block private/reserved IPs to prevent SSRF
function isPrivateIP(ip) {
  if (net.isIPv6(ip)) return ip === '::1' || ip.startsWith('fe80') || ip.startsWith('fc') || ip.startsWith('fd');
  const parts = ip.split('.').map(Number);
  return parts[0] === 10
    || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
    || (parts[0] === 192 && parts[1] === 168)
    || parts[0] === 127
    || (parts[0] === 169 && parts[1] === 254);
}

async function validateUrl(raw) {
  const parsed = new URL(raw);
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('Only http/https URLs are allowed');
  }
  const { address } = await dns.lookup(parsed.hostname);
  if (isPrivateIP(address)) {
    throw new Error('URLs resolving to private/reserved IPs are not allowed');
  }
  return parsed.href;
}

async function renderPage(url) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  try {
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'networkidle', timeout: TIMEOUT });
    return await page.content();
  } finally {
    await context.close();
  }
}

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

async function start() {
  browser = await chromium.launch({ headless: true });

  const server = http.createServer(async (req, res) => {
    setCorsHeaders(res);

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const { searchParams } = new URL(req.url, `http://localhost:${PORT}`);
    const url = searchParams.get('url');

    if (!url) {
      res.writeHead(400);
      res.end('Missing ?url= parameter');
      return;
    }

    if (inFlight >= MAX_CONCURRENT) {
      res.writeHead(429);
      res.end('Too many concurrent requests');
      return;
    }

    inFlight++;
    try {
      const validated = await validateUrl(url);
      const html = await renderPage(validated);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch (err) {
      console.error('Render failed:', err.message);
      res.writeHead(502);
      res.end('Render failed');
    } finally {
      inFlight--;
    }
  });

  server.listen(PORT, () => console.log(`Render server listening on :${PORT}`));
}

start();
```

### Compare page changes (`src/pages/compare.html`)

Add a toggle (checkbox or `?hydrate=true` query param) that switches between:

- **Fast path** (default): Current `fetch` via corsproxy.io — fast, works for static/SSG sites
- **Hydrated path**: `fetch` from `localhost:3001/render?url=...` — slower (~3-8s), needed for JS-heavy sites

The `loadPreview` function picks the fetch URL based on the toggle. Everything downstream (`parseAndCleanHtml`, `absolutifyDocument`, `serializeProcessedDoc`) stays the same — the hydrated HTML is still just HTML, it just has more content in it.

```javascript
async function loadPreview(targetUrl) {
  // ... existing normalization ...

  const useHydrated = document.getElementById('hydrate-toggle')?.checked
    || new URLSearchParams(window.location.search).has('hydrate');

  const fetchUrl = useHydrated
    ? `http://localhost:3001/render?url=${encodeURIComponent(normalized)}`
    : CORS_PROXY + encodeURIComponent(normalized);

  const resp = await fetch(fetchUrl);
  // ... rest of existing logic ...
}
```

### npm script

Add to `package.json`:

```json
"render-server": "node scripts/render-server.js"
```

And update `start` to run it in parallel:

```json
"start": "npm-run-all sass:build tailwind:build bookshop-sass:build --parallel bookshop-sass:watch sass:watch tailwind:watch eleventy:watch render-server"
```

### Batch test integration (`tests/batch-visual-test.js`)

The batch test currently screenshots the compare page (which uses corsproxy.io). To also test hydrated mode:

- Add a `--hydrated` CLI flag or a second pass that appends `?hydrate=true` to the compare URL
- Or just test both modes and include both processed screenshots in the report

This is optional for the initial implementation — manual testing via the compare page is sufficient to validate.

## Implementation order

1. **Create `scripts/render-server.js`** — the server with the persistent browser, `/render` endpoint, URL validation, CORS lockdown, context isolation, and concurrency limit
2. **Update `src/pages/compare.html`** — add the hydrate toggle and dual-path fetch
3. **Add `render-server` npm script** to `package.json`, wire into `start`
4. **Manual test** — run the render server, open compare page with `?hydrate=true&url=https://tailwindcss.com`, verify content renders
5. **Test the 7 edge cases** — check each unfixed site in `edge-cases.md` with hydrated mode
6. **Update `edge-cases.md`** — change status on any that now pass
7. **Hardening** (can be done after the core is validated):
   - **Graceful shutdown** — add `SIGINT`/`SIGTERM` handlers that call `browser.close()` to prevent orphaned Chromium processes
   - **Browser crash recovery** — detect when the persistent browser dies and relaunch it automatically instead of failing all subsequent requests
   - **Health check endpoint** — `GET /health` returns 200 when the server and browser are ready; the compare page can probe this to show/hide the hydrate toggle
   - **Request-level timeout** — `req.setTimeout()` as a safety net in case something hangs beyond the Playwright navigation timeout

## Caveats

- **Speed**: Each hydrated fetch takes 3-8s depending on the site. The fast path should remain the default.
- **Memory**: The persistent browser uses ~100-200MB. Acceptable for a dev tool.
- **Cookie banners / popups**: JS-hydrated sites may show cookie consent modals that weren't visible in the raw HTML. The HTML processor's script stripping won't help here since the modal markup is already in the hydrated DOM. Could dismiss them in Playwright before extracting HTML, but that's a future enhancement.
- **Auth walls**: Some sites redirect to login after JS runs. Not in scope.
- **Playwright package**: The rough implementation imports from `playwright` directly. If only `@playwright/test` is in devDependencies, the standalone `playwright` package may also need adding. Check before implementing.
- **Playwright browsers**: The user needs Playwright browsers installed (`npx playwright install chromium`). Already the case if `tests/batch-visual-test.js` runs.
