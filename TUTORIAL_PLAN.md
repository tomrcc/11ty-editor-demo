# Source Editable Demo: Implementation & Plan

## Phase 1: Core implementation — COMPLETE

Replaced the hardcoded demo content in `interactive-source-demo` with runtime-scraped HTML from a user-provided URL. The user enters a URL, the page is fetched and rendered in the preview pane, and the 5-step tutorial teaches source editing by targeting the first visible `<h1>` found in the scraped page.

### Architecture

```
Launcher button → fetchPage() loads pre-scraped HTML → DOMParser → process HTML → inject preview + generate source lines
```

**Key files:**

- `src/assets/scripts/html-processor.js` — Shared HTML processing (URL helpers, `parseAndCleanHtml`, `absolutifyDocument`, `serializeProcessedDoc`)
- `component-library/components/interactive-source-demo/interactive-source-demo.eleventy.liquid` — Main component with Alpine state, source context extraction, tutorial, and visible-h1 detection
- `component-library/components/interactive-source-demo/bits/main.eleventy.liquid` — Preview pane (sandboxed iframe with srcdoc)
- `component-library/components/interactive-source-demo/bits/sidebar.eleventy.liquid` — Source code viewer (consumes `sourceLines`)
- `src/pages/compare.html` — Full-viewport comparison page at `/compare/` for visual fidelity testing

**Data flow:**

1. User picks a launcher site → `fetchPage()` loads pre-scraped HTML from `/scraped/<hostname>.html`
2. `parseAndCleanHtml()` (shared) parses with DOMParser, strips scripts/CC attrs, strips `x-cloak`, cleans `display:var()`, finds first h1
3. `extractSourceContext()` (demo-only) extracts source context BEFORE absolutifying (keeps URLs short in source view)
4. `absolutifyDocument()` (shared) rewrites all relative URLs to absolute
5. `serializeProcessedDoc()` (shared) injects editable region styles, serializes to full HTML
6. `processedHtml` is injected into preview iframe via `x-effect` + `srcdoc`
7. On iframe load, `findVisibleH1()` picks the first rendered h1 (may differ from first DOM h1 on responsive sites). If it differs, source context is re-extracted around the correct element.
8. `sourceLines` getter assembles: `sourceContextBefore` + tutorial-step-dependent h1 lines + `sourceContextAfter`
9. Tutorial steps progressively add `data-editable`, `data-path`, `data-key` to the h1 in the source view

## Phase 1b: Image editing tutorial — COMPLETE

After the heading tutorial (steps 0-4), the user enters a free-edit phase where they can interact with the editable heading. If a suitable image was found, a floating action button (image icon) appears on the preview pane. Clicking it shows a prompt; if accepted, a second 5-step tutorial teaches the same three `data-editable`/`data-path`/`data-key` attributes on the first big visible `<img>`. The image tutorial shows combined source lines (heading + separator + image) so the heading context is preserved.

### State machine

```
heading (steps 0-4) → heading-complete (free edit, floating icon if image found)
                       → user clicks icon → prompt → accept → image (steps 0-4) → complete
                                                    → decline → complete
                     → complete (if no image found)
```

### Image detection

`findVisibleImage(iframeDoc)` runs in the iframe on load alongside `findVisibleH1`. Heuristic: visible, not decorative (`aria-hidden`, `role=presentation`), rendered size >= 150x80, not a data URI. Source context extracted by reusing `extractSourceContext(doc, imgEl)` with the matching element from a re-parsed doc (matched by index).

### Key changes

- `tutorialPhase` state: `'heading'` | `'heading-complete'` | `'image'` | `'complete'`
- `showImagePrompt` state: controls the floating popover visibility
- `sourceLines` renamed `isHeading` → `isTarget` (sidebar updated to match)
- `extractSourceContext` renamed `h1El` → `targetEl`, return `indent` instead of `h1Indent`
- `enableImageEditing()` adds `editable-region` class and click handler; clicking opens a URL input popover inside the iframe
- Overlay (`main.eleventy.liquid`) and sidebar dimming only active during `heading` and `image` phases (not during `heading-complete` or `complete`)
- During image phase, `buildCombinedSourceLines()` shows heading (fully attributed) + `<!-- ... -->` separator + image section. Both heading and image target lines have `isTarget: true` for full opacity

