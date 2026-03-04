# General instructions

- Push back on things, don't be a sycophant
- Keep comments minimal. When replacing old logic/comments, don't muddy comments up with how things used to be.
- Don't use square brackets in logs
- Avoid factory, and generator functions
- Ask questions during the planning phase if needed
- Comment regex in steps if possible so that its human readable
- Keep any really important info you discover in the bottom of this file, under the learnings heading. Keep it super brief, as we don't want to muddy up the context for new agents too much before they even start their prompt, but don't want to repeat primer instructions.

# Brief

We have two demo components simulating CloudCannon's editor:

1. `interactive-demo` -- simulates structured data editing (frontmatter/Bookshop). DO NOT TOUCH.
2. `interactive-source-demo` -- simulates Source Editable Regions (editing hard-coded HTML). This is the active work.

The source demo shows a side-by-side view: source code (left) + visual editor (right). Users edit text in the visual preview, and the source code updates reactively. This teaches how CloudCannon's source editables work for pages without frontmatter.

See `TUTORIAL_PLAN.md` for detailed implementation status and next task.

# Visual comparison workflow

When working on HTML processing or CSS fidelity, always compare the processed preview against the live site. Don't just screenshot the preview pane -- you have nothing to compare it to.

1. Navigate to the live URL in the browser, take a `fullPage: true` screenshot
2. Navigate to `http://localhost:8080/compare/?url=<encoded-url>`, wait for the "Loaded" banner, take a `fullPage: true` screenshot
3. Compare the two screenshots top-down. Be specific about differences (e.g. "nav background is transparent instead of dark")
4. Fix processing logic in `src/assets/scripts/html-processor.js`, reload comparison page, re-screenshot, repeat

The `.cursor/rules/visual-comparison.mdc` rule triggers automatically when you touch the processor or demo files and has full details.

# Learnings

- CloudCannon docs are indexed locally (no MCP server though). Use local index over web fetches where possible.
- The Cursor browser MCP tool can't reliably test responsive breakpoints -- its viewport stays narrow regardless of resize commands. Verify `md:flex` responsive layouts in a real browser.
- The 11ty file watcher doesn't detect changes in `component-library/` files. Touch `src/pages/index.md` or restart the server to trigger a rebuild after editing bookshop components.
- CloudCannon source editable attributes: `data-editable="source"`, `data-path="/path/to/file"`, `data-key="unique-id"`. The older `class="editable"` method was deprecated Oct 2025.
- HTML processing functions (URL helpers, `parseAndCleanHtml`, `absolutifyDocument`, `serializeProcessedDoc`) live in `src/assets/scripts/html-processor.js`. Shared between the demo component and the `/compare/` page. Source context extraction stays in the demo component's inline script.
- The `/compare/` page (`src/pages/compare.html`) renders processed HTML full-viewport for visual comparison against the live site. Accepts `?url=` query param.
- Don't strip `crossorigin` from `<link>` elements -- some CDNs (e.g. Vercel's) require the CORS request flow to serve stylesheets. Only strip it from media elements (`<img>`, `<video>`, etc.).
- Promoting `<link rel="preload" as="style">` to `<link rel="stylesheet">` sounds right in theory but breaks sites that already inline critical CSS. The deferred CSS often contains non-critical rules that break layout when force-applied. External CSS also often fails to load cross-origin from the iframe anyway.