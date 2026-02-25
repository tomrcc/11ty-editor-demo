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

# Learnings

- CloudCannon docs are indexed locally (no MCP server though). Use local index over web fetches where possible.
- The Cursor browser MCP tool can't reliably test responsive breakpoints -- its viewport stays narrow regardless of resize commands. Verify `md:flex` responsive layouts in a real browser.
- The 11ty file watcher doesn't detect changes in `component-library/` files. Touch `src/pages/index.md` or restart the server to trigger a rebuild after editing bookshop components.
- CloudCannon source editable attributes: `data-editable="source"`, `data-path="/path/to/file"`, `data-key="unique-id"`. The older `class="editable"` method was deprecated Oct 2025.