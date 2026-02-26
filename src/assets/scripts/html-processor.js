const SKIP_ABSOLUTIFY = /^(https?:\/\/|\/\/|#|data:|javascript:|mailto:|tel:|blob:)/i;

function shouldAbsolutify(url) {
  if (!url || typeof url !== 'string') return false;
  const trimmed = url.trim();
  return trimmed !== '' && !SKIP_ABSOLUTIFY.test(trimmed);
}

function absolutifyUrl(url, baseUrl) {
  try { return new URL(url.trim(), baseUrl).href; }
  catch { return url; }
}

function absolutifySrcset(srcset, baseUrl) {
  return srcset.split(',').map(entry => {
    const parts = entry.trim().split(/\s+/);
    if (parts.length > 0 && shouldAbsolutify(parts[0])) {
      parts[0] = absolutifyUrl(parts[0], baseUrl);
    }
    return parts.join(' ');
  }).join(', ');
}

function absolutifyCssUrls(cssText, baseUrl) {
  // url(<optional-quote><url><optional-quote>)
  return cssText.replace(/url\(\s*(['"]?)(.+?)\1\s*\)/g, (match, quote, url) => {
    if (shouldAbsolutify(url)) {
      return 'url(' + quote + absolutifyUrl(url, baseUrl) + quote + ')';
    }
    return match;
  });
}

/**
 * Phase 1: Parse raw HTML, strip scripts/CC attrs, find the first <h1>.
 * Returns the parsed doc and metadata BEFORE any URL absolutification,
 * so callers can extract source context with short original URLs.
 */
function parseAndCleanHtml(rawHtml, pageUrl) {
  const doc = new DOMParser().parseFromString(rawHtml, 'text/html');

  const baseEl = doc.querySelector('base[href]');
  const baseUrl = baseEl ? baseEl.href : pageUrl;
  if (baseEl) baseEl.remove();

  doc.querySelectorAll('script, noscript').forEach(el => el.remove());

  // Alpine.js x-cloak hides elements until Alpine initialises via
  // [x-cloak]{display:none!important}. Since scripts are stripped Alpine
  // never runs, so remove x-cloak to let CSS classes control display.
  // For elements with x-show, infer default visibility: negated expressions
  // like "!menuOpen" are visible by default, bare vars like "menuOpen"
  // default to false (hidden).
  doc.querySelectorAll('[x-cloak]').forEach(el => {
    el.removeAttribute('x-cloak');
    const xShow = el.getAttribute('x-show');
    if (xShow && !xShow.trim().startsWith('!')) {
      el.style.display = 'none';
    }
  });

  // crossorigin on media elements triggers CORS enforcement when the processed
  // HTML loads from localhost. Without the attribute, images load fine as opaque
  // cross-origin resources. Leave crossorigin on <link> -- stylesheets need it
  // for CDNs that require the CORS request flow.
  doc.querySelectorAll('img[crossorigin], video[crossorigin], audio[crossorigin], source[crossorigin]').forEach(el => {
    el.removeAttribute('crossorigin');
  });

  // Inline styles like display:var(--flag) break when the script that
  // defines the variable is gone. Drop the display declaration so the
  // element falls back to its class-based display value.
  doc.querySelectorAll('[style]').forEach(el => {
    const style = el.getAttribute('style');
    if (style && /display\s*:\s*var\(/.test(style)) {
      const cleaned = style.replace(/display\s*:\s*var\([^)]*\)\s*;?/g, '').trim();
      if (cleaned) el.setAttribute('style', cleaned);
      else el.removeAttribute('style');
    }
  });

  doc.querySelectorAll('[data-editable], [data-prop], [data-path], [data-key]').forEach(el => {
    for (const attr of ['data-editable', 'data-prop', 'data-path', 'data-key', 'data-type']) {
      el.removeAttribute(attr);
    }
  });

  const h1 = doc.querySelector('h1:not([aria-hidden="true"])') || doc.querySelector('h1');
  if (!h1) {
    throw new Error('No <h1> found on this page. Try a page with a heading.');
  }

  return { doc, h1, headingText: h1.textContent.trim(), baseUrl };
}

/**
 * Phase 2: Absolutify all relative URLs in a parsed document.
 * Mutates the doc in place.
 */
function absolutifyDocument(doc, baseUrl) {
  doc.querySelectorAll('[src], [href]').forEach(el => {
    for (const attr of ['src', 'href']) {
      const val = el.getAttribute(attr);
      if (val && shouldAbsolutify(val)) {
        el.setAttribute(attr, absolutifyUrl(val, baseUrl));
      }
    }
  });

  doc.querySelectorAll('[srcset]').forEach(el => {
    el.setAttribute('srcset', absolutifySrcset(el.getAttribute('srcset'), baseUrl));
  });

  doc.querySelectorAll('[style]').forEach(el => {
    const style = el.getAttribute('style');
    if (style && style.includes('url(')) {
      el.setAttribute('style', absolutifyCssUrls(style, baseUrl));
    }
  });

  doc.querySelectorAll('style').forEach(el => {
    if (el.textContent.includes('url(')) {
      el.textContent = absolutifyCssUrls(el.textContent, baseUrl);
    }
  });
}

/**
 * Phase 3: Serialize a processed document to a full HTML string.
 * Injects editable-region styles into <head>.
 */
function serializeProcessedDoc(doc) {
  const headEl = doc.querySelector('head');
  if (headEl) {
    const editableStyle = doc.createElement('style');
    editableStyle.textContent = '.editable-region{outline:2px solid transparent;outline-offset:4px;transition:outline-color .15s ease;cursor:pointer}.editable-region:hover,.editable-region:focus{outline-color:#FCBD01}.editable-region:focus{outline-style:solid}';
    headEl.appendChild(editableStyle);
  }
  return '<!DOCTYPE html>' + doc.documentElement.outerHTML;
}
