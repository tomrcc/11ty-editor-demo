# Scraped HTML Tutorial: Implementation Status

## What we're building

Replacing the hardcoded demo content in `interactive-source-demo` with runtime-scraped HTML from a user-provided URL. The user enters a URL, the page is fetched and rendered in the preview pane, and the existing 5-step tutorial teaches source editing by targeting the first `<h1>` found in the scraped page.

## Architecture

```
URL Input → fetch via CORS proxy → DOMParser → process HTML → inject preview + generate source lines
```

**Key files:**

- `component-library/components/interactive-source-demo/interactive-source-demo.eleventy.liquid` — Main component with Alpine state, processing logic, and tutorial
- `component-library/components/interactive-source-demo/bits/main.eleventy.liquid` — Preview pane (now dynamic innerHTML)
- `component-library/components/interactive-source-demo/bits/sidebar.eleventy.liquid` — Source code viewer (unchanged, consumes `sourceLines`)

**Data flow:**

1. User enters URL → `fetchPage()` fetches via `corsproxy.io` CORS proxy
2. `processScrapedHtml()` parses with DOMParser, strips scripts/Alpine attrs/CC attrs, absolutifies URLs, finds h1, extracts source context
3. Source context is extracted BEFORE URL absolutification (so source view shows short original URLs, preview gets absolute URLs)
4. `processedBodyHtml` is injected into preview via `x-effect` + `innerHTML`
5. `sourceLines` getter assembles: `sourceContextBefore` + tutorial-step-dependent h1 lines + `sourceContextAfter`
6. Tutorial steps progressively add `data-editable`, `data-path`, `data-key` to the h1 in the source view

## Implementation stages and status

### Stage 1: URL Input & Fetching — DONE

- Added `mode` ('input' | 'demo'), `url`, `rawHtml`, `pageUrl`, `loading`, `error` to Alpine state
- URL input UI with form, loading spinner, error display, example URL buttons
- Fetch via configurable `CORS_PROXY` constant (`https://corsproxy.io/?url=`)
- Auto-prepends `https://` if protocol missing

### Stage 2: HTML Processing — DONE

Standalone functions outside Alpine (top of `<script>` block):

- `shouldAbsolutify`, `absolutifyUrl`, `absolutifySrcset`, `absolutifyCssUrls` — URL rewriting helpers
- `processScrapedHtml(rawHtml, pageUrl)` — full processing pipeline:
  1. Parse with DOMParser
  2. Extract and remove `<base href>`
  3. Remove `<script>`, `<noscript>`
  4. Strip Alpine attributes (`x-*`, `@*`, `:*`); hide `x-show` elements (they default to hidden)
  5. Strip CloudCannon attributes (`data-editable`, `data-prop`, `data-path`, `data-key`, `data-type`)
  6. Find first `<h1>` (throws if none)
  7. Extract source context (before absolutifying)
  8. Absolutify all URLs
  9. Collect head styles for preview
  10. Return `{ bodyHtml, headingText, sourceContext }`

### Stage 3: Preview Rendering — DONE

- `bits/main.eleventy.liquid` replaced: hardcoded layout → single `div[x-ref="previewPane"]` with `x-effect` injecting `processedBodyHtml`
- Tutorial dimming overlay preserved

### Stage 4: Source Line Generation — DONE

Standalone functions:

- `formatAttrs(el)` — up to 3 meaningful attrs, truncated to 35 chars
- `formatOpenTag`, `formatCloseTag`, `formatCollapsed` — HTML serialization for source view
- `extractSourceContext(doc, h1El)` — walks DOM from body to h1:
  - Expands ancestor elements (shows their children)
  - Collapses non-ancestor siblings (max 2 before/after)
  - Returns `{ before, after, h1Indent }`

`sourceLines` getter now: `sourceContextBefore` + h1 lines (tutorial-dependent) + `sourceContextAfter`

### Stage 5: Tutorial Tooltip Positioning — DONE

- `tooltipTop()` now computes the h1's line index dynamically from `sourceContextBefore.length`
- Each tutorial step offsets from `h1Start` to point at the relevant attribute line
- Accounts for sidebar scroll offset via `x-ref="sourceScroll"` on the scroll container
- Auto-scrolls sidebar on demo load so h1 has ~2 context lines visible above it

### Stage 6: Two-way Binding — DONE

- `_previewH1` ref stored in `fetchPage()` `$nextTick` after innerHTML injection
- `enableH1Editing()` sets `contentEditable`, adds `.editable-region` class, attaches `input` listener
- `$watch('heading', ...)` with cursor-jump guard syncs programmatic changes without fighting user cursor
- Editing activates at tutorial step 3 (when all source attributes are visible) via `nextStep()`

### Stage 7: Cleanup — DONE

- Removed `description`, `buttonText`, `heroImage`, `navbarImage`, `footerImage` from Alpine state
- Changed `heading` init from Liquid template value to `''` (overwritten by `fetchPage()`)
- Removed `navigation` and `page` blocks from bookshop.yml blueprint
- Added 5MB max HTML size guard in `fetchPage()`
- Deleted redundant `SCRAPED_HTML_PLAN.md`

## Learnings

- **11ty file watcher doesn't detect `component-library/` changes.** Touch `src/pages/index.md` or restart the server after editing bookshop components.
- **CORS proxy:** `corsproxy.io` is free for localhost/dev. Production domains need the $5/mo Hobby plan. The proxy URL is a single constant (`CORS_PROXY`) — easy to swap.
- **Alpine attribute stripping:** Scraped pages using Alpine.js will have `x-data`, `x-show`, `x-trap` etc. that conflict with our Alpine instance. We strip all `x-*`, `@*`, `:*` attributes. Elements with `x-show` must be hidden (`display:none`) because they rely on Alpine to evaluate visibility — without it they'd be permanently visible (this caused CloudCannon.com's search modal to cover the page).
- **Font CORS errors are expected.** Some sites restrict font loading to specific origins. Fonts just fall back to system fonts — harmless.
- **Source context extracted before absolutification.** This keeps URLs short and readable in the source view. The preview gets absolutified URLs so assets load correctly.
- **`sourceLines` format is the contract.** The sidebar template consumes `[{ text, prop?, isNew?, isHeading? }]`. Any source line generator must output this shape. `prop` drives the edit flash, `isNew` drives tutorial highlights, `isHeading` drives dimming.
- **The `x-effect` cursor-jump guard** (`if (document.activeElement !== $el) $el.textContent = val`) prevents programmatic updates from fighting with the user's cursor during editing. Must be preserved in Stage 6.
- **Tooltip position formula:** `tabH + (targetLine * lineH) - scrollTop`. `targetLine` is `sourceContextBefore.length` + step-dependent offset. Sidebar auto-scrolls h1 to ~2 lines from top on load.
- **`isContentEditable` guard** in `enableH1Editing()` prevents double-attaching listeners if called more than once.
