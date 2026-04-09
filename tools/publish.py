#!/usr/bin/env python3
"""
publish.py — Blog publishing automation for Beautiful Thinking.

Takes a markdown file with YAML frontmatter and:
1. Generates a branded header image (photo + doodles on mustard yellow)
2. Publishes the post to the website (git commit + push → Netlify auto-deploy)
3. Posts to LinkedIn as native text with image + first comment
4. Creates a Substack draft

Usage:
    python publish.py post.md                      # All platforms
    python publish.py post.md --photo photo.jpg    # With Harry's photo for hero image
    python publish.py post.md --site-only          # Site only
    python publish.py post.md --image-only         # Image only
    python publish.py post.md --dry-run            # Show what would happen
"""

import argparse
import base64
import json
import os
import re
import subprocess
import sys
from datetime import date
from pathlib import Path

import yaml
import requests
import markdown as md_lib
from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Paths — repo root is one level up from tools/
# ---------------------------------------------------------------------------
TOOLS_DIR = Path(__file__).resolve().parent
REPO_ROOT = TOOLS_DIR.parent
POSTS_DIR = REPO_ROOT / "posts"
ASSETS_DIR = REPO_ROOT / "assets"
POSTS_JSON = POSTS_DIR / "posts.json"

# Brand colours
MUSTARD_YELLOW = (232, 168, 32)  # #E8A820

# ---------------------------------------------------------------------------
# ANSI colour helpers
# ---------------------------------------------------------------------------
class C:
    GREEN  = "\033[92m"
    YELLOW = "\033[93m"
    RED    = "\033[91m"
    CYAN   = "\033[96m"
    BOLD   = "\033[1m"
    RESET  = "\033[0m"

def ok(msg):    print(f"{C.GREEN}[OK]{C.RESET} {msg}")
def warn(msg):  print(f"{C.YELLOW}[WARN]{C.RESET} {msg}")
def fail(msg):  print(f"{C.RED}[FAIL]{C.RESET} {msg}")
def info(msg):  print(f"{C.CYAN}[INFO]{C.RESET} {msg}")
def heading(msg): print(f"\n{C.BOLD}--- {msg} ---{C.RESET}")


# ---------------------------------------------------------------------------
# 1. Parse the post
# ---------------------------------------------------------------------------
def parse_post(filepath: str) -> dict:
    text = Path(filepath).read_text(encoding="utf-8")
    match = re.match(r"^---\s*\n(.*?)\n---\s*\n(.*)", text, re.DOTALL)
    if not match:
        raise ValueError("Markdown file must start with YAML frontmatter (--- ... ---)")

    fm = yaml.safe_load(match.group(1))
    body = match.group(2).strip()
    title = fm.get("title", "").strip()
    if not title:
        raise ValueError("Frontmatter must include a 'title' field")

    slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
    today = date.today().strftime("%Y-%m-%d")

    return {
        "title": title,
        "tags": fm.get("tags", []),
        "excerpt": fm.get("excerpt", ""),
        "image_prompt": fm.get("image_prompt", ""),
        "linkedin_intro": fm.get("linkedin_intro", ""),
        "body": body,
        "slug": slug,
        "date": today,
    }


# ---------------------------------------------------------------------------
# 2. Generate header image
# ---------------------------------------------------------------------------
def extract_visual_concepts(post: dict, api_key: str) -> str:
    """Use Gemini to extract drawable icons from the blog content."""
    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=api_key)
        prompt = f"""You are a visual concept extractor for a blog illustration system.

Read the following blog post and extract 8-10 concrete, drawable objects or icons that represent the key themes and ideas.

Rules:
- Each item must be a simple, recognisable object that works as a small doodle icon (e.g. "brain", "rocket", "lightbulb", "clipboard with checklist")
- Avoid abstract concepts that can't be drawn as a single icon
- Include a mix of literal objects from the content AND metaphorical representations
- Always include at least one arrow or flow element
- If the blog mentions AI, tech, or science, include relevant icons
- Output ONLY a comma-separated list, nothing else

Blog post:
{post['body'][:3000]}"""

        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
        )
        icons = response.text.strip()
        info(f"Visual concepts: {icons}")
        return icons
    except Exception as e:
        warn(f"Concept extraction failed, using defaults: {e}")
        tag_str = ", ".join(post["tags"]) if post["tags"] else "ideas"
        return f"brain, lightbulb, arrows, speech bubble, {tag_str}"


