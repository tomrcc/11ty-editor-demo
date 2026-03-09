# Editable Regions — Architecture & Lifecycle

This document explains how `@cloudcannon/editable-regions` works: the shared core that powers all editable region types, and the framework-specific integrations (Astro, Eleventy/Liquid) that add component re-rendering on top.

---

## Table of Contents

- [High-Level Summary](#high-level-summary)
- [Architecture Layers](#architecture-layers)
- [The Simplest Case: A Text Editable Region](#the-simplest-case-a-text-editable-region)
  - [1. The HTML](#1-the-html)
  - [2. Hydration](#2-hydration)
  - [3. Waiting for the CloudCannon API](#3-waiting-for-the-cloudcannon-api)
  - [4. Setting Up Listeners](#4-setting-up-listeners)
  - [5. Mounting the Editor](#5-mounting-the-editor)
  - [6. Data Flows Down](#6-data-flows-down)
  - [7. Data Flows Up](#7-data-flows-up)
- [The Core in Detail](#the-core-in-detail)
  - [Hydration Engine](#hydration-engine)
  - [The Editable Base Class](#the-editable-base-class)
  - [Path Resolution & Data Sources](#path-resolution--data-sources)
  - [The Bubbling Event Bus](#the-bubbling-event-bus)
  - [Parent-Child Listener Tree](#parent-child-listener-tree)
- [Editable Region Types](#editable-region-types)
  - [EditableText](#editabletext)
  - [EditableImage](#editableimage)
  - [EditableComponent](#editablecomponent)
  - [EditableArray & EditableArrayItem](#editablearray--editablearrayitem)
  - [EditableSource](#editablesource)
  - [EditableSnippet](#editablesnippet)
- [Framework Integrations](#framework-integrations)
  - [What the Integrations Do (and Don't Do)](#what-the-integrations-do-and-dont-do)
  - [Astro Integration](#astro-integration)
  - [Eleventy / Liquid Integration](#eleventy--liquid-integration)
- [Data Flow Diagram](#data-flow-diagram)
- [File Map](#file-map)

---

## High-Level Summary

Editable regions is a client-side system that makes elements on a page interactive within CloudCannon's Visual Editor. It:

1. **Scans the DOM** for specially-annotated elements (`data-editable` attributes or `<editable-*>` web components)
2. **Builds a tree of `Editable` nodes** that mirror the data hierarchy
3. **Connects to the CloudCannon JavaScript API** to receive data changes and dispatch user mutations back

The framework integrations (Astro, Eleventy) are **only needed for component re-rendering** — they provide a way to re-run a template/component in the browser when its data changes. Simpler editable region types like text and image work purely with the shared core, no integration required.

---

## Architecture Layers

| Layer | Key Files | Role |
|---|---|---|
| **Hydration Engine** | `helpers/hydrate-editable-regions.ts`, `components/index.ts` | Scans the DOM, instantiates `Editable` nodes, watches for DOM mutations |
| **CloudCannon API Bridge** | `helpers/cloudcannon.mjs` | Connects to the CloudCannon API, manages component/snippet registries |
| **Editable Nodes** | `nodes/editable-*.ts` | Behaviour classes — one per region type (text, image, component, array, source, snippet) |
| **Web Components** | `components/editable-*-component.ts` | Thin Custom Element wrappers that self-hydrate via `connectedCallback` |
| **UI Controls** | `components/ui/` | Overlay controls for editing, array reordering, error display |
| **Astro Integration** | `integrations/astro/` | Vite plugin + client-side SSR wrapper for Astro component re-rendering |
| **11ty Integration** | `integrations/eleventy.mjs`, `integrations/liquid/` | esbuild bundler + LiquidJS engine for Liquid template re-rendering |

---

## The Simplest Case: A Text Editable Region

The best way to understand the system is to trace a single text editable region from HTML to live editing. No framework integration or component registration is needed for this — it's all shared core.

### 1. The HTML

A text editable region is just an HTML element with two data attributes:

```html
<p data-editable="text" data-prop="title">Welcome to my site</p>
```

- `data-editable="text"` — tells the hydration engine what type of editable this is
- `data-prop="title"` — the data path, pointing to the `title` key in the current file's front matter

Alternatively, you can use the Web Component form:

```html
<editable-text data-prop="title">Welcome to my site</editable-text>
```

Both forms produce identical behaviour.

### 2. Hydration

When the page loads, `components/index.ts` runs:

```javascript
hydrateDataEditableRegions(document.body);
observer.observe(document, { childList: true, subtree: true });
```

The hydration function walks the DOM looking for `[data-editable]` elements. It finds our `<p>`, sees `data-editable="text"`, and:

1. Instantiates `new EditableText(element)` — this attaches the editable instance to the element as `element.editable`
2. Calls `editable.connect()`

A `MutationObserver` is also set up to catch any future DOM changes (view transitions, dynamic content, component re-renders), automatically hydrating new elements and disconnecting removed ones.

For Web Components (`<editable-text>`), hydration happens via the Custom Element lifecycle instead — `connectedCallback()` calls `this.editable.connect()`, `disconnectedCallback()` calls `this.editable.disconnect()`.

### 3. Waiting for the CloudCannon API

`connect()` doesn't do anything immediately. It waits for the CloudCannon API:

```javascript
// Editable.connect()
this.connectPromise = apiLoadedPromise.then(() => {
    this.setupListeners();
    this.connected = true;
    if (!this.mounted && this.shouldMount()) {
        this.mounted = true;
        this.mount();
        this.update();
    }
});
```

`apiLoadedPromise` resolves when `window.CloudCannonAPI` becomes available (CloudCannon injects this into the Visual Editor iframe). It grabs the v1 API:

```javascript
_cloudcannon = window.CloudCannonAPI.useVersion("v1", true);
```

If the API is already loaded by the time the code runs, the promise resolves immediately. Otherwise it listens for the `cloudcannon:load` CustomEvent on `document`.

### 4. Setting Up Listeners

Once the API is ready, `setupListeners()` runs. For our text editable, this:

1. **Walks up the DOM** looking for a parent editable element (there isn't one in this simple case)
2. **Parses `data-prop="title"`** — since there's no `@collections[...]` or `@file[...]` prefix, this is a relative path with no parent, so it resolves to `CloudCannon.currentFile()` (the file being edited)
3. **Binds to the API file object**:
   ```javascript
   const file = CloudCannon.currentFile();
   file.addEventListener("change", handleAPIChange);
   file.addEventListener("delete", handleAPIChange);
   handleAPIChange(); // initial data fetch
   ```
4. **Listens for the `cloudcannon-api` CustomEvent** on the element itself (for upward data flow — more on this later)

### 5. Mounting the Editor

When the initial data arrives, `pushValue()` resolves the path `"title"` against the file's front matter, stores the result, and calls `mount()`.

`EditableText.mount()` sets up interaction listeners on the element (click prevention, focus/blur tracking), then calls `mountEditor()`:

```javascript
this.editor = await CloudCannon.createTextEditableRegion(
    this.element,      // the DOM element to make editable
    this.onChange,      // callback when user types
    {
        elementType: this.element.dataset.type,  // "span", "text", or "block"
        inputConfig,                              // field config from CloudCannon
    },
);
```

This hands the element over to CloudCannon's editor (ProseMirror-based), which makes it `contenteditable` and provides inline rich text editing.

### 6. Data Flows Down

When data changes in CloudCannon (e.g. user edits the `title` field in the sidebar), the API file object fires a `change` event. The flow is:

```
CloudCannon API file fires "change"
    → handleAPIChange() calls pushValue()
    → pushValue() resolves path "title" against file data
    → Calls EditableText.update()
    → update() calls editor.setContent(newValue)
    → The text on the page updates live
```

`EditableText.shouldUpdate()` checks that the editor isn't currently focused (to avoid clobbering what the user is typing) and that the value actually changed.

### 7. Data Flows Up

When the user types directly into the text element on the page, the ProseMirror editor fires the `onChange` callback:

```javascript
// EditableText.onChange()
onChange(value) {
    this.value = value;
    this.dispatchSet("title", value);
}
```

`dispatchSet()` dispatches a bubbling CustomEvent:

```javascript
this.element.dispatchEvent(
    new CustomEvent("cloudcannon-api", {
        bubbles: true,
        detail: { action: "set", source: "title", value },
    }),
);
```

Since this element has no parent editable, the event is caught by its own `handleApiEvent()` listener, which calls `executeApiCall()`:

```javascript
file.data.set({ slug: "title", value: "New Title" });
```

This sends the change to the CloudCannon API, which saves it to the file.

That's the complete round trip for the simplest case — no framework integration involved.

---

## The Core in Detail

### Hydration Engine

Two mechanisms ensure every editable element gets an `Editable` instance:

**Data attribute scanning** (`helpers/hydrate-editable-regions.ts`): Finds `[data-editable]` elements, maps the type string to a class (`"text"` → `EditableText`, `"image"` → `EditableImage`, etc.), and calls `.connect()`.

**Web Components** (`components/editable-*-component.ts`): Custom Elements like `<editable-text>` that create their `Editable` instance in the constructor and call `.connect()` / `.disconnect()` in lifecycle callbacks.

Both share the same `MutationObserver` in `components/index.ts` which watches the entire document, hydrating new nodes and dehydrating removed ones.

Custom editable region types can be registered at runtime via `addCustomEditableRegion()`, which adds to the type map and re-runs hydration.

### The Editable Base Class

`nodes/editable.ts` is the base class for all editable region types. Key responsibilities:

- **Lifecycle management**: `connect()`, `disconnect()`, `mount()`, `update()`
- **Data path parsing**: `parseSource()` resolves `@collections[x]`, `@file[y]`, `@data[z]` prefixes into CloudCannon API objects
- **Value resolution**: `lookupPathAndContext()` traverses nested data structures (collections → files → data → nested keys), tracking context (which file, which collection) along the way
- **Listener management**: Parent-child registration, API event binding, DOM event binding
- **API dispatch**: `executeApiCall()` routes actions (`set`, `edit`, `add-array-item`, etc.) to the correct CloudCannon API method
- **Event handling**: `handleApiEvent()` catches bubbling `cloudcannon-api` events and adds path context

### Path Resolution & Data Sources

The `data-prop` attribute (and variants like `data-prop-src`, `data-prop-alt`) describes where the editable's data lives. Paths can be:

| Path Form | Example | Resolves To |
|---|---|---|
| Relative | `data-prop="title"` | Key on the current file's data, or on the parent editable's value |
| Absolute file | `data-prop="@file[/content/page.md].hero.title"` | Specific file, specific path |
| Absolute collection | `data-prop="@collections[posts].0.title"` | Collection → item → path |
| Absolute dataset | `data-prop="@data[authors].name"` | Dataset → path |
| Content | `data-prop="@content"` | The file's content body (markdown/HTML), not front matter |
| Special | `data-prop="@length"`, `data-prop="@index"` | Computed values from parent arrays |

When a path is relative, the editable registers as a listener on its parent editable. When absolute, it binds directly to the CloudCannon API object.

### The Bubbling Event Bus

Mutations (set, edit, add, remove, move) flow upward through the DOM via a custom `cloudcannon-api` event:

1. A leaf editable dispatches the event with `bubbles: true` and a relative source path
2. Each parent editable's `handleApiEvent()` intercepts it and prepends its own path segment
3. When the event reaches an editable with an absolute data source (or no parent), `executeApiCall()` fires the actual API call

This means deeply nested editables never need to know their full data path — they just say "set `title`" and the path builds itself as the event bubbles up.

### Parent-Child Listener Tree

Editables form a tree that mirrors the DOM hierarchy:

- On `setupListeners()`, each editable walks up the DOM to find its nearest parent editable
- If the parent is already hydrated, the child registers as a listener immediately
- If the parent hasn't hydrated yet, the listener is queued in `__pendingEditableListeners` on the parent element and replayed when the parent connects

Parents push data to children via `registerListener()` → `pushValue()`. Children can also have multiple `data-prop*` attributes that pull different slices of the parent's data.

---

## Editable Region Types

### EditableText

The inline rich text editor. Creates a ProseMirror instance via `CloudCannon.createTextEditableRegion()`.

- Supports `data-type` of `"span"` (inline), `"text"` (plain text), or `"block"` (block-level rich text)
- Tracks focus state to avoid overwriting what the user is typing
- Supports deferred mounting (`data-defer-mount`) for performance — the editor only initialises when the user clicks
- `onChange` dispatches a `set` action back up the tree

### EditableImage

Handles image editing with a CloudCannon data panel.

- Expects a child `<img>` element (or can be applied directly to an `<img>`)
- Manages `src`, `alt`, and `title` — each can be bound independently via `data-prop-src`, `data-prop-alt`, `data-prop-title`, or together via `data-prop`
- On click, opens `CloudCannon.createCustomDataPanel()` with image upload, alt text, and title fields
- Updates `img.src` via `CloudCannon.getPreviewUrl()` for DAM/asset preview URLs
- Also updates `<source>` elements within parent `<picture>` elements

### EditableComponent

Re-renders a component when its data changes. This is where the framework integrations plug in.

- Looks up a renderer function from `window.cc_components` by the `data-component` key
- Calls the renderer with the current props to get new HTML
- **Diffs the result into the live DOM** via `updateTree()` rather than wholesale replacing — this preserves focused text editors, ProseMirror state, and other live editable instances
- Adds an edit button overlay (via `<editable-component-controls>`) that opens the sidebar editor
- If the component renderer isn't registered yet, retries with polling (up to 4 seconds) and listens for a registration event

### EditableArray & EditableArrayItem

Manages ordered lists of items with full CRUD and drag-and-drop.

**EditableArray**:
- Validates its value is an array (or a CloudCannon API collection/dataset/file)
- Creates/removes/reorders child `EditableArrayItem` elements to match the data
- Supports keyed arrays (`data-id-key` or `data-component-key`) for stable identity across reorders
- Uses `<template>` children as blueprints for new items
- Detects flex direction (`data-direction` or computed styles) to orient drag-and-drop indicators
- Shows an "Add Item" button when the array is empty

**EditableArrayItem** (extends `EditableComponent`):
- Adds array item controls (move up/down, add, duplicate, delete)
- Full drag-and-drop: `dragstart`, `dragover`, `drop` with position detection (before/after based on mouse position and array direction)
- Cross-array drag-and-drop support via structure matching
- Dispatches `move-array-item`, `remove-array-item`, `add-array-item` actions

### EditableSource

A specialisation of `EditableText` that edits raw HTML source files rather than front matter values.

- Uses `data-path` (the file path) and `data-key` (a unique identifier within the file) instead of `data-prop`
- Reads the full file source via `CloudCannon.file(path).get()`
- Finds the editable region within the source by locating the `data-key` attribute in the raw HTML
- On change, splices the edited content back into the full file source, preserving the original indentation
- Writes back via `file.set(content)` (sets the entire file, not a front matter key)

### EditableSnippet

Extends `EditableComponent` for editing snippets (shortcodes) within rich text content.

- Uses `data-cms-snippet-id` to identify which snippet in the content it represents
- Manages its own data locally (mutations like `set`, `move-array-item` are applied directly to the snippet's value object) rather than going through the file API
- Dispatches a `snippet-change` CustomEvent after mutations, which the rich text editor listens for to update the content

---

## Framework Integrations

### What the Integrations Do (and Don't Do)

The integrations **only** provide a way to re-render components in the browser during live editing. They register renderer functions in `window.cc_components` that `EditableComponent` calls when data changes.

The integrations **do not** affect:
- Text editable regions
- Image editable regions
- Source editable regions
- The hydration engine
- The CloudCannon API connection
- The event bus or listener system

If you only use text, image, and source editable regions, you don't need any integration at all — just the core.

### Astro Integration

The Astro integration has two parts:

**Build-time** (`integrations/astro/astro-integration.mjs`):

An Astro integration that registers a Vite plugin for the **client** build. This plugin:

1. Sets `ENV_CLIENT = true` (for tree-shaking server-only code)
2. Patches Astro's `astro:build` Vite plugin to force SSR transforms on client code — this is what makes `renderToString()` work in the browser
3. Adds `vite-plugin-editable-regions` which intercepts `astro:*` virtual module imports and resolves them to local shims:
   - `astro:content` → `modules/content.js`
   - `astro:assets` → `modules/assets.js`
   - `astro:env/server` → `modules/secrets.js`

Without this, Astro components that import from `astro:content` or `astro:assets` would fail to bundle for the client.

**Runtime** (`integrations/astro/index.mjs`):

`registerAstroComponent(key, AstroComponent)` creates a wrapper function that:

1. Constructs a fake Astro `SSRResult` (with renderers, metadata, crypto key for server islands, slot handling, etc.)
2. Calls Astro's `renderToString()` **in the browser** with the new props
3. Parses the resulting HTML into a document fragment
4. Triggers any queued client-side renders (e.g. React islands use `data-editable-region-csr-id`)
5. Strips Astro scaffolding (`<astro-island>`, `<link>`, server island metadata)
6. Returns the clean HTML element

The wrapper is stored in `window.cc_components[key]` where `EditableComponent` can find it.

**Usage** — in the Astro page, a `<script>` tag imports a module that registers components:

```typescript
import { registerAstroComponent } from "@cloudcannon/editable-regions/astro";
import MyComponent from "./components/my-component.astro";

registerAstroComponent("my-component", MyComponent);
```

### Eleventy / Liquid Integration

The 11ty integration takes a fundamentally different approach to solving the same problem: how do you re-render templates in the browser?

**Build-time** (`integrations/eleventy.mjs`):

An Eleventy plugin that hooks into the `eleventy.before` event. It:

1. **Discovers all Liquid template files** across configured directories (recursively, matching configured extensions like `.liquid`, `.html`, `.bookshop.liquid`)
2. **Generates a JavaScript source string** that:
   - Creates a shared LiquidJS engine with the same root directories
   - Imports every template file as a text string (via esbuild's `text` loader)
   - Stores them in `window.cc_files` so the in-memory filesystem can serve them
   - Registers custom filters, shortcodes, paired shortcodes, and tags
   - Registers each component template as a renderer
3. **Bundles it with esbuild** into a single `live-editing.js` file in the output directory

The key insight: rather than trying to run Eleventy in the browser, it bundles a standalone [LiquidJS](https://liquidjs.com/) engine with all the templates and custom extensions pre-loaded.

**Runtime** (`integrations/liquid/`):

The bundled `live-editing.js` runs in the browser and sets up:

- **`createSharedLiquidEngine()`** — creates a LiquidJS `Liquid` instance configured with:
  - An in-memory filesystem (`integrations/liquid/fs.mjs`) that reads from `window.cc_files` instead of disk
  - Browser-compatible implementations of Eleventy's built-in filters (`slugify`, `url`, `log`)
  - `ENV_CLIENT = true` as a global for template conditionals
  - A `bind_include` tag for spreading object props into includes (like Astro's `{...props}`)

- **`registerLiquidComponent(key, templateString)`** — stores a wrapper in `window.cc_components[key]` that:
  1. Calls `liquidEngine.parseAndRender(templateString, props)`
  2. Creates a `<div>` and sets `innerHTML` to the result
  3. Returns the element for `EditableComponent` to diff into the DOM

- **Custom extension support**: Filters, shortcodes, paired shortcodes, and custom tags can all be registered. Shortcodes are converted from Eleventy's simple function API to LiquidJS's `{ parse(), render() }` tag API via wrapper utilities in `shortcodes.mjs`.

**The in-memory filesystem** (`integrations/liquid/fs.mjs`) is a LiquidJS-compatible filesystem adapter that implements `readFile`, `exists`, `resolve`, etc. by looking up paths in `window.cc_files`. This lets LiquidJS `{% include %}` and `{% render %}` calls work in the browser without any network requests.

**Usage** — in `eleventy.config.js`:

```javascript
import editableRegions from "@cloudcannon/editable-regions/eleventy";

export default function(eleventyConfig) {
    eleventyConfig.addPlugin(editableRegions, {
        liquid: {
            components: [
                { name: "hero", file: "_includes/hero.liquid" },
            ],
            filters: [
                { name: "formatDate", file: "_filters/format-date.js" },
            ],
        },
    });
}
```

### Integration Comparison

| Aspect | Astro | Eleventy/Liquid |
|---|---|---|
| Template engine | Astro's own (JSX-like) | LiquidJS |
| Build-time tool | Vite plugin | esbuild bundle |
| How templates reach the browser | Vite bundles Astro components as JS modules | esbuild imports template files as text strings into `window.cc_files` |
| How templates render in the browser | Astro's `renderToString()` with a fake SSRResult | LiquidJS `parseAndRender()` with an in-memory filesystem |
| Component registration API | `registerAstroComponent(key, AstroComponent)` | `registerLiquidComponent(key, templateString)` (auto-generated) |
| Custom extension support | React islands via `addFrameworkRenderer()` | Filters, shortcodes, paired shortcodes, tags |
| Where the renderer is stored | `window.cc_components[key]` | `window.cc_components[key]` |

Despite the different approaches, both integrations produce the same output: a function in `window.cc_components` that takes props and returns an `HTMLElement`. The `EditableComponent` node doesn't know or care which integration produced it.

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         BUILD TIME                                  │
│                                                                     │
│  ┌─ Astro ──────────────────────┐  ┌─ Eleventy ──────────────────┐ │
│  │ Vite plugin:                 │  │ esbuild bundle:              │ │
│  │ • shims astro:* modules      │  │ • discovers .liquid files    │ │
│  │ • enables client-side SSR    │  │ • bundles as text strings    │ │
│  │ • patches astro:build plugin │  │ • imports filters/shortcodes │ │
│  └──────────────────────────────┘  └──────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                  PAGE LOAD (in Visual Editor iframe)                 │
│                                                                     │
│  ┌─ Integration layer (optional) ─────────────────────────────────┐ │
│  │ Registers component renderers in window.cc_components          │ │
│  │ (Only needed for EditableComponent regions)                    │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                     │
│  ┌─ Core (always runs) ──────────────────────────────────────────┐  │
│  │ 1. hydrateDataEditableRegions(document.body)                  │  │
│  │    → scans all [data-editable] elements                       │  │
│  │    → instantiates Editable subclasses                         │  │
│  │ 2. MutationObserver watches for future DOM changes            │  │
│  └───────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      CONNECTION PHASE                                │
│                                                                     │
│  Each Editable.connect() waits for apiLoadedPromise                 │
│  ┌──────────────────────────────────────────────────┐               │
│  │ Resolves when:                                    │               │
│  │  • window.CloudCannonAPI already exists, OR       │               │
│  │  • document "cloudcannon:load" event fires        │               │
│  │ Then: CloudCannonAPI.useVersion("v1", true)       │               │
│  └──────────────────────────────────────────────────┘               │
│                                                                     │
│  Then setupListeners():                                             │
│  ┌──────────────────────────────────────────────────────┐           │
│  │ • Walk DOM upward to find parent editable            │           │
│  │ • Parse data-prop* into data paths                   │           │
│  │ • Relative paths → register on parent                │           │
│  │ • Absolute paths → bind to CloudCannon API objects   │           │
│  │ • Listen for "cloudcannon-api" CustomEvent (bubbling)│           │
│  └──────────────────────────────────────────────────────┘           │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     LIVE EDITING DATA FLOW                           │
│                                                                     │
│  DATA DOWN (CloudCannon → Page)                                     │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ CloudCannon API fires "change" on file/collection/dataset    │   │
│  │       │                                                      │   │
│  │       ▼                                                      │   │
│  │ Root Editable.pushValue()                                    │   │
│  │       │  resolves path, stores value                         │   │
│  │       ▼                                                      │   │
│  │ Editable.update()                                            │   │
│  │       │  pushes to child listeners                           │   │
│  │       ▼                                                      │   │
│  │ ┌────────────┬──────────────┬───────────────┬──────────────┐ │   │
│  │ │ Text       │ Image        │ Component     │ Array        │ │   │
│  │ │            │              │               │              │ │   │
│  │ │ editor     │ updates      │ re-renders    │ creates/     │ │   │
│  │ │ .setContent│ img src/alt  │ template then │ reorders     │ │   │
│  │ │            │              │ diffs DOM     │ child items  │ │   │
│  │ └────────────┴──────────────┴───────────────┴──────────────┘ │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  DATA UP (Page → CloudCannon)                                       │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │ User types / clicks image / drags array item                 │   │
│  │       │                                                      │   │
│  │       ▼                                                      │   │
│  │ Leaf dispatches CustomEvent("cloudcannon-api", {             │   │
│  │     bubbles: true,                                           │   │
│  │     detail: { action: "set", source: "title", value }       │   │
│  │ })                                                           │   │
│  │       │  (bubbles up DOM)                                    │   │
│  │       ▼                                                      │   │
│  │ Each parent prepends its path → "hero.title"                 │   │
│  │       │                                                      │   │
│  │       ▼                                                      │   │
│  │ Root calls executeApiCall()                                  │   │
│  │   → file.data.set({ slug: "hero.title", value })            │   │
│  │       │                                                      │   │
│  │       ▼                                                      │   │
│  │ CloudCannon API → Visual Editor → saves to file              │   │
│  └──────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

### Supported API Actions

| Action | CloudCannon API Call | Typical Trigger |
|---|---|---|
| `set` | `file.data.set()` or `file.content.set()` | Typing in a text region, changing an image |
| `edit` | `file.data.edit()` | Clicking a component's edit button |
| `add-array-item` | `file.data.addArrayItem()` | Array "add" button, duplicate button |
| `remove-array-item` | `file.data.removeArrayItem()` | Array item delete button |
| `move-array-item` | `file.data.moveArrayItem()` | Drag-and-drop, reorder buttons |
| `get-input-config` | `file.getInputConfig()` | Mounting editors to get field configuration |

---

## File Map

```
integrations/
  astro/
    astro-integration.mjs     — Astro integration & Vite plugin (build-time)
    index.mjs                 — registerAstroComponent, client-side SSR wrapper
    react-renderer.mjs        — React component bridge for Astro islands
    modules/
      content.js              — Client-side shim for astro:content
      assets.js               — Client-side shim for astro:assets
      secrets.js              — Client-side shim for astro:env/server
  eleventy.mjs                — Eleventy plugin: discovers files, generates bundle, runs esbuild
  liquid/
    index.mjs                 — LiquidJS engine setup, component/filter/tag registration
    fs.mjs                    — In-memory filesystem (reads from window.cc_files)
    shortcodes.mjs            — Eleventy shortcode → LiquidJS tag adapters
    11ty-filters.mjs          — Browser-compatible Eleventy built-in filters (slugify, url, log)
    logger.mjs                — Verbose logging utilities
  react.mjs                   — React component registration

helpers/
  cloudcannon.mjs             — CloudCannon API connection, component/snippet registries
  cloudcannon.d.mts           — Type declarations for the above
  hydrate-editable-regions.ts — DOM scanner that instantiates Editable nodes
  checks.ts                   — Type guards and element checks

nodes/
  editable.ts                 — Base class: listener system, path parsing, API dispatch
  editable-text.ts            — Inline rich text editing (ProseMirror via CC API)
  editable-image.ts           — Image editing with custom data panel
  editable-component.ts       — Component re-rendering with DOM diffing
  editable-array.ts           — Array management (create/remove/reorder items)
  editable-array-item.ts      — Individual array items with drag-and-drop
  editable-source.ts          — Raw HTML source editing (extends EditableText)
  editable-snippet.ts         — Snippet/shortcode editing within rich text

components/
  editable-*-component.ts     — Web Component wrappers (Custom Elements)
  index.ts                    — Entry point: runs hydration, starts MutationObserver
  ui/
    editable-component-controls.ts  — Edit button overlay for components
    editable-array-item-controls.ts — Reorder/delete/add controls for array items
    editable-region-button.ts       — Shared button component
    editable-region-error-card.ts   — Error display for misconfigured regions

styles/
  *.css                       — Styling for each editable type and UI control
```
