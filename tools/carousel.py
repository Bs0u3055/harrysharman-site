#!/usr/bin/env python3
"""
carousel.py — LinkedIn carousel generator for Beautiful Thinking.

Font spec (matching Canva):
  - Headline: Abril Fatface 121pt
  - Subtitle: Raleway Bold 39pt, ALL CAPS, letter-spaced
  - Body: DM Sans 29pt

Layout: Text spread evenly across full slide height. Hero image small in
bottom-right of content slides.
"""

import argparse
import json
import os
import re
import sys
import textwrap
from pathlib import Path

import yaml
import requests
from dotenv import load_dotenv
from PIL import Image, ImageDraw, ImageFont

TOOLS_DIR = Path(__file__).resolve().parent
REPO_ROOT = TOOLS_DIR.parent
ASSETS_DIR = REPO_ROOT / "assets"

MUSTARD = (232, 168, 32)
NAVY = (20, 20, 60)
SLIDE_W, SLIDE_H = 1080, 1350

ABRIL = "/usr/share/fonts/truetype/abril/AbrilFatface-Regular.ttf"
RALEWAY = "/usr/share/fonts/truetype/raleway/Raleway-Variable.ttf"
DMSANS = "/usr/share/fonts/truetype/dmsans/DMSans-Variable.ttf"
FB_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"
FB_REG = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

def ft(path, fallback, size, bold=False):
    try:
        f = ImageFont.truetype(path, size)
        if bold:
            try:
                f.set_variation_by_axes([700])
            except:
                pass
        return f
    except:
        return ImageFont.truetype(fallback, size)

class C:
    G="\033[92m";Y="\033[93m";R="\033[91m";I="\033[96m";B="\033[1m";X="\033[0m"
def ok(m):   print(f"{C.G}[OK]{C.X} {m}")
def warn(m): print(f"{C.Y}[WARN]{C.X} {m}")
def fail(m): print(f"{C.R}[FAIL]{C.X} {m}")
def info(m): print(f"{C.I}[INFO]{C.X} {m}")
def heading(m): print(f"\n{C.B}--- {m} ---{C.X}")


def parse_post(filepath):
    text = Path(filepath).read_text(encoding="utf-8")
    match = re.match(r"^---\s*\n(.*?)\n---\s*\n(.*)", text, re.DOTALL)
    if not match:
        raise ValueError("Needs YAML frontmatter")
    fm = yaml.safe_load(match.group(1))
    body = match.group(2).strip()
    title = fm.get("title", "").strip()
    slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
    return {"title": title, "tags": fm.get("tags", []), "excerpt": fm.get("excerpt", ""), "body": body, "slug": slug}


def wrap_text(text, font, max_width):
    words = text.split()
    lines, current = [], ""
    for word in words:
        test = f"{current} {word}".strip()
        if font.getlength(test) <= max_width:
            current = test
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


def text_block_height(lines, font, line_gap=1.15):
    total = 0
    for line in lines:
        bbox = font.getbbox(line)
        h = bbox[3] - bbox[1]
        total += int(h * line_gap)
    return total


def draw_centered(draw, lines, font, start_y, fill=NAVY, line_gap=1.15):
    y = start_y
    for line in lines:
        bbox = font.getbbox(line)
        w = bbox[2] - bbox[0]
        h = bbox[3] - bbox[1]
        x = (SLIDE_W - w) // 2
        draw.text((x, y), line, font=font, fill=fill)
        y += int(h * line_gap)
    return y


