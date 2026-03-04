# Scraped Site Editor Demo

## Local Development

1. Clone the repository
2. At the root of the project, run `npm install`, to install the node modules.
3. Run `npm start`.
4. Go to the homepage to see the component.


## Batch Visual Testing

The source demo scrapes and re-renders live websites. To verify the processed HTML looks correct, there's a two-phase testing workflow that compares processed previews against the original sites.

### Setup (one-time)

Playwright and Chromium are installed as dev dependencies. After cloning, run:

```bash
npm install
npx playwright install chromium
```

### Adding test sites

Edit `test-sites.txt` in the project root. One URL per line, `#` for comments:

```
# Marketing sites
https://cloudcannon.com
https://example.com
```

### Running the tests

**Phase 1 -- Automated (Playwright):**

Start the dev server, then run the visual test script:

```bash
npm start              # in one terminal
npm run test:visual    # in another terminal
```

This takes ~60-90 seconds and produces:
- `test-results/report.md` -- structured pass/fail per site (fetch success, h1 detection, console errors)
- `test-results/screenshots/<domain>-live.png` -- full-page screenshot of the live site
- `test-results/screenshots/<domain>-processed.png` -- full-page screenshot of the processed preview via `/compare/`

**Phase 2 -- Agent review:**

Open an Agent mode chat and ask it to review the batch test results. The `.cursor/rules/batch-test.mdc` rule kicks in automatically. The agent reads the report, compares screenshot pairs, and updates `edge-cases.md` with any failures it finds.

Example prompt:

> Review the batch test results in `test-results/report.md` and compare the screenshot pairs. Update `edge-cases.md` with any failures.

### Edge case tracking

`edge-cases.md` accumulates all known failures with structured metadata (status, category, description, likely pipeline stage). A future agent can read this file and work through each entry to implement fixes in `src/assets/scripts/html-processor.js`.