def generate_doodle_background(icons: str, api_key: str, output_path: Path) -> bool:
    """Generate the mustard yellow + white doodle background via Gemini."""
    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=api_key)
        prompt = f"""A solid mustard yellow background (#E8A820) covered in white hand-drawn doodle illustrations. Thin white line art in a loose, playful editorial sketch style — like whiteboard doodles drawn with a thin marker. No fills, outlines only.

The illustrations are arranged in a swirling, spiraling composition that radiates outward from a central point in the upper-middle area of the image. Small icons and symbols are connected by flowing curved lines, dotted trails, and gentle spiral paths.

Include these icons scattered throughout the composition: {icons}

Also include small decorative elements between the main icons: tiny dots, small stars, mini arrows, dashes, and sparkle marks.

The "AI" text should appear hand-lettered in white somewhere in the lower-left area.

Style: editorial illustration, hand-drawn doodle, whiteboard sketch, consistent thin white line weight throughout. No colour other than white on yellow. No gradients. No photographic elements. No text other than "AI".

Aspect ratio: 16:9
Resolution: 1200x675px minimum"""

        response = client.models.generate_content(
            model="gemini-2.0-flash-exp",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_modalities=["TEXT", "IMAGE"],
            ),
        )

        for part in response.candidates[0].content.parts:
            if part.inline_data is not None:
                output_path.write_bytes(part.inline_data.data)
                ok(f"Doodle background saved to {output_path}")
                return True

        fail("Gemini response did not contain an image")
        return False
    except Exception as e:
        fail(f"Doodle background generation failed: {e}")
        return False


def remove_background(photo_path: str, output_path: Path) -> bool:
    """Remove background from Harry's photo using rembg."""
    try:
        from rembg import remove
        from PIL import Image
        import io

        info(f"Removing background from {photo_path}...")
        input_img = Image.open(photo_path)
        output_img = remove(input_img)
        output_img.save(output_path, "PNG")
        ok(f"Cutout saved to {output_path}")
        return True
    except Exception as e:
        fail(f"Background removal failed: {e}")
        return False


def composite_hero_image(background_path: Path, cutout_path: Path, output_path: Path) -> bool:
    """Composite Harry's cutout onto the doodle background."""
    try:
        from PIL import Image

        bg = Image.open(background_path).convert("RGBA")
        cutout = Image.open(cutout_path).convert("RGBA")

        # Scale cutout to ~75% of background height
        scale = (bg.height * 0.75) / cutout.height
        new_size = (int(cutout.width * scale), int(cutout.height * scale))
        cutout = cutout.resize(new_size, Image.LANCZOS)

        # Position: centered horizontally, anchored to bottom
        x = (bg.width - cutout.width) // 2
        y = bg.height - cutout.height

        bg.paste(cutout, (x, y), cutout)

        # Force to 1200x675 wide landscape for LinkedIn/site
        final = bg.convert("RGB")
        final = final.resize((1200, 675), Image.LANCZOS)
        final.save(output_path, "JPEG", quality=85)
        ok(f"Hero image saved to {output_path} (1200x675 landscape)")
        return True
    except Exception as e:
        fail(f"Image compositing failed: {e}")
        return False


def generate_image(post: dict, photo_path: str | None = None, dry_run: bool = False) -> str | None:
    """
    Generate a blog header image.

    If photo_path is provided: branded workflow (remove bg → doodles → composite)
    If no photo: simple editorial image via Gemini
    """
    heading("Generating header image")

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        fail("GEMINI_API_KEY not set — skipping image generation")
        return None

    ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    final_image = ASSETS_DIR / f"{post['slug']}.jpg"

    if dry_run:
        info(f"[DRY RUN] Would save image to {final_image}")
        return str(final_image)

    # --- Branded workflow (with photo) ---
    if photo_path and Path(photo_path).exists():
        info("Using branded workflow: photo + doodles on mustard yellow")

        cutout_path = ASSETS_DIR / f"{post['slug']}-cutout.png"
        bg_path = ASSETS_DIR / f"{post['slug']}-bg.png"

        # Step 1: Remove background from photo
        if not remove_background(photo_path, cutout_path):
            warn("Falling back to simple image generation")
            return _generate_simple_image(post, api_key, final_image)

        # Step 2: Extract visual concepts and generate doodle background
        icons = extract_visual_concepts(post, api_key)
        if not generate_doodle_background(icons, api_key, bg_path):
            warn("Falling back to simple image generation")
            return _generate_simple_image(post, api_key, final_image)

        # Step 3: Composite
        if composite_hero_image(bg_path, cutout_path, final_image):
            # Clean up intermediate files
            cutout_path.unlink(missing_ok=True)
            bg_path.unlink(missing_ok=True)
            return str(final_image)
        else:
            warn("Compositing failed, falling back to simple image")
            return _generate_simple_image(post, api_key, final_image)

    # --- Simple workflow (no photo) ---
    else:
        if photo_path:
            warn(f"Photo not found at {photo_path}, using simple image generation")
        return _generate_simple_image(post, api_key, final_image)


