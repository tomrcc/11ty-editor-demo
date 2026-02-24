# General instructions

- Push back on things, don't be a sycophant
- Keep comments minimal. When replacing old logic/comments, don't muddy comments up with how things used to be.
- Don't use square brackets in logs
- Avoid factory, and generator functions
- Keep any really important info you discover in the bottom of this file, under the learnings heading. Keep it super brief, as we don't want to muddy up the context for new agents too much before they even start their prompt, but don't want to repeat primer instructions.

# Brief

I have an @component-library/components/interactive-demo/interactive-demo.eleventy.liquid component, which simulates what CloudCannon's editor looks like in the app. It doesn't have to be a 1to1, but it should give potential users a taster of what our visual editor looks like.


# Learnings

- CloudCannon docs are indexed locally (no MCP server though). Use local index over web fetches where possible.