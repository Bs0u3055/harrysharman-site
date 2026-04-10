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
# Custom exceptions
# ---------------------------------------------------------------------------
class ImageGenerationError(Exception):
    """Raised when hero image generation fails and must halt publishing."""
    pass

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
    """Generate the mustard yellow + white doodle background via Gemini.

    Raises ImageGenerationError if Gemini fails or returns no image.
    """
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
            model="gemini-2.5-flash-image",
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
        raise ImageGenerationError(
            "Gemini response did not contain an image (no inline_data in any part)"
        )
    except ImageGenerationError:
        raise
    except Exception as e:
        fail(f"Doodle background generation failed: {e}")
        raise ImageGenerationError(
            f"Doodle background generation failed: {e}"
        ) from e


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


def generate_image(post: dict, photo_path: str | None = None, dry_run: bool = False) -> str:
    """
    Generate a blog header image.

    If photo_path is provided: branded workflow (remove bg → doodles → composite)
    If no photo: simple editorial image via Gemini

    Raises ImageGenerationError on any failure. Callers must handle this.
    Never returns None and never silently falls back without a guaranteed result.
    """
    heading("Generating header image")

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        fail("GEMINI_API_KEY not set")
        raise ImageGenerationError(
            "GEMINI_API_KEY not set in environment — cannot generate image"
        )

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

        try:
            # Step 1: Remove background from photo
            if not remove_background(photo_path, cutout_path):
                raise ImageGenerationError(
                    f"Background removal failed for photo {photo_path}"
                )

            # Step 2: Extract visual concepts and generate doodle background
            # (propagates ImageGenerationError if Gemini fails)
            icons = extract_visual_concepts(post, api_key)
            generate_doodle_background(icons, api_key, bg_path)

            # Step 3: Composite
            if not composite_hero_image(bg_path, cutout_path, final_image):
                raise ImageGenerationError(
                    "Compositing photo cutout onto doodle background failed"
                )

            # Verify the final image actually exists on disk
            if not final_image.exists():
                raise ImageGenerationError(
                    f"Composited hero image missing from disk: {final_image}"
                )

            # Clean up intermediate files on success
            cutout_path.unlink(missing_ok=True)
            bg_path.unlink(missing_ok=True)
            return str(final_image)
        except Exception:
            # Clean up intermediates on failure too — no orphaned files
            cutout_path.unlink(missing_ok=True)
            bg_path.unlink(missing_ok=True)
            raise

    # --- Simple workflow (no photo) ---
    else:
        if photo_path:
            warn(f"Photo not found at {photo_path}, using simple image generation")
        result = _generate_simple_image(post, api_key, final_image)
        if not final_image.exists():
            raise ImageGenerationError(
                f"Simple image generation reported success but file missing: {final_image}"
            )
        return result


def _generate_simple_image(post: dict, api_key: str, output_path: Path) -> str:
    """Fallback: generate a simple editorial-style image.

    Raises ImageGenerationError on any failure.
    """
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
            model="gemini-2.5-flash-image",
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
        raise ImageGenerationError(
            "Gemini response did not contain an image (no inline_data in any part)"
        )
    except ImageGenerationError:
        raise
    except Exception as e:
        fail(f"Image generation failed: {e}")
        raise ImageGenerationError(f"Image generation failed: {e}") from e


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

    # Upsert by slug: drop any existing entry for this post, then insert the
    # fresh one at the top. Prevents duplicate listings when re-publishing.
    before = len(posts_list)
    posts_list = [p for p in posts_list if p.get("slug") != post["slug"]]
    if len(posts_list) < before:
        info(f"Replacing existing posts.json entry for slug={post['slug']}")
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
        # Stage ONLY the files this publish actually touched. Never `git add -A`
        # — that previously swept in stray .env backups, __pycache__, and
        # whatever else happened to be in the working tree, which got blocked
        # by GitHub push protection when secrets leaked in.
        files_to_stage = [
            str(post_file.relative_to(REPO_ROOT)),
            str(POSTS_JSON.relative_to(REPO_ROOT)),
        ]
        if image_path:
            img = Path(image_path)
            if img.exists():
                files_to_stage.append(str(img.relative_to(REPO_ROOT)))
        subprocess.run(
            ["git", "add", "--"] + files_to_stage,
            check=True, capture_output=True, text=True,
        )
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
def publish_to_linkedin(post: dict, image_path: str | None, dry_run: bool = False) -> bool:
    """
    Convert markdown body to formatted text suitable for LinkedIn newsletter
    and save it locally for manual posting.
    """
    heading("Preparing LinkedIn text")

    output_dir = TOOLS_DIR / "output"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_file = output_dir / f"linkedin-{post['slug']}.txt"

    post_url = f"https://harrysharman.com/post.html?slug={post['slug']}"

    # Use linkedin_intro if provided, otherwise convert the full body
    if post.get("linkedin_intro"):
        formatted_text = post["linkedin_intro"]
    else:
        # Strip markdown formatting for LinkedIn plain text
        body = post["body"]
        # Remove headers markup but keep the text
        body = re.sub(r"^#{1,6}\s+", "", body, flags=re.MULTILINE)
        # Remove bold/italic markers
        body = re.sub(r"\*\*(.+?)\*\*", r"\1", body)
        body = re.sub(r"\*(.+?)\*", r"\1", body)
        # Remove links but keep text
        body = re.sub(r"\[(.+?)\]\(.+?\)", r"\1", body)
        # Remove images
        body = re.sub(r"!\[.*?\]\(.+?\)", "", body)
        # Clean up extra blank lines
        body = re.sub(r"\n{3,}", "\n\n", body)
        formatted_text = f"{post['title']}\n\n{body.strip()}"

    # Truncate if needed for LinkedIn 3000 char limit
    if len(formatted_text) > 3000:
        truncated = formatted_text[:2800].rsplit(" ", 1)[0]
        formatted_text = f"{truncated}...\n\nRead the full article at {post_url}"

    if dry_run:
        info(f"[DRY RUN] Would save LinkedIn text to {output_file}")
        return True

    # Build the output with instructions
    output_content = (
        "=== LinkedIn Newsletter Text ===\n"
        f"Title: {post['title']}\n"
        f"Excerpt: {post['excerpt']}\n"
        f"URL: {post_url}\n"
        f"Character count: {len(formatted_text)}\n"
        "\n"
        "=== Formatted Text (copy below this line) ===\n"
        "\n"
        f"{formatted_text}\n"
        "\n"
        "=== End of Text ===\n"
        "\n"
        "Notes:\n"
        "- Hero image is generated separately in assets/\n"
        "- Paste the text above into LinkedIn as a new post or newsletter\n"
        "- Add the hero image manually when posting\n"
    )

    output_file.write_text(output_content, encoding="utf-8")
    ok(f"LinkedIn text saved to {output_file}")
    info(f"Character count: {len(formatted_text)}")
    print(f"LinkedIn text saved to /root/harrysharman-site/tools/output/linkedin-{post['slug']}.txt")
    return True