## Phase 2: Edge-case hardening — IN PROGRESS

The core demo works on many sites. This phase iterates on real-world sites that break and fixes them one at a time.

### Workflow

1. User reports a site that doesn't work (or agent finds one during testing)
2. Agent runs the visual comparison workflow (see `.cursor/rules/visual-comparison.mdc`): screenshot the live site, screenshot the `/compare/` page, compare top-down
3. Agent identifies specific differences (missing backgrounds, hidden elements, broken layouts, etc.)
4. Agent plans and implements fixes in `html-processor.js` (for rendering issues) or the demo component (for tutorial/editing issues)
5. Re-screenshot and verify

### Edge cases handled

| Site | Issue | Fix |
|------|-------|-----|
| cloudcannon.com | Alpine `x-cloak` hid the logo; `display:var(--flag)` broke the announcement banner after script stripping | Strip `x-cloak` attrs; infer default visibility from `x-show` expressions; remove `display:var()` from inline styles |
| aaronhawkins.nz | Divi responsive layout hides first h1 at narrow widths; demo targeted the hidden one | `findVisibleH1()` walks h1s checking `getComputedStyle` in the rendered iframe; re-extracts source context if visible h1 differs from first |

### Future consideration: Shadow DOM migration

The preview is currently a sandboxed iframe with `srcdoc`. An earlier investigation explored Shadow DOM as an alternative to avoid Alpine interference and style bleeding. Key findings preserved here:

- **Shadow DOM would eliminate the need for Alpine attribute stripping** — Alpine can't traverse shadow boundaries, so scraped `x-data`/`x-show` attrs become harmless.
- **CSS encapsulation** would prevent scraped stylesheets from affecting demo chrome (toolbar, sidebar, tooltip).
- **Trade-offs:** `@font-face` won't cross the shadow boundary (fonts fall back to system — same as current CORS behavior). `contenteditable` and event listeners work fine inside shadow DOM. External `<link>` stylesheets load normally.
- **Decision:** Deferred. The iframe approach works well enough and the Alpine/style issues are manageable. Revisit if style bleeding becomes a real problem.

## Learnings

- **11ty file watcher doesn't detect `component-library/` changes.** Touch `src/pages/index.md` or restart the server after editing bookshop components.
- **Build-time scraping:** The demo loads pre-scraped HTML from `src/scraped/<hostname>.html` instead of fetching via a runtime CORS proxy. `scripts/scrape-sites.js` fetches the 5 launcher sites and writes static files. Runs automatically on `npm run build`; run `npm run scrape` manually during dev. The `/compare/` page still uses `corsproxy.io` (localhost-only dev tool).
- **Alpine `x-cloak` handling:** Sites using Alpine.js have `[x-cloak]{display:none!important}` in CSS. Since scripts are stripped and Alpine never initialises, `x-cloak` elements stay hidden. The processor removes `x-cloak` and infers default visibility from `x-show` expressions (negated = visible by default, bare var = hidden by default).
- **Script-dependent CSS variables:** Inline styles like `display:var(--flag)` break when the script that defines the variable is stripped. The processor removes `display:var()` declarations so class-based rules take over.
- **Font CORS errors are expected.** Some sites restrict font loading to specific origins. Fonts fall back to system fonts — harmless.
- **Source context extracted before absolutification.** Keeps URLs short and readable in the source view. The preview gets absolutified URLs so assets load correctly.
- **`sourceLines` format is the contract.** The sidebar template consumes `[{ text, prop?, isNew?, isTarget? }]`. `prop` drives the edit flash, `isNew` drives tutorial highlights, `isTarget` drives dimming.
- **Visible h1 detection must happen in the iframe.** DOMParser has no layout engine so `getComputedStyle` isn't available. The iframe `load` event guarantees styles are applied. If the visible h1 differs from the first, source context is re-extracted via a second `parseAndCleanHtml` + `extractSourceContext` pass.
- **Tooltip position formula:** `tabH + (targetLine * lineH) - scrollTop`. `targetLine` is `sourceContextBefore.length` + step-dependent offset. Sidebar auto-scrolls h1 to ~2 lines from top on load.
- **`isContentEditable` guard** in `enableH1Editing()` prevents double-attaching listeners if called more than once.
