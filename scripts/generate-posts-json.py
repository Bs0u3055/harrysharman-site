#!/usr/bin/env python3
"""
Reads YAML frontmatter from all posts/*.md files and regenerates
posts/posts.json. Run automatically on every Netlify build.
"""
import os, json, re

POSTS_DIR = 'posts'
OUTPUT    = 'posts/posts.json'

def parse_frontmatter(content):
    if not content.startswith('---'):
        return {}, content
    lines     = content.split('\n')
    end_line  = -1
    for i, line in enumerate(lines[1:], 1):
        if line.strip() == '---':
            end_line = i
            break
    if end_line == -1:
        return {}, content
    fm_lines  = lines[1:end_line]
    body      = '\n'.join(lines[end_line + 1:]).strip()
    meta      = {}
    i         = 0
    cur_key   = None
    while i < len(fm_lines):
        line = fm_lines[i].rstrip()
        if not line:
            i += 1
            continue
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
    # Booleans
    for k in ('featured',):
        if meta.get(k) in ('true', 'True'):
            meta[k] = True
        elif meta.get(k) in ('false', 'False', None, ''):
            meta[k] = False
    return meta, body

posts = []
for filename in sorted(os.listdir(POSTS_DIR)):
    if not filename.endswith('.md'):
        continue
    filepath = os.path.join(POSTS_DIR, filename)
    with open(filepath, encoding='utf-8') as f:
        content = f.read()
    meta, _ = parse_frontmatter(content)
    if not meta.get('title'):
        print(f'  skip (no frontmatter): {filename}')
        continue
    slug = filename[:-3]
    post = {
        'slug':     slug,
        'title':    meta.get('title', ''),
        'date':     meta.get('date', '2024-01-01'),
        'excerpt':  meta.get('excerpt', ''),
        'tags':     meta.get('tags', []) if isinstance(meta.get('tags'), list) else [],
        'featured': bool(meta.get('featured', False)),
    }
    if meta.get('image'):
        post['image'] = meta['image']
    posts.append(post)

posts.sort(key=lambda p: p.get('date', ''), reverse=True)
with open(OUTPUT, 'w', encoding='utf-8') as f:
    json.dump(posts, f, indent=2, ensure_ascii=False)
print(f'generate-posts-json: wrote {len(posts)} posts to {OUTPUT}')