def _generate_simple_image(post: dict, api_key: str, output_path: Path) -> str | None:
    """Fallback: generate a simple editorial-style image."""
    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=api_key)

        if post["image_prompt"]:
            prompt = post["image_prompt"]
        else:
            tag_str = ", ".join(post["tags"]) if post["tags"] else "technology"
            prompt = (
                f"Create a blog header image for an article titled \"{post['title']}\" "
                f"about {tag_str}. "
                "Style: Clean, minimal, editorial. Muted warm colour palette "
                "(creams, soft blues, warm greys). Abstract or conceptual — not literal. "
                "No text in the image. Wide 16:9 aspect ratio. "
                "Intellectual, thoughtful, slightly playful."
            )

        info(f"Prompt: {prompt[:120]}...")

        response = client.models.generate_content(
            model="gemini-2.0-flash-exp",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_modalities=["TEXT", "IMAGE"],
            ),
        )

        for part in response.candidates[0].content.parts:
            if part.inline_data is not None:
                # Save raw then resize to 1200x675 landscape
                output_path.write_bytes(part.inline_data.data)
                try:
                    from PIL import Image as PILImage
                    img = PILImage.open(output_path)
                    img = img.resize((1200, 675), PILImage.LANCZOS)
                    img.save(output_path, "JPEG", quality=85)
                except Exception:
                    pass  # Keep raw image if resize fails
                ok(f"Image saved to {output_path} (1200x675 landscape)")
                return str(output_path)

        fail("Gemini response did not contain an image")
        return None
    except Exception as e:
        fail(f"Image generation failed: {e}")
        return None


# ---------------------------------------------------------------------------
# 3. Publish to website
# ---------------------------------------------------------------------------
def publish_to_site(post: dict, image_path: str | None, dry_run: bool = False) -> bool:
    heading("Publishing to website")

    POSTS_DIR.mkdir(parents=True, exist_ok=True)
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)

    post_file = POSTS_DIR / f"{post['slug']}.md"
    rel_image = f"assets/{post['slug']}.jpg" if image_path else ""

    if dry_run:
        info(f"[DRY RUN] Would write post to {post_file}")
        info(f"[DRY RUN] Would update {POSTS_JSON}")
        info("[DRY RUN] Would git add, commit, push")
        return True

    post_file.write_text(post["body"], encoding="utf-8")
    ok(f"Wrote {post_file}")

    if POSTS_JSON.exists():
        posts_list = json.loads(POSTS_JSON.read_text(encoding="utf-8"))
    else:
        posts_list = []

    new_entry = {
        "slug": post["slug"],
        "title": post["title"],
        "date": post["date"],
        "excerpt": post["excerpt"],
        "tags": post["tags"],
        "featured": True,
        "image": rel_image,
    }

    posts_list.insert(0, new_entry)

    featured_count = 0
    for p in posts_list:
        if p.get("featured"):
            featured_count += 1
            if featured_count > 3:
                p["featured"] = False

    POSTS_JSON.write_text(json.dumps(posts_list, indent=2, ensure_ascii=False), encoding="utf-8")
    ok(f"Updated {POSTS_JSON}")

    try:
        os.chdir(REPO_ROOT)
        subprocess.run(["git", "add", "-A"], check=True, capture_output=True, text=True)
        result = subprocess.run(
            ["git", "commit", "-m", f"New post: {post['title']}"],
            check=True, capture_output=True, text=True,
        )
        ok(f"Git commit: {result.stdout.strip()}")

        push_result = subprocess.run(["git", "push"], capture_output=True, text=True)
        if push_result.returncode == 0:
            ok("Git push succeeded — Netlify will auto-deploy")
        else:
            warn(f"Git push failed: {push_result.stderr.strip()}")
        return True
    except subprocess.CalledProcessError as e:
        fail(f"Git operation failed: {e.stderr.strip() if e.stderr else e}")
        return False


