# Edge Cases

Accumulated failures from batch visual comparison testing. Each entry describes a site where the processed HTML preview diverges from the live site, or where the demo pipeline fails.

A future agent should read this file top-to-bottom and work through each entry to identify root causes and implement fixes in `src/assets/scripts/html-processor.js` or the demo component.

> **Known limitation:** Sites that rely on client-side JS to render page content (SPAs, React hydration, etc.) will appear blank or incomplete after script stripping. This is by design -- the pipeline targets server-rendered HTML. See the "Won't fix" entries below.

---

## https://cloudcannon.com
- **Status**: Fixed
- **Category**: CSS
- **Description**: Alpine `x-cloak` hid the logo; `display:var(--flag)` broke the announcement banner after script stripping
- **What to ignore**: N/A
- **Likely pipeline stage**: `parseAndCleanHtml` -- needed `x-cloak` removal and `display:var()` stripping
- **Tested**: 2026-02-26

## https://aaronhawkins.nz
- **Status**: Failing
- **Category**: Layout
- **Description**: Hero background image fills the entire viewport with no height constraint. Two Divi CSS files are loaded via `<link rel="preload" as="style" onload="this.rel='stylesheet'">` -- the onload never fires after script stripping, so `background-size: cover` and base layout rules are missing. Promoting preload links to `<link rel="stylesheet">` was attempted but the CSS files fail to load cross-origin (`net::ERR_FAILED`), and the blanket promotion also broke vercel.com (regression). Fix was reverted.
- **What to ignore**: Font rendering differences, interactive form elements
- **Likely pipeline stage**: External CSS loading -- the files exist but can't be fetched cross-origin from the iframe. Would need a server-side CORS proxy for external stylesheets, or inlining the CSS at fetch time.
- **Tested**: 2026-02-26

## https://stripe.com
- **Status**: Fixed
- **Category**: H1 editing
- **Description**: Stripe uses two duplicate h1 elements layered on top of each other for a visual text effect. The foreground h1 (`aria-hidden="true"`, `z-index: 2`) blocked clicks on the background h1 (`aria-hidden="false"`) which is the semantic heading. Fixed by: (1) hiding `aria-hidden="true"` duplicate h1s with matching text in `enableH1Editing`, (2) lifting the editable h1 above decorative siblings with `position: relative; z-index: 999`, (3) skipping `aria-hidden="true"` h1s in `findVisibleH1` and `parseAndCleanHtml`.
- **What to ignore**: Scroll-triggered content reveals below the fold (JS-dependent, expected)
- **Likely pipeline stage**: Demo component -- `enableH1Editing()` and `findVisibleH1()`
- **Tested**: 2026-02-26

## https://tailwindcss.com
- **Status**: Won't fix
- **Category**: JS-rendered content
- **Description**: Entire page body is blank. Only the nav bar renders; the hero heading leaks its raw Tailwind class string as visible text. The site's page content is injected by client-side JS -- the server-rendered HTML contains minimal static content. The pipeline can't recover content that only exists in JS bundles.
- **What to ignore**: N/A
- **Likely pipeline stage**: N/A -- not a processing bug. The HTML itself has no content to process.
- **Tested**: 2026-02-26

## https://nextjs.org
- **Status**: Won't fix
- **Category**: JS-rendered content
- **Description**: Only the hero section renders. The "What's in Next.js?" feature grid, announcement card, and footer are all missing. Content below the fold is hydrated by React and doesn't exist in the static HTML.
- **What to ignore**: N/A
- **Likely pipeline stage**: N/A -- same root cause as tailwindcss.com. The static HTML only contains above-fold hero markup.
- **Tested**: 2026-02-26

## https://pagefind.app/
- **Status**: Failing
- **Category**: Layout
- **Description**: Mobile/responsive navigation is expanded and visible at the top of the page, duplicating the sidebar nav that renders correctly below it. Every sidebar section (Indexing, Searching, Metadata, Filtering, Sorting, Multilingual, References, Resources) appears twice — once as a full-width right-aligned list at the top, and again in the normal sidebar position. The hidden mobile nav element becomes visible after script stripping because JS or CSS media queries that kept it collapsed are no longer active.
- **What to ignore**: Font differences, notification banner at top (from compare page overlay)
- **Likely pipeline stage**: `parseAndCleanHtml` — needs to detect and remove/hide mobile nav elements that duplicate sidebar navigation, or preserve the CSS/attributes that keep them hidden at desktop widths
- **Tested**: 2026-02-26

## https://rosey.app/
- **Status**: Failing
- **Category**: Layout
- **Description**: Same issue as pagefind.app — both use the same CloudCannon docs template. Mobile/responsive nav is expanded at the top of the page, duplicating all sidebar links (Home, Getting Started, Tagging, Translating Elements, etc.). Main content and sidebar render correctly below the duplicate nav.
- **What to ignore**: Font differences
- **Likely pipeline stage**: Same root cause as pagefind.app — mobile nav visibility after script stripping
- **Tested**: 2026-02-26

## https://www.cloudflare.com/
- **Status**: Won't fix
- **Category**: JS-rendered content
- **Description**: Only the nav bar renders (logo, Platform, Products, Developers, Partners, Resources, Company, Log in, Under attack?). The entire page body below the nav is blank — no hero section, no feature cards, no content whatsoever. 6 `net::ERR_FAILED` console errors for resources. The page content is injected by client-side JS; the server-rendered HTML contains only the navigation shell.
- **What to ignore**: N/A
- **Likely pipeline stage**: N/A — same root cause as tailwindcss.com and nextjs.org. The static HTML has no body content to process.
- **Tested**: 2026-02-26

## https://developer.mozilla.org
- **Status**: Failing
- **Category**: Images
- **Description**: Page layout and text render correctly, but the hero dinosaur mascot SVG and other images are blocked by CORS (33 console errors). Stripping `crossorigin` attributes was applied but had minimal impact -- most blocked resources are loaded via CSS `url()` or are SVGs that the MDN server explicitly blocks cross-origin. The server returns no `Access-Control-Allow-Origin` header for static assets.
- **What to ignore**: Missing MongoDB Atlas ad banner (third-party ad injection), minor icon differences
- **Likely pipeline stage**: Not solvable client-side. Would need a server-side image proxy to fetch and re-serve blocked resources. The `crossorigin` attribute stripping remains in the pipeline as a general improvement but doesn't fix MDN specifically.
- **Tested**: 2026-02-26