# ---------------------------------------------------------------------------
# 5. Publish to Substack (Draft)
# ---------------------------------------------------------------------------
def publish_to_substack(post: dict, dry_run: bool = False) -> bool:
    """
    Convert markdown body to HTML and save locally for manual Substack upload.
    """
    heading("Preparing Substack HTML")

    output_dir = TOOLS_DIR / "output"
    output_dir.mkdir(parents=True, exist_ok=True)
    output_file = output_dir / f"substack-{post['slug']}.html"

    if dry_run:
        info(f"[DRY RUN] Would save Substack HTML to {output_file}")
        return True

    try:
        html_body = md_lib.markdown(post["body"], extensions=["extra", "codehilite"])

        html_content = (
            "<!DOCTYPE html>\n"
            "<html>\n"
            "<head>\n"
            '    <meta charset="utf-8">\n'
            f"    <title>{post['title']}</title>\n"
            "</head>\n"
            "<body>\n"
            f"    <h1>{post['title']}</h1>\n"
            f"    <p><em>{post['excerpt']}</em></p>\n"
            "    <hr>\n"
            f"    {html_body}\n"
            "</body>\n"
            "</html>"
        )

        output_file.write_text(html_content, encoding="utf-8")
        ok(f"Substack HTML saved to {output_file}")
        print(f"Substack HTML saved to /root/harrysharman-site/tools/output/substack-{post['slug']}.html")
        return True

    except Exception as e:
        fail(f"Substack HTML generation failed: {e}")
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
    parser.add_argument(
        "--skip-image",
        action="store_true",
        help="EMERGENCY ONLY: skip hero image generation and publish without it. "
             "Default behaviour REQUIRES a successful image — this flag bypasses that check.",
    )
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

    # ---- Image generation (MUST succeed unless --skip-image is set) ----
    image_path: str | None = None
    if args.skip_image:
        warn("--skip-image passed: bypassing image generation. "
             "Post will be published WITHOUT a hero image.")
        results["Image"] = True  # Explicit bypass, not a failure
    else:
        try:
            image_path = generate_image(
                post, photo_path=args.photo, dry_run=args.dry_run
            )
        except ImageGenerationError as e:
            fail("ABORTED: Image generation failed.")
            print(f"   Reason: {e}")
            print("   Nothing was published. "
                  "Fix the image generation issue and re-run.")
            print("   (Use --skip-image to bypass this check in an emergency.)")
            sys.exit(1)

        # Verify the image file actually landed on disk (skip in dry-run)
        if not args.dry_run:
            expected = ASSETS_DIR / f"{post['slug']}.jpg"
            if not image_path or not Path(image_path).exists() or not expected.exists():
                fail("ABORTED: Image generation reported success but no file on disk.")
                print(f"   Expected: {expected}")
                print("   Nothing was published. "
                      "Fix the image generation issue and re-run.")
                sys.exit(1)

        results["Image"] = True
        ok(f"Hero image verified on disk: {image_path}")

    # Image only mode — stop after image generation
    if args.image_only:
        print_summary(results, args.dry_run)
        sys.exit(0 if all(results.values()) else 1)

    # ---- Publish to site (only reached if image succeeded or was bypassed) ----
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
