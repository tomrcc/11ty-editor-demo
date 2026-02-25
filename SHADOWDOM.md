# Shadow DOM Migration for Preview Pane

## Why

The scraped HTML preview is currently injected via `innerHTML` into a regular div. This causes two problems:

1. **Alpine interference** — Our page's Alpine instance detects new DOM nodes (via MutationObserver) and tries to process any `x-data`, `x-show`, `x-trap`, etc. in the scraped HTML. We currently work around this by stripping all Alpine attributes during processing, plus hiding `x-show` elements. This is fragile and site-specific edge cases keep appearing (e.g. CloudCannon's search modal).

2. **Style bleeding** — Scraped CSS (`<style>` blocks, `<link>` stylesheets) applies globally, potentially breaking our demo chrome (toolbar, sidebar, tooltip). We haven't hit major issues yet but it's a time bomb.

Shadow DOM solves both problems at the root. Alpine can't traverse into shadow boundaries, and CSS is encapsulated by default.

## What to change

### 1. `bits/main.eleventy.liquid` — Switch to Shadow DOM injection

Current (line 3-4):
```html
<div
  x-ref="previewPane"
  x-effect="if (processedBodyHtml) $refs.previewPane.innerHTML = processedBodyHtml"></div>
```

Change to:
```html
<div
  x-ref="previewPane"
  x-effect="if (processedBodyHtml) {
    if (!$refs.previewPane.shadowRoot) $refs.previewPane.attachShadow({ mode: 'open' });
    $refs.previewPane.shadowRoot.innerHTML = processedBodyHtml;
  }"></div>
```

The shadow root is created once, then its innerHTML is set. Subsequent updates (if any) just replace the shadow content.

### 2. `processScrapedHtml()` — Remove Alpine stripping

The entire Alpine attribute stripping block (lines ~273-287 in `interactive-source-demo.eleventy.liquid`) can be deleted:

```javascript
// DELETE THIS BLOCK:
doc.querySelectorAll('*').forEach(el => {
  const hadXShow = el.hasAttribute('x-show');
  for (const attr of [...el.attributes]) {
    const n = attr.name;
    if (n.startsWith('x-') || n.startsWith('@') || n.startsWith(':')) {
      el.removeAttribute(n);
    }
  }
  if (hadXShow) {
    el.style.display = 'none';
  }
});
```

With Shadow DOM, Alpine attributes in the scraped HTML are harmless — Alpine never sees them. The scraped page's own Alpine (if it had one) won't initialize either, since its `<script>` tags were already removed.

### 3. Stage 6 (two-way binding) — Query inside shadow root

When attaching `contenteditable` and event listeners to the h1 in the preview, query inside the shadow root instead of the regular DOM:

```javascript
// Instead of:
const h1 = $refs.previewPane.querySelector('h1');

// Use:
const h1 = $refs.previewPane.shadowRoot.querySelector('h1');
```

The `contenteditable` attribute works fine inside shadow DOM. Event listeners attached directly to shadow DOM elements work normally.

### 4. Keep CloudCannon attribute stripping

The CloudCannon `data-editable`, `data-prop`, `data-path`, `data-key` stripping should stay. These aren't an Alpine issue — they're cleaned to avoid conflicts with the tutorial's own attribute additions.

## Considerations

### CSS that won't cross the shadow boundary

- **`@font-face` declarations** — Fonts defined in the scraped page's CSS won't load inside shadow DOM. The page will fall back to system fonts. We're already seeing font CORS errors for sites like cloudcannon.com, so this is no worse than the current behavior.
- **`@import` in stylesheets** — CSS `@import` inside shadow DOM works if the URLs are absolute (which they are, since we absolutify them).
- **External `<link>` stylesheets** — These DO work inside shadow DOM. The browser fetches and applies them within the shadow root's scope.

### Things that keep working

- `contenteditable` — Works inside shadow DOM
- Images, media — Load normally via absolute URLs
- Event listeners — Work when attached directly to shadow DOM elements
- `querySelector` — Works on `shadowRoot` the same as on regular elements

### What this does NOT change

- The source line generation (`extractSourceContext`, `sourceLines` getter) — Untouched, operates on the DOMParser document, not the live DOM
- The tutorial system — Untouched, operates on Alpine state
- The URL fetching/processing pipeline — Only the Alpine stripping is removed
- The sidebar template — Unchanged

## Estimated effort

Small. The core change is ~5 lines in `bits/main.eleventy.liquid` and removing ~15 lines from `processScrapedHtml`. The Stage 6 h1 binding (not yet implemented) just needs to use `shadowRoot.querySelector` instead of `querySelector`.
