# General instructions

- Push back on things, don't be a sycophant
- Keep comments minimal. When replacing old logic/comments, don't muddy comments up with how things used to be.
- Don't use square brackets in logs
- Avoid factory, and generator functions
- Ask questions during the planning phase if needed
- Keep any really important info you discover in the bottom of this file, under the learnings heading. Keep it super brief, as we don't want to muddy up the context for new agents too much before they even start their prompt, but don't want to repeat primer instructions.

# Brief

We have two demo components simulating CloudCannon's editor:

1. `interactive-demo` -- simulates structured data editing (frontmatter/Bookshop). DO NOT TOUCH.
2. `interactive-source-demo` -- simulates Source Editable Regions (editing hard-coded HTML). This is the active work.

The source demo shows a side-by-side view: source code (left) + visual editor (right). Users edit text in the visual preview, and the source code updates reactively. This teaches how CloudCannon's source editables work for pages without frontmatter.

The demo uses a multi-tutorial system: separate tutorial "tracks" that users progress through sequentially. There are three tracks -- heading editing, image editing, and structured data (frontmatter) editing. Each track has 5 steps (0-4) and its own tooltip content. State is driven by `activeTutorial` ('heading' | 'image' | 'data' | null), `tutorialStep` (0-4 within the active track), and per-track completion flags. Between tutorials, a bouncing prompt icon appears after a short delay driven by `nextPromptTarget`.

# Learnings
- The Cursor browser MCP tool can't reliably test responsive breakpoints -- its viewport stays narrow regardless of resize commands. Verify `md:flex` responsive layouts in a real browser.
- The 11ty file watcher doesn't detect changes in `component-library/` files. Touch `src/pages/index.md` or restart the server to trigger a rebuild after editing bookshop components.
- CloudCannon source editable attributes: `data-editable="source"`, `data-path="/path/to/file"`, `data-key="unique-id"`. The older `class="editable"` method was deprecated Oct 2025.
- Multi-tutorial architecture: `headingSetupLevel` / `imageSetupLevel` / `dataSetupLevel` computed getters drive `regionLines` / `imageRegionLines` / `dataPageSourceLines` independently. Sidebar dims lines not relevant to the active tutorial. The image picker tracks both a source code path (`heroImageSrc`) and a preview src (`heroImagePreviewSrc`) since default preview images use real asset paths while source code shows simplified paths.
- The data tutorial uses a split-panel sidebar (two stacked code editors) and blog post preview. `showDataView` controls when to show the split view vs. single file view. Blog post previews use `.jt-blog-*` / `.sd-blog-*` CSS classes in the respective preview-styles.css files.
- Tooltip positioning is hardcoded per-site per-tutorial based on line counts. When adding new tutorials or regions that change line counts in the source code, recalculate `tooltipTop()` offsets. The data tutorial uses `dataTabH = 36` to account for the split-panel padding.