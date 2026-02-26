const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const DEV_SERVER = 'http://localhost:8080';
const SITES_FILE = path.resolve(__dirname, '..', 'test-sites.txt');
const RESULTS_DIR = path.resolve(__dirname, '..', 'test-results');
const SCREENSHOTS_DIR = path.join(RESULTS_DIR, 'screenshots');
const REPORT_FILE = path.join(RESULTS_DIR, 'report.md');

const VIEWPORT = { width: 1280, height: 720 };
const LOAD_TIMEOUT = 20_000;

// Font CORS and favicon errors are expected and harmless
const IGNORABLE_CONSOLE = [
  /font.*cors/i,
  /favicon\.ico/i,
  /404.*favicon/i,
  /third.party/i,
  /googletagmanager/i,
  /google-analytics/i,
  /analytics/i,
  /hotjar/i,
  /intercom/i,
  /sentry/i,
];

function parseSitesList(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  return content
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'));
}

function sanitizeDomain(url) {
  try {
    const { hostname } = new URL(url);
    return hostname.replace(/[^a-zA-Z0-9.-]/g, '-');
  } catch {
    return url.replace(/[^a-zA-Z0-9.-]/g, '-');
  }
}

function isIgnorableConsoleMsg(text) {
  return IGNORABLE_CONSOLE.some(pattern => pattern.test(text));
}

async function checkDevServer(browser) {
  const page = await browser.newPage();
  try {
    const resp = await page.goto(DEV_SERVER, { timeout: 5000 });
    if (!resp || !resp.ok()) throw new Error(`Dev server returned ${resp?.status()}`);
  } finally {
    await page.close();
  }
}

async function testSite(browser, url) {
  const domain = sanitizeDomain(url);
  const result = {
    url,
    domain,
    fetchLoad: { pass: false, error: null },
    h1Detection: { pass: false, error: null, h1Text: null },
    consoleErrors: [],
    screenshots: { live: null, processed: null },
  };

  // -- 1. Fetch / load test via compare page --
  const comparePage = await browser.newPage({ viewport: VIEWPORT });
  const consoleMessages = [];
  comparePage.on('console', msg => {
    if (msg.type() === 'error') consoleMessages.push(msg.text());
  });

  const compareUrl = `${DEV_SERVER}/compare/?url=${encodeURIComponent(url)}`;
  try {
    await comparePage.goto(compareUrl, { waitUntil: 'domcontentloaded', timeout: LOAD_TIMEOUT });

    // Wait for banner status to change from "Loading..."
    await comparePage.waitForFunction(
      () => {
        const el = document.getElementById('banner-status');
        return el && el.textContent.trim() !== 'Loading...';
      },
      { timeout: LOAD_TIMEOUT }
    );

    const statusText = await comparePage.$eval('#banner-status', el => el.textContent.trim());
    const statusClass = await comparePage.$eval('#banner-status', el => el.className);

    if (statusClass.includes('ok')) {
      result.fetchLoad.pass = true;
    } else {
      result.fetchLoad.error = statusText;
    }
  } catch (err) {
    result.fetchLoad.error = err.message.split('\n')[0];
  }

  // -- 2. Screenshots (only if load succeeded) --
  if (result.fetchLoad.pass) {
    // Screenshot the processed preview (already on compare page)
    const processedPath = path.join(SCREENSHOTS_DIR, `${domain}-processed.png`);
    // Give iframe content a moment to render
    await comparePage.waitForTimeout(2000);
    await comparePage.screenshot({ path: processedPath, fullPage: true });
    result.screenshots.processed = `${domain}-processed.png`;

    // Screenshot the live site
    const livePage = await browser.newPage({ viewport: VIEWPORT });
    try {
      await livePage.goto(url, { waitUntil: 'domcontentloaded', timeout: LOAD_TIMEOUT });
      await livePage.waitForTimeout(3000);
      const livePath = path.join(SCREENSHOTS_DIR, `${domain}-live.png`);
      await livePage.screenshot({ path: livePath, fullPage: true });
      result.screenshots.live = `${domain}-live.png`;
    } catch (err) {
      result.screenshots.live = `FAILED: ${err.message.split('\n')[0]}`;
    } finally {
      await livePage.close();
    }
  }

  // -- 3. Console errors (captured during compare page load) --
  result.consoleErrors = consoleMessages.filter(msg => !isIgnorableConsoleMsg(msg));

  await comparePage.close();

  // -- 4. H1 detection test via demo page --
  const demoPage = await browser.newPage({ viewport: VIEWPORT });
  try {
    await demoPage.goto(DEV_SERVER, { waitUntil: 'domcontentloaded', timeout: LOAD_TIMEOUT });

    // Wait for Alpine to initialise the input form
    await demoPage.waitForSelector('#source-demo-window input[type="url"]', { timeout: 10_000 });
    await demoPage.fill('#source-demo-window input[type="url"]', url);
    await demoPage.click('#source-demo-window button[type="submit"]');

    // Wait for either success (mode=demo) or error
    const outcome = await Promise.race([
      demoPage.waitForSelector('#source-demo-window [x-show="mode === \'demo\'"]', { state: 'visible', timeout: LOAD_TIMEOUT })
        .then(() => 'success'),
      demoPage.waitForSelector('#source-demo-window [x-show="error"]', { state: 'visible', timeout: LOAD_TIMEOUT })
        .then(() => 'error'),
    ]);

    if (outcome === 'success') {
      result.h1Detection.pass = true;
      // Try to read the h1 text from the demo
      try {
        result.h1Detection.h1Text = await demoPage.$eval(
          '#source-demo-window',
          el => {
            const headingLine = el.querySelector('[x-text="heading"]') || el.querySelector('.editable-region');
            return headingLine?.textContent?.trim() || 'found (text not extracted)';
          }
        );
      } catch {
        result.h1Detection.h1Text = 'found (text not extracted)';
      }
    } else {
      const errorText = await demoPage.$eval(
        '#source-demo-window [x-show="error"]',
        el => el.textContent.trim()
      );
      result.h1Detection.error = errorText;
    }
  } catch (err) {
    result.h1Detection.error = err.message.split('\n')[0];
  } finally {
    await demoPage.close();
  }

  return result;
}