# ---------------------------------------------------------------------------
# 4. Publish to LinkedIn
# ---------------------------------------------------------------------------
def upload_image_to_linkedin(image_path: str, token: str, author: str) -> str | None:
    """Upload an image to LinkedIn and return the image URN."""
    base_url = "https://api.linkedin.com/rest"
    headers = {
        "Authorization": f"Bearer {token}",
        "LinkedIn-Version": "202502",
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
    }

    try:
        # Initialize upload
        init_resp = requests.post(
            f"{base_url}/images?action=initializeUpload",
            headers=headers,
            json={"initializeUploadRequest": {"owner": author}},
        )
        init_resp.raise_for_status()
        upload_data = init_resp.json()["value"]
        upload_url = upload_data["uploadUrl"]
        image_urn = upload_data["image"]

        # Upload binary
        img_bytes = Path(image_path).read_bytes()
        upload_resp = requests.put(
            upload_url,
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/octet-stream"},
            data=img_bytes,
        )
        upload_resp.raise_for_status()
        ok(f"Image uploaded to LinkedIn: {image_urn}")
        return image_urn
    except Exception as e:
        warn(f"LinkedIn image upload failed: {e}")
        return None


def publish_to_linkedin(post: dict, image_path: str | None, dry_run: bool = False) -> bool:
    """
    Publish to LinkedIn using Option B strategy:
    - Full text as native post (maximum reach)
    - First comment with link to harrysharman.com
    - Attached image if available
    """
    heading("Publishing to LinkedIn")

    token = os.getenv("LINKEDIN_ACCESS_TOKEN")
    member_id = os.getenv("LINKEDIN_MEMBER_ID")

    if not token or not member_id:
        fail("LINKEDIN_ACCESS_TOKEN or LINKEDIN_MEMBER_ID not set — skipping")
        return False

    author = f"urn:li:person:{member_id}"
    base_url = "https://api.linkedin.com/rest"
    headers = {
        "Authorization": f"Bearer {token}",
        "LinkedIn-Version": "202502",
        "Content-Type": "application/json",
        "X-Restli-Protocol-Version": "2.0.0",
    }

    post_url = f"https://harrysharman.com/post.html?slug={post['slug']}"

    # Use linkedin_intro if provided, otherwise use the full text
    if post.get("linkedin_intro"):
        text = post["linkedin_intro"]
    else:
        # Option B: full article as text (LinkedIn limit is 3000 chars for posts)
        full_text = f"{post['title']}\n\n{post['body']}"
        if len(full_text) > 3000:
            truncated = full_text[:2800].rsplit(" ", 1)[0]
            text = f"{truncated}...\n\n📖 Read the full article at {post_url}"
        else:
            text = full_text

    if dry_run:
        info(f"[DRY RUN] Would post to LinkedIn ({len(text)} chars)")
        info("[DRY RUN] Would add first comment with site link")
        return True

    # Upload image if available
    image_urn = None
    if image_path and Path(image_path).exists():
        image_urn = upload_image_to_linkedin(image_path, token, author)

    # Create post
    try:
        post_payload = {
            "author": author,
            "commentary": text,
            "visibility": "PUBLIC",
            "distribution": {
                "feedDistribution": "MAIN_FEED",
                "targetEntities": [],
                "thirdPartyDistributionChannels": [],
            },
            "lifecycleState": "PUBLISHED",
        }

        if image_urn:
            post_payload["content"] = {
                "media": {"title": post["title"], "id": image_urn}
            }

        resp = requests.post(f"{base_url}/posts", headers=headers, json=post_payload)
        resp.raise_for_status()

        post_urn = resp.headers.get("x-restli-id", "")
        ok(f"LinkedIn post created: {post_urn}")

        # Add first comment with site link
        if post_urn:
            try:
                comment_resp = requests.post(
                    f"{base_url}/socialActions/{post_urn}/comments",
                    headers=headers,
                    json={
                        "actor": author,
                        "message": {"text": f"Read this and all my articles at harrysharman.com 🧠\n{post_url}"},
                        "object": post_urn,
                    },
                )
                comment_resp.raise_for_status()
                ok("First comment added with site link")
            except Exception as e:
                warn(f"Failed to add first comment: {e}")

        return True

    except Exception as e:
        fail(f"LinkedIn post failed: {e}")
        if hasattr(e, "response") and e.response is not None:
            fail(f"Response: {e.response.text[:500]}")
        return False


