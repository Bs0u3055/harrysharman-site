#!/usr/bin/env python3
"""
Generate a static HTML page for every post.
Output: posts/<slug>/index.html

Run after generate-posts-json.py so posts.json is up to date.
"""
import os, re, json
import html as html_module
import markdown as md_lib

# ── Paths ──────────────────────────────────────────────────────────────────
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
SITE_ROOT  = os.path.dirname(SCRIPT_DIR)
POSTS_DIR  = os.path.join(SITE_ROOT, 'posts')
SITE_URL   = 'https://harrysharman.com'

FONTS = ('https://fonts.googleapis.com/css2?family=Archivo:'
         'wght@400;500;600;700;800;900&family=Caveat:'
         'wght@500;700&family=JetBrains+Mono:wght@400;500&display=swap')

# ── Frontmatter parser (mirrors generate-posts-json.py) ───────────────────
def parse_frontmatter(content):
    if not content.startswith('---'):
        return {}, content
    lines    = content.split('\n')
    end_line = -1
    for i, line in enumerate(lines[1:], 1):
        if line.strip() == '---':
            end_line = i
            break
    if end_line == -1:
        return {}, content
    fm_lines = lines[1:end_line]
    body     = '\n'.join(lines[end_line + 1:]).strip()
    meta     = {}
    i        = 0
    cur_key  = None
    while i < len(fm_lines):
        line = fm_lines[i].rstrip()
        if not line:
            i += 1; continue
        if line.endswith(':') and ': ' not in line:
            cur_key       = line[:-1].strip()
            meta[cur_key] = []
            i += 1
            while i < len(fm_lines) and (fm_lines[i].startswith('  - ') or fm_lines[i].startswith('- ')):
                item = re.sub(r'^[-\s]+', '', fm_lines[i]).strip().strip('"\'')
                meta[cur_key].append(item)
                i += 1
        elif ': ' in line:
            key, val = line.split(': ', 1)
            meta[key.strip()] = val.strip().strip('"\'')
            i += 1
        else:
            i += 1
    for k in ('featured',):
        if meta.get(k) in ('true', 'True'):  meta[k] = True
        elif meta.get(k) in ('false','False',None,''): meta[k] = False
    return meta, body

# ── Helpers ────────────────────────────────────────────────────────────────
def long_date(date_str):
    try:
        from datetime import date
        d = date.fromisoformat(str(date_str)[:10])
        months = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December']
        return f'{d.day} {months[d.month-1]} {d.year}'
    except Exception:
        return str(date_str)

def md_to_html(body):
    exts = ['extra', 'tables', 'sane_lists']
    return md_lib.markdown(body, extensions=exts)

# ── HTML template ──────────────────────────────────────────────────────────
def build_page(slug, meta, body_html):
    title   = html_module.escape(meta.get('title', ''))
    excerpt = html_module.escape(meta.get('excerpt', ''))
    date    = meta.get('date', '')
    tags    = meta.get('tags', []) if isinstance(meta.get('tags'), list) else []
    image   = meta.get('image', '')           # e.g. assets/uploads/foo.jpg
    abs_img = f'{SITE_URL}/{image}' if image else ''
    canon   = f'{SITE_URL}/posts/{slug}/'

    tag_html = ''.join(f'<span class="tag">{html_module.escape(t)}</span>' for t in tags)

    hero_html = ''
    if image:
        hero_html = (
            f'<div class="post-hero-img">'
            f'<img src="/{image}" alt="{title}" loading="lazy">'
            f'</div>'
        )

    og_image_tag = (f'<meta property="og:image" content="{html_module.escape(abs_img)}">\n  '
                    if abs_img else '')

    return f'''<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{title} — Harry Sharman</title>
  <meta name="description" content="{excerpt}">
  <meta property="og:title" content="{title}">
  <meta property="og:description" content="{excerpt}">
  <meta property="og:type" content="article">
  <meta property="og:url" content="{canon}">
  {og_image_tag}<link rel="canonical" href="{canon}">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="{FONTS}" rel="stylesheet">
  <link rel="stylesheet" href="/css/style.css">
  <script src="https://identity.netlify.com/v1/netlify-identity-widget.js"></script>
</head>
<body class="post-page">

  <header class="site-header">
    <div class="container header-inner">
      <a href="/" class="brand">HARRY<span class="brand-slash">/</span>SHARMAN</a>
      <nav class="top-nav" id="nav-links">
        <a href="/blog.html" class="nav-link">writing</a>
        <a href="/#podcast" class="nav-link">listen</a>
        <a href="/#building" class="nav-link">building</a>
        <a href="https://linkedin.com/in/harrysharman" target="_blank" class="nav-pill">say hi ↗</a>
      </nav>
      <button id="nav-toggle" class="nav-toggle" aria-label="Toggle menu">☰</button>
    </div>
  </header>

  <div class="container">
    <a href="/blog.html" class="back-link">← Back to writing</a>
  </div>

  <article>
    <div class="container post-header-wrap">
      <h1>{title}</h1>
      <div class="post-meta">
        <span>{long_date(date)}</span>
        {tag_html}
      </div>
      {hero_html}
    </div>
    <div class="container post-body-wrap">
      <div class="post-body">
        {body_html}
      </div>
    </div>
  </article>

  <footer class="site-footer">
    <div class="footer-h">Want to talk?</div>
    <div class="footer-links">
      <a href="https://linkedin.com/in/harrysharman" target="_blank" class="footer-link">linkedin/harrysharman ↗</a>
    </div>
    <div class="footer-copy">© 2026 Harry Sharman. Built with care.</div>
  </footer>

  <script src="/js/main.js"></script>
</body>
</html>'''

# ── Main ───────────────────────────────────────────────────────────────────
generated = 0
skipped   = 0

for filename in sorted(os.listdir(POSTS_DIR)):
    if not filename.endswith('.md'):
        continue
    slug     = filename[:-3]
    filepath = os.path.join(POSTS_DIR, filename)

    with open(filepath, encoding='utf-8') as f:
        content = f.read()

    meta, body = parse_frontmatter(content)
    if not meta.get('title'):
        skipped += 1
        continue

    body_html = md_to_html(body)

    out_dir  = os.path.join(POSTS_DIR, slug)
    out_file = os.path.join(out_dir, 'index.html')
    os.makedirs(out_dir, exist_ok=True)

    with open(out_file, 'w', encoding='utf-8') as f:
        f.write(build_page(slug, meta, body_html))

    generated += 1

print(f'generate-static-pages: wrote {generated} pages ({skipped} skipped)')