function generateReport(results) {
  const passed = results.filter(r => r.fetchLoad.pass);
  const failed = results.filter(r => !r.fetchLoad.pass);
  const h1Passed = results.filter(r => r.h1Detection.pass);
  const h1Failed = results.filter(r => !r.h1Detection.pass);

  let md = `# Batch Test Report\n`;
  md += `Generated: ${new Date().toISOString()}\n\n`;
  md += `## Summary\n`;
  md += `- Sites tested: ${results.length}\n`;
  md += `- Fetch/load passed: ${passed.length}\n`;
  md += `- Fetch/load failed: ${failed.length}\n`;
  md += `- H1 detection passed: ${h1Passed.length}\n`;
  md += `- H1 detection failed: ${h1Failed.length}\n\n`;

  if (failed.length > 0) {
    md += `### Failed sites\n`;
    for (const r of failed) {
      md += `- ${r.url} -- ${r.fetchLoad.error}\n`;
    }
    md += `\n`;
  }

  md += `## Per-site results\n\n`;

  for (const r of results) {
    md += `### ${r.url}\n`;
    md += `- **Fetch/load**: ${r.fetchLoad.pass ? 'PASS' : `FAIL (${r.fetchLoad.error})`}\n`;

    if (r.h1Detection.pass) {
      md += `- **H1 detection**: PASS (h1 text: "${r.h1Detection.h1Text}")\n`;
    } else if (r.fetchLoad.pass) {
      md += `- **H1 detection**: FAIL (${r.h1Detection.error})\n`;
    } else {
      md += `- **H1 detection**: SKIPPED (fetch failed)\n`;
    }

    if (r.consoleErrors.length > 0) {
      md += `- **Console errors**: ${r.consoleErrors.length} error(s)\n`;
      for (const err of r.consoleErrors.slice(0, 5)) {
        md += `  - \`${err.slice(0, 200)}\`\n`;
      }
      if (r.consoleErrors.length > 5) {
        md += `  - ... and ${r.consoleErrors.length - 5} more\n`;
      }
    } else {
      md += `- **Console errors**: None\n`;
    }

    if (r.screenshots.live && r.screenshots.processed) {
      md += `- **Screenshots**: \`${r.screenshots.live}\`, \`${r.screenshots.processed}\`\n`;
    } else if (!r.fetchLoad.pass) {
      md += `- **Screenshots**: None (fetch failed)\n`;
    } else {
      md += `- **Screenshots**: Processed only (live screenshot failed: ${r.screenshots.live})\n`;
    }

    md += `\n`;
  }

  return md;
}

async function main() {
  const sites = parseSitesList(SITES_FILE);
  console.log(`Loaded ${sites.length} sites from ${SITES_FILE}`);

  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });

  try {
    console.log('Checking dev server...');
    await checkDevServer(browser);
    console.log('Dev server is up\n');
  } catch (err) {
    console.error(`Dev server not responding at ${DEV_SERVER}. Start it with: npm start`);
    await browser.close();
    process.exit(1);
  }

  const results = [];

  for (let i = 0; i < sites.length; i++) {
    const url = sites[i];
    const progress = `[${i + 1}/${sites.length}]`;
    console.log(`${progress} Testing ${url}...`);

    const result = await testSite(browser, url);
    results.push(result);

    const fetchStatus = result.fetchLoad.pass ? 'PASS' : `FAIL`;
    const h1Status = result.h1Detection.pass ? 'PASS' : 'FAIL';
    console.log(`${progress}   Fetch: ${fetchStatus} | H1: ${h1Status}`);
  }

  await browser.close();

  const report = generateReport(results);
  fs.writeFileSync(REPORT_FILE, report);
  console.log(`\nReport written to ${REPORT_FILE}`);

  const passed = results.filter(r => r.fetchLoad.pass).length;
  const failed = results.length - passed;
  console.log(`\nBatch test complete: ${results.length} sites tested, ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('Failed sites:');
    results.filter(r => !r.fetchLoad.pass).forEach(r => console.log(`  - ${r.url}: ${r.fetchLoad.error}`));
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