# ---------------------------------------------------------------------------
# Gemini extraction
# ---------------------------------------------------------------------------
def extract_slides(post):
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return _fallback(post)
    try:
        from google import genai
        client = genai.Client(api_key=api_key)
        prompt = f"""You are creating a LinkedIn carousel for "Beautiful Thinking" by Harry Sharman.

Each slide has THREE text layers:
1. "headline": Dramatic 2-4 word phrase. Think magazine cover. Provocative, memorable. Examples: "Excluded by Design", "Dosed to Death", "Ignored in Emergencies", "Women Are Dying."
2. "subtitle": Short ALL CAPS phrase, 4-7 words. Context. Examples: "THE BODY COUNT OF BIAS", "SAME PILLS, DIFFERENT METABOLISM"
3. "body": 1-2 sentences max. Conversational, punchy. Can include bold facts/stats. Example: "Women metabolize drugs slower— but still get male-sized doses, with fatal consequences."

Voice: Stephen Fry meets Bill Bryson. Intellectually curious, warmly irreverent, British. NEVER corporate jargon.

Create exactly 5 slides. JSON array of 5 objects with keys: headline, subtitle, body

Blog title: {post['title']}
Blog content:
{post['body'][:4000]}"""
        resp = client.models.generate_content(model="gemini-2.5-flash", contents=prompt)
        text = resp.text.strip()
        text = re.sub(r"```json\s*", "", text)
        text = re.sub(r"```\s*$", "", text)
        slides = json.loads(text)
        if isinstance(slides, list) and len(slides) >= 3:
            ok(f"Extracted {len(slides)} slides")
            return slides[:6]
    except Exception as e:
        warn(f"Gemini failed: {e}")
    return _fallback(post)


def _fallback(post):
    paras = [p.strip() for p in post["body"].split("\n\n") if len(p.strip()) > 40]
    slides = []
    for p in paras[:5]:
        clean = re.sub(r'[#*_\[\]()]', '', p).strip()
        words = clean.split()
        slides.append({
            "headline": " ".join(words[:3]).rstrip(".,"),
            "subtitle": "KEY INSIGHT",
            "body": ". ".join(clean.split(".")[:2]).strip() + ".",
        })
    return slides or [{"headline": "Key Insight", "subtitle": "FROM THE ARTICLE", "body": post["excerpt"]}]


