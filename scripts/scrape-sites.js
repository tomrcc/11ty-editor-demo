const fs = require('fs');
const path = require('path');

const SITES = [
  'https://cloudcannon.com',
  'https://docs.github.com',
  'https://astro.build',
  'https://vercel.com',
  'https://www.netlify.com',
];

const OUT_DIR = path.resolve(__dirname, '..', 'src', 'scraped');

async function scrape() {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  for (const url of SITES) {
    const hostname = new URL(url).hostname;
    const outFile = path.join(OUT_DIR, hostname + '.html');
    process.stdout.write(`Scraping ${url} ... `);

    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const html = await resp.text();
      fs.writeFileSync(outFile, html, 'utf-8');
      console.log(`ok (${(html.length / 1024).toFixed(0)} KB)`);
    } catch (err) {
      console.error(`FAILED: ${err.message}`);
      process.exitCode = 1;
    }
  }
}

scrape();
