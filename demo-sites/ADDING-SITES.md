# Adding a New Demo Site

This directory contains the assets and styles each site needs for the `interactive-source-demo` Bookshop component. Each subdirectory is a self-contained set of resources for one demo site.

> **Site picker needed**: Once a second site is added, the component will need a site picker UI (e.g. tabs or dropdown above the demo) so users can switch between sites. The current implementation is single-site only.

## Directory structure

```
demo-sites/
├── ADDING-SITES.md
├── <site-name>/
│   ├── preview-styles.css   # Scoped CSS for the visual preview
│   └── images/              # SVGs, logos, hero images, etc.
```

The visual preview HTML and source code lines live inside the Bookshop component itself (`component-library/components/interactive-source-demo/`), not in this directory. This directory holds the external assets that the component references.

## What you need from the source site

1. **The built site or its source code** — to understand the homepage layout, visual design, and component structure.
2. **Key image assets** — logos (navbar + footer), hero/dashboard images, section graphics, brand/partner logos for any logo strips.
3. **Design tokens** — colours, fonts, spacing values, border radii. Usually found in CSS variables or a theme config.
4. **Component styles** — the CSS rules for the navbar, hero section, feature cards, CTA, footer, etc.

## Step-by-step

### 1. Create the directory

```
mkdir -p demo-sites/<site-name>/images
```

### 2. Collect image assets

Copy SVGs and any small raster images into `demo-sites/<site-name>/images/`. Keep filenames descriptive. These will be served at `/demo-sites/<site-name>/images/<file>` via the 11ty passthrough copy already configured in `.eleventy.js`.

### 3. Create `preview-styles.css`

Extract the site's design tokens (colours, fonts, spacing, radii) and key component styles into a single CSS file. **Scope everything** under a `.XX-preview` container class (e.g. `.jt-preview` for Jetstream) and prefix all class names with a short identifier (e.g. `.jt-nav`, `.jt-hero`) to avoid collisions with the host site's Tailwind CSS.

Key things to include:
- CSS custom properties for the design tokens (prefix them too, e.g. `--jt-color-brand`)
- Reset styles scoped to the preview container (`box-sizing`, `margin: 0`, etc.)
- Disable all links: `pointer-events: none; cursor: default`
- Nav, hero, feature grid, CTA, footer component styles
- Any keyframe animations needed (prefix the animation names)

**Sizing note**: The preview renders at roughly 50% of a normal viewport inside a ~350px wide panel. Scale font sizes, paddings, and gaps down accordingly (roughly 50-60% of the original values work well).

See `demo-sites/jetstream/preview-styles.css` for a working example.

### 4. Update the visual preview template

Edit `component-library/components/interactive-source-demo/bits/main.eleventy.liquid`:

- Replace the HTML inside the preview container with the new site's layout
- Use the scoped class names from your `preview-styles.css`
- For each editable region, add a `contenteditable` element bound to the matching Alpine property. The pattern per region:
  ```html
  <span
    :class="tutorialStep >= 3 && 'editable-region'"
    :contenteditable="tutorialStep >= 3"
    x-effect="let t = headingMain; if (document.activeElement !== $el) $el.textContent = t"
    @input="headingMain = $el.textContent; onEdit('headingMain')">
  </span>
  ```
  The `x-effect` prop name and `@input` prop name must match the `prop` field in the corresponding `regions` entry.
- Keep the tutorial overlay div at the bottom
- Point image `src` attributes to `/demo-sites/<site-name>/images/<file>`

### 5. Update the Alpine source lines

Edit the `sourceEditorManager` in `interactive-source-demo.eleventy.liquid`:

- Update the content properties (e.g. `headingMain`, `headingHighlight`, `description`) to the new site's default text
- Update `sourcePath` to match the file being shown (e.g. `'/index.astro'`)
- Update the static lines in `sourceLines` (imports, wrapper elements, trailing elements) to represent the new site's page structure. The pattern is:
  - Header/footer shown as component imports + usage (e.g. `<Header />`, `<Footer />`)
  - Main page content shown as hard-coded HTML elements (`<h1>`, `<section>`, `<p>`, etc.)

#### Configuring editable regions

The tutorial walks through adding `data-editable`, `data-path`, and `data-key` attributes to elements. Which elements get these attributes is driven by the `regions` array:

```javascript
regions: [
  { key: 'heading-main', prop: 'headingMain', tag: 'span' },
  { key: 'heading-highlight', prop: 'headingHighlight', tag: 'span', className: 'highlight' },
],
```

Each region object:
- `key` — the `data-key` value (must be unique within the file)
- `prop` — the Alpine data property that holds the editable text (must match the property name and the `@input` binding in the visual preview)
- `tag` — the HTML element wrapping the text (`span`, `h1`, `p`, etc.)
- `className` (optional) — a CSS class on the element

The `regionLines(region, indent)` method generates the source code lines for each region at the current tutorial step. The `sourceLines` getter iterates over `regions` and calls `regionLines` for each. This means:

- **Single editable heading** — use one region: `[{ key: 'title', prop: 'title', tag: 'h1' }]`
- **Multi-part heading** (like Jetstream) — use multiple regions inside a parent `<h1>`, each as a `<span>`
- **Multiple separate elements** — use regions with different tags, placed at different points in `sourceLines`

If your site only needs a single editable element, you can simplify to one region. The `regionLines` method and tutorial step logic work the same regardless of how many regions you define.

Update `tooltipTop()` line offsets if the number of lines before the heading block changes — count the static lines above the first region in `sourceLines`.

### 6. Update the sidebar filename

In `bits/sidebar.eleventy.liquid`, change the filename shown in the tab to match the site's file (e.g. `index.astro`, `index.html`, `index.njk`).

### 7. Link the CSS

In `interactive-source-demo.eleventy.liquid`, update the `<link>` tag at the top to point to the new site's CSS:
```html
<link rel="stylesheet" href="/demo-sites/<site-name>/preview-styles.css" />
```

### 8. Test

1. Run the 11ty dev server (`npm start` or similar)
2. Verify the visual preview looks like the real site's homepage
3. Walk through all 5 tutorial steps — check the source code lines update correctly
4. Edit the heading in the visual preview — confirm the source code updates in real time
5. Check for style leaks between the preview and the host site