# ---------------------------------------------------------------------------
# Slide creation
# ---------------------------------------------------------------------------
def make_slide(headline="", subtitle="", body="", hero_img_path=None):
    """Content slide with text spread across full page height, hero image bottom-right."""
    img = Image.new("RGB", (SLIDE_W, SLIDE_H), MUSTARD)
    draw = ImageDraw.Draw(img)
    margin = 80
    max_w = SLIDE_W - (margin * 2)

    # Prepare fonts
    for size in [121, 105, 90, 78]:
        f_head = ft(ABRIL, FB_BOLD, size)
        head_lines = wrap_text(headline, f_head, max_w)
        if len(head_lines) <= 4:
            break

    f_sub = ft(RALEWAY, FB_REG, 39, bold=True)
    sub_lines = wrap_text(subtitle.upper(), f_sub, max_w) if subtitle else []

    f_body = ft(DMSANS, FB_REG, 29)
    body_lines = wrap_text(body, f_body, max_w - 40) if body else []

    # Measure block heights
    head_h = text_block_height(head_lines, f_head, 1.08)
    sub_h = text_block_height(sub_lines, f_sub, 1.2) if sub_lines else 0
    body_h = text_block_height(body_lines, f_body, 1.4) if body_lines else 0

    # Calculate spacing to spread evenly across the page
    # Reserve 100px top margin, 120px bottom margin
    top_margin = 100
    bottom_margin = 120
    usable = SLIDE_H - top_margin - bottom_margin
    total_text = head_h + sub_h + body_h
    num_gaps = sum([1 for h in [head_h, sub_h, body_h] if h > 0]) - 1
    if num_gaps > 0 and total_text < usable:
        gap = min((usable - total_text) // (num_gaps + 1), 120)
    else:
        gap = 60

    # Centre the whole block vertically
    total_with_gaps = total_text + (gap * max(num_gaps, 0))
    start_y = top_margin + (usable - total_with_gaps) // 2
    start_y = max(start_y, top_margin)

    y = start_y

    # Draw headline
    y = draw_centered(draw, head_lines, f_head, y, NAVY, 1.08)

    # Draw subtitle
    if sub_lines:
        y += gap
        y = draw_centered(draw, sub_lines, f_sub, y, NAVY, 1.2)

    # Draw body
    if body_lines:
        y += gap
        y = draw_centered(draw, body_lines, f_body, y, NAVY, 1.4)

    # Hero image — small, bottom-right corner
    if hero_img_path and Path(hero_img_path).exists():
        try:
            hero = Image.open(hero_img_path).convert("RGBA")
            # Resize to ~180px wide, maintain aspect ratio
            target_w = 180
            scale = target_w / hero.width
            target_h = int(hero.height * scale)
            hero = hero.resize((target_w, target_h), Image.LANCZOS)
            # Position: bottom-right with margin
            px = SLIDE_W - target_w - 50
            py = SLIDE_H - target_h - 50
            # Add slight rounded rectangle background for contrast
            img.paste(hero, (px, py), hero if hero.mode == "RGBA" else None)
        except Exception:
            pass

    return img


def make_title_slide(title, excerpt=""):
    """Slide 1: Text spread across full page."""
    img = Image.new("RGB", (SLIDE_W, SLIDE_H), MUSTARD)
    draw = ImageDraw.Draw(img)
    margin = 80
    max_w = SLIDE_W - (margin * 2)

    # Title
    for size in [121, 110, 100, 90, 80]:
        f_title = ft(ABRIL, FB_BOLD, size)
        title_lines = wrap_text(title, f_title, max_w)
        if len(title_lines) <= 5:
            break

    # Excerpt as subtitle
    f_sub = ft(RALEWAY, FB_REG, 39, bold=True)
    excerpt_lines = wrap_text(excerpt.upper(), f_sub, max_w) if excerpt else []

    # Measure
    title_h = text_block_height(title_lines, f_title, 1.05)
    excerpt_h = text_block_height(excerpt_lines, f_sub, 1.2) if excerpt_lines else 0

    # Spread across page
    top_margin = 140
    bottom_margin = 200
    usable = SLIDE_H - top_margin - bottom_margin
    total_text = title_h + excerpt_h
    gap = min((usable - total_text) // 2, 150) if total_text < usable else 60

    start_y = top_margin + (usable - total_text - gap) // 2
    start_y = max(start_y, top_margin)

    y = start_y
    y = draw_centered(draw, title_lines, f_title, y, NAVY, 1.05)

    if excerpt_lines:
        y += gap
        draw_centered(draw, excerpt_lines, f_sub, y, NAVY, 1.2)

    return img


def make_cta_slide():
    """Final slide: Read the Full Beautiful Thinking Article."""
    img = Image.new("RGB", (SLIDE_W, SLIDE_H), MUSTARD)
    draw = ImageDraw.Draw(img)
    max_w = SLIDE_W - 160

    f_big = ft(ABRIL, FB_BOLD, 100)

    # Measure all lines
    cta_parts = ["Read the", "Full", "", "Beautiful", "Thinking", "Article"]
    all_lines = []
    for part in cta_parts:
        if part == "":
            all_lines.append(("", None))  # spacer
        else:
            all_lines.append((part, f_big))

    # Calculate total height
    total_h = 0
    for text, f in all_lines:
        if f is None:
            total_h += 60  # spacer
        else:
            bbox = f.getbbox(text)
            total_h += int((bbox[3] - bbox[1]) * 1.05) + 10

    # Centre vertically
    start_y = (SLIDE_H - total_h) // 2
    y = start_y

    for text, f in all_lines:
        if f is None:
            y += 60
        else:
            bbox = f.getbbox(text)
            w = bbox[2] - bbox[0]
            h = bbox[3] - bbox[1]
            x = (SLIDE_W - w) // 2
            draw.text((x, y), text, font=f, fill=NAVY)
            y += int(h * 1.05) + 10

    # URL at bottom
    f_url = ft(DMSANS, FB_REG, 24)
    url = "harrysharman.com"
    w = f_url.getlength(url)
    draw.text(((SLIDE_W - w) // 2, SLIDE_H - 100), url, font=f_url, fill=NAVY)

    return img


# ---------------------------------------------------------------------------
# Build + Post
# ---------------------------------------------------------------------------
def build_carousel(post, slides_data, hero_img_path=None):
    heading("Building carousel")
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    out = ASSETS_DIR / f"{post['slug']}-carousel.pdf"

    pages = []
    info("Title slide...")
    pages.append(make_title_slide(post["title"], post.get("excerpt", "")))

    for i, s in enumerate(slides_data, 1):
        info(f"Slide {i}: {s.get('headline', '')[:30]}...")
        pages.append(make_slide(
            s.get("headline", ""), s.get("subtitle", ""), s.get("body", ""),
            hero_img_path=hero_img_path,
        ))

    info("CTA slide...")
    pages.append(make_cta_slide())

    pages[0].save(out, "PDF", save_all=True, append_images=pages[1:], resolution=150)
    ok(f"Saved: {out} ({len(pages)} slides)")
    return out


def post_to_linkedin(pdf_path, hook, post):
    heading("Posting carousel to LinkedIn")
    token = os.getenv("LINKEDIN_ACCESS_TOKEN")
    member_id = os.getenv("LINKEDIN_MEMBER_ID")
    if not token or not member_id:
        fail("Missing LinkedIn credentials")
        return False
    author = f"urn:li:person:{member_id}"
    base = "https://api.linkedin.com/rest"
    h = {"Authorization": f"Bearer {token}", "LinkedIn-Version": "202502", "Content-Type": "application/json", "X-Restli-Protocol-Version": "2.0.0"}
    try:
        r = requests.post(f"{base}/documents?action=initializeUpload", headers=h, json={"initializeUploadRequest": {"owner": author}})
        r.raise_for_status()
        d = r.json()["value"]
        requests.put(d["uploadUrl"], headers={"Authorization": f"Bearer {token}", "Content-Type": "application/pdf"}, data=pdf_path.read_bytes()).raise_for_status()
        ok("PDF uploaded")
        r2 = requests.post(f"{base}/posts", headers=h, json={
            "author": author, "commentary": hook, "visibility": "PUBLIC",
            "distribution": {"feedDistribution": "MAIN_FEED", "targetEntities": [], "thirdPartyDistributionChannels": []},
            "content": {"media": {"title": post["title"], "id": d["document"]}},
            "lifecycleState": "PUBLISHED",
        })
        r2.raise_for_status()
        urn = r2.headers.get("x-restli-id", "")
        ok(f"Posted: {urn}")
        if urn:
            url = f"https://harrysharman.com/post.html?slug={post['slug']}"
            requests.post(f"{base}/socialActions/{urn}/comments", headers=h, json={"actor": author, "message": {"text": f"Read the full article at {url} \U0001f9e0"}, "object": urn})
            ok("Comment added")
        return True
    except Exception as e:
        fail(f"Failed: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(description="Beautiful Thinking LinkedIn carousel.")
    parser.add_argument("file", help="Markdown file with YAML frontmatter")
    parser.add_argument("--post", action="store_true", help="Post to LinkedIn")
    parser.add_argument("--hook", help="Custom LinkedIn hook text")
    parser.add_argument("--hero-image", help="Path to hero image for content slides")
    args = parser.parse_args()

    load_dotenv(TOOLS_DIR / ".env")
    post = parse_post(args.file)
    ok(f"Title: {post['title']}")

    slides_data = extract_slides(post)
    for i, s in enumerate(slides_data, 1):
        info(f"  {i}. {s.get('headline', '')} — {s.get('body', '')[:50]}...")

    # Auto-find hero image if not specified
    hero = args.hero_image
    if not hero:
        # Check for the post's generated hero image
        for ext in [".jpg", ".png"]:
            candidate = ASSETS_DIR / f"{post['slug']}{ext}"
            if candidate.exists():
                hero = str(candidate)
                info(f"Found hero image: {hero}")
                break

    pdf = build_carousel(post, slides_data, hero_img_path=hero)

    if args.post:
        tags = " ".join(f"#{t}" for t in post["tags"][:4]) if post["tags"] else "#ai"
        hook = args.hook or f"I've been thinking about {post['title'].lower()} lately.\n\nTurns out it's rather more interesting than you'd expect. Here are the bits that stuck with me \U0001f447\n\n{tags}"
        post_to_linkedin(pdf, hook, post)
    else:
        info(f"Ready at: {pdf}")
        info("Add --post to publish to LinkedIn")

if __name__ == "__main__":
    main()