# ---------------------------------------------------------------------------
# 5. Publish to Substack (Draft)
# ---------------------------------------------------------------------------
def publish_to_substack(post: dict, dry_run: bool = False) -> bool:
    heading("Creating Substack draft")

    email = os.getenv("SUBSTACK_EMAIL")
    password = os.getenv("SUBSTACK_PASSWORD")
    substack_url = os.getenv("SUBSTACK_URL")

    if not email or not password or not substack_url:
        fail("SUBSTACK_EMAIL, SUBSTACK_PASSWORD, or SUBSTACK_URL not set — skipping")
        return False

    if dry_run:
        info("[DRY RUN] Would create Substack draft")
        return True

    try:
        from substack import Api as SubstackApi

        api = SubstackApi(
            email=email,
            password=password,
            publication_url=substack_url,
        )

        html_body = md_lib.markdown(post["body"], extensions=["extra", "codehilite"])

        draft = api.create_draft(
            title=post["title"],
            subtitle=post["excerpt"],
            body=html_body,
        )

        ok(f"Substack draft created: {draft.get('id', 'unknown')}")
        return True

    except ImportError:
        warn("substack-api package not installed — skipping Substack")
        return False
    except Exception as e:
        warn(f"Substack draft creation failed (non-blocking): {e}")
        return False


# ---------------------------------------------------------------------------
# 6. CLI interface
# ---------------------------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(
        description="Publish a Beautiful Thinking blog post to website, LinkedIn, and Substack."
    )
    parser.add_argument("file", help="Path to markdown file with YAML frontmatter")
    parser.add_argument("--photo", help="Path to Harry's photo for branded hero image")
    parser.add_argument("--site-only", action="store_true", help="Only publish to website")
    parser.add_argument("--image-only", action="store_true", help="Only generate header image")
    parser.add_argument("--dry-run", action="store_true", help="Show what would happen")
    args = parser.parse_args()

    # Load .env
    env_file = TOOLS_DIR / ".env"
    if env_file.exists():
        load_dotenv(env_file)
    else:
        env_root = REPO_ROOT / ".env"
        if env_root.exists():
            load_dotenv(env_root)

    # Parse the post
    heading("Parsing post")
    try:
        post = parse_post(args.file)
    except (ValueError, FileNotFoundError) as e:
        fail(str(e))
        sys.exit(1)

    ok(f"Title: {post['title']}")
    ok(f"Slug:  {post['slug']}")
    ok(f"Date:  {post['date']}")
    ok(f"Tags:  {', '.join(post['tags'])}")
    if post["excerpt"]:
        ok(f"Excerpt: {post['excerpt']}")
    if args.photo:
        ok(f"Photo: {args.photo}")

    results = {}

    # Image only mode
    if args.image_only:
        image_path = generate_image(post, photo_path=args.photo, dry_run=args.dry_run)
        results["Image"] = image_path is not None
        print_summary(results, args.dry_run)
        sys.exit(0 if all(results.values()) else 1)

    # Generate image
    image_path = generate_image(post, photo_path=args.photo, dry_run=args.dry_run)
    results["Image"] = image_path is not None

    # Publish to site
    results["Website"] = publish_to_site(post, image_path, dry_run=args.dry_run)

    # Site only: stop here
    if args.site_only:
        print_summary(results, args.dry_run)
        sys.exit(0 if results["Website"] else 1)

    # LinkedIn
    results["LinkedIn"] = publish_to_linkedin(post, image_path, dry_run=args.dry_run)

    # Substack
    results["Substack"] = publish_to_substack(post, dry_run=args.dry_run)

    print_summary(results, args.dry_run)
    sys.exit(0 if results.get("Website") else 1)


def print_summary(results: dict, dry_run: bool = False):
    heading("Summary" + (" (DRY RUN)" if dry_run else ""))
    for platform, success in results.items():
        status = f"{C.GREEN}OK{C.RESET}" if success else f"{C.RED}FAILED{C.RESET}"
        print(f"  {platform:12s} {status}")
    print()


if __name__ == "__main__":
    main()
