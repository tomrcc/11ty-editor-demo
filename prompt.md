# General instructions

- Push back on things, don't be a sycophant
- Keep comments minimal.
- Never write comments that reference your own actions, prior iterations, or changes you made. Write comments as if you are the original author and the code has always been this way.
- Don't use square brackets in logs
- Avoid factory, and generator functions
- Ask questions during the planning phase if needed
- Keep any really important info you discover in the bottom of this file, under the learnings heading. Keep it super brief, as we don't want to muddy up the context for new agents too much before they even start their prompt, but don't want to repeat primer instructions.

# Brief

We have two demo components simulating CloudCannon's editor:

1. `interactive-demo` -- simulates structured data editing (frontmatter/Bookshop). DO NOT TOUCH.
2. `interactive-source-demo` -- simulates Source Editable Regions (editing hard-coded HTML). This is the active work.

The source demo shows a side-by-side view: source code (left) + visual editor (right). Users edit text in the visual preview, and the source code updates reactively. This teaches how CloudCannon's source editables work for pages without frontmatter.

The demo uses a multi-tutorial system: separate tutorial "tracks" that users progress through sequentially. There are three tracks -- heading editing (source editables), structured data editing (data editables on blog post), and image editing (image editables on blog post). Each track has 5 steps (0-4) and its own tooltip content. State is driven by `activeTutorial` ('heading' | 'image' | 'data' | null), `tutorialStep` (0-4 within the active track), and per-track completion flags. Between tutorials, users pick the next track from the save modal.

# Learnings
- The Cursor browser MCP tool can't reliably test responsive breakpoints -- its viewport stays narrow regardless of resize commands. Verify `md:flex` responsive layouts in a real browser.
- The 11ty file watcher doesn't detect changes in `component-library/` files. Touch `src/pages/index.md` or restart the server to trigger a rebuild after editing bookshop components.
- CloudCannon source editable attributes: `data-editable="source"`, `data-path="/path/to/file"`, `data-key="unique-id"`. The older `class="editable"` method was deprecated Oct 2025.
- Multi-tutorial architecture: `headingSetupLevel` / `imageSetupLevel` / `dataSetupLevel` computed getters drive `regionLines` / `dataPageSourceLines` independently. Both data and image tutorials share the split-panel blog post view. `imageSetupLevel` drives progressive `<img>` attributes (`data-editable="image"`, `data-prop-src`, `data-prop-alt`) in `dataPageSourceLines`. Image path is in frontmatter (`featured_image`), not source HTML. The image picker tracks both a source code path (`heroImageSrc`) and a preview src (`heroImagePreviewSrc`).
- The data and image tutorials use a split-panel sidebar (two stacked code editors) and blog post preview. `showDataView` is true when `activeTutorial` is 'data' or 'image'. Blog post previews use `.jt-blog-*` / `.sd-blog-*` CSS classes.
- Tooltip positioning for data step 3 and image tutorial is dynamic based on `imageSetupLevel` / `dataSetupLevel` since the `<img>` block in `dataPageSourceLines` grows from 1 to 6 lines as image tutorial progresses. Both use `dataTabH = 36` for split-panel offset.