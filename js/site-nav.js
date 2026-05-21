/**
 * site-nav.js — shared site navigation bar for harrysharman.com project pages
 *
 * Usage: add ONE script tag to any project page's <head>:
 *   <script src="/js/site-nav.js" defer></script>
 *
 * The script injects a fixed 44px nav bar at the top and adds
 * padding-top: 44px to <body> so content is not hidden under it.
 *
 * Convention for new project pages: if your page has a sticky or fixed
 * header, set its top to 44px (not 0) so it sits below the site nav.
 * Example: .my-header { position: sticky; top: 44px; }
 */
(function () {
  var NAV_H = 44;
  var RED   = '#e8473f';   // main site brand red

  // ── Auto-detect breadcrumb page name ──────────────────────────────────────
  // Use document.title, stripping "— Harry Sharman" suffix
  function getPageName() {
    var t = (document.title || '').replace(/\s*[–—-]+\s*Harry Sharman.*/i, '').trim();
    if (t) return t;
    // Fallback: prettify URL slug
    var parts = window.location.pathname.replace(/\/$/, '').split('/');
    var slug  = parts[parts.length - 1] || parts[parts.length - 2] || '';
    return slug.split('-').map(function (w) {
      return w.charAt(0).toUpperCase() + w.slice(1);
    }).join(' ') || 'Project';
  }

  // ── Inject CSS ─────────────────────────────────────────────────────────────
  var css = [
    '#hs-sitenav {',
    '  position: fixed; top: 0; left: 0; right: 0; z-index: 9999;',
    '  height: ' + NAV_H + 'px;',
    '  background: #09090f;',
    '  border-bottom: 1px solid #1a1a2c;',
    '  display: flex; align-items: center;',
    '  padding: 0 20px; gap: 0;',
    '  font-family: -apple-system, "Segoe UI", system-ui, sans-serif;',
    '  font-size: 12px;',
    '  box-sizing: border-box;',
    '}',
    '#hs-brand {',
    '  font-weight: 900; font-size: 13px; letter-spacing: 0.04em;',
    '  color: ' + RED + '; white-space: nowrap; text-decoration: none;',
    '  flex-shrink: 0;',
    '}',
    '#hs-brand:hover { opacity: 0.8; }',
    '#hs-sep {',
    '  color: #2a2a3e; margin: 0 10px; font-size: 14px; flex-shrink: 0; user-select: none;',
    '}',
    '#hs-crumb {',
    '  color: #5a5a7a; font-size: 11px; white-space: nowrap;',
    '  overflow: hidden; text-overflow: ellipsis; flex: 1;',
    '  letter-spacing: 0.01em;',
    '}',
    '#hs-crumb a {',
    '  color: #5a5a7a; text-decoration: none;',
    '}',
    '#hs-crumb a:hover { color: #8888aa; }',
    '#hs-crumb .hs-arrow { margin: 0 6px; color: #2a2a3e; }',
    '#hs-crumb .hs-current { color: #9090b0; }',
    '#hs-links {',
    '  display: flex; align-items: center; gap: 16px;',
    '  flex-shrink: 0; margin-left: 16px;',
    '}',
    '#hs-links a {',
    '  font-size: 11px; color: #4a4a6a; text-decoration: none;',
    '  white-space: nowrap; transition: color 0.15s;',
    '}',
    '#hs-links a:hover { color: #9090b0; }',
    '#hs-links .hs-pill {',
    '  background: #1a1a2c; border: 1px solid #2a2a40;',
    '  padding: 4px 10px; border-radius: 999px;',
    '  font-size: 10px; font-weight: 600; letter-spacing: 0.03em;',
    '}',
    '#hs-links .hs-pill:hover { border-color: #4a4a6a; color: #c0c0d0; }',
    '@media (max-width: 600px) {',
    '  #hs-crumb { display: none; }',
    '  #hs-links a:not(.hs-pill) { display: none; }',
    '}',
  ].join('\n');

  var style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  // ── Inject HTML ────────────────────────────────────────────────────────────
  var pageName = getPageName();

  var nav = document.createElement('div');
  nav.id = 'hs-sitenav';
  nav.setAttribute('role', 'navigation');
  nav.setAttribute('aria-label', 'Site navigation');
  nav.innerHTML =
    '<a id="hs-brand" href="/">HARRY<span style="color:#ffffff;margin:0 1px">/</span>SHARMAN</a>' +
    '<span id="hs-sep">›</span>' +
    '<div id="hs-crumb">' +
      '<a href="/">Home</a>' +
      '<span class="hs-arrow">›</span>' +
      '<a href="/#building">Projects</a>' +
      '<span class="hs-arrow">›</span>' +
      '<span class="hs-current">' + pageName + '</span>' +
    '</div>' +
    '<nav id="hs-links">' +
      '<a href="/blog.html">Writing</a>' +
      '<a href="/#building">Building</a>' +
      '<a href="https://linkedin.com/in/harrysharman" target="_blank" rel="noopener" class="hs-pill">say hi ↗</a>' +
    '</nav>';

  // ── Inject into DOM (safe whether script is deferred or runs at end of body) ─
  function inject() {
    if (document.getElementById('hs-sitenav')) return; // already injected
    if (document.body.firstChild) {
      document.body.insertBefore(nav, document.body.firstChild);
    } else {
      document.body.appendChild(nav);
    }
    // Push body content down so nothing hides under the fixed bar
    document.body.style.paddingTop =
      (parseInt(document.body.style.paddingTop) || 0) + NAV_H + 'px';
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }

})();
