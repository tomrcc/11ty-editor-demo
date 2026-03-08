const fs = require('fs');
const path = require('path');

const DATA_PATH = path.join(__dirname, '..', 'src', '_data', 'demo_sites.json');
const OUT_DIR = path.join(__dirname, '..', 'src', 'assets', 'scraped');

async function main() {
  const sites = JSON.parse(fs.readFileSync(DATA_PATH, 'utf-8'));
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const results = await Promise.allSettled(
    sites.map(async (site) => {
      const outFile = path.join(OUT_DIR, `${site.slug}.html`);
      console.log(`Fetching ${site.url} ...`);

      const resp = await fetch(site.url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; 11ty-editor-demo build)' },
        redirect: 'follow',
      });

      if (!resp.ok) {
        throw new Error(`${site.url} returned ${resp.status}`);
      }

      const html = await resp.text();
      fs.writeFileSync(outFile, html, 'utf-8');
      console.log(`  -> ${site.slug}.html (${(html.length / 1024).toFixed(0)} KB)`);
    })
  );

  const failures = results.filter((r) => r.status === 'rejected');
  if (failures.length) {
    console.error('\nFailed sites:');
    failures.forEach((f) => console.error(`  ${f.reason.message}`));
    process.exit(1);
  }

  console.log('\nAll sites fetched successfully.');
}

main();
