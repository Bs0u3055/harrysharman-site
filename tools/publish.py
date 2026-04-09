#!/usr/bin/env python3
"""
publish.py — Blog publishing automation.

Takes a markdown file with YAML frontmatter and:
1. Generates a header image via Gemini API
2. Publishes the post to the website (git commit + push)
3. Posts to LinkedIn with image
4. Creates a Substack draft

Usage:
    python publish.py post.md              # All platforms
    python publish.py post.md --site-only  # Site only
    python publish.py post.md --image-only # Image only
    python publish.py post.md --dry-run    # Show what would happen
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

# ---------------------------------------------------------------------------
# ANSI colour helpers
# ---------------------------------------------------------------------------
class C:
    """ANSI colour codes for terminal output."""
    GREEN  = "\033[92m"
    YELLOW = "\033[93m"
    RED    = "\033[91m"
    CYAN   = "\033[96m"
    BOLD   = "\033[1m"
    RESET  = "\033[0m"

def ok(msg):
    """Print a green success message."""
    print(f"{C.GREEN}[OK]{C.RESET} {msg}")

def warn(msg):
    """Print a yellow warning message."""
    print(f"{C.YELLOW}[WARN]{C.RESET} {msg}")

def fail(msg):
    """Print a red failure message."""
    print(f"{C.RED}[FAIL]{C.RESET} {msg}")

def info(msg):
    """Print a cyan info message."""
    print(f"{C.CYAN}[INFO]{C.RESET} {msg}")

def heading(msg):
    """Print a bold heading."""
    print(f"\n{C.BOLD}--- {msg} ---{C.RESET}")


# ---------------------------------------------------------------------------
# 1. Parse the post
# ---------------------------------------------------------------------------
def parse_post(filepath: str) -> dict:
    """
    Read a markdown file with YAML frontmatter.

    Returns dict with keys: title, tags, excerpt, image_prompt, body, slug, date.
    """
    text = Path(filepath).read_text(encoding="utf-8")

    # Split frontmatter from body
    match = re.match(r"^---\s*\n(.*?)\n---\s*\n(.*)", text, re.DOTALL)
    if not match:
        raise ValueError("Markdown file must start with YAML frontmatter (--- ... ---)")

    fm = yaml.safe_load(match.group(1))
    body = match.group(2).strip()

    title = fm.get("title", "").strip()
    if not title:
        raise ValueError("Frontmatter must include a 'title' field")

    tags = fm.get("tags", [])
    excerpt = fm.get("excerpt", "")
    image_prompt = fm.get("image_prompt", "")

    # Generate URL-safe slug from title
    slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")
    today = date.today().strftime("%Y-%m-%d")

    return {
        "title": title,
        "tags": tags,
        "excerpt": excerpt,
        "image_prompt": image_prompt,
        "body": body,
        "slug": slug,
        "date": today,
    }


# ---------------------------------------------------------------------------
# 2. Generate header image (Gemini API)
# ---------------------------------------------------------------------------
def generate_image(post: dict, dry_run: bool = False) -> str | None:
    """
    Generate a blog header image using the Gemini API.

    Returns the path to the saved image, or None on failure.
    """
    heading("Generating header image via Gemini")

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        fail("GEMINI_API_KEY not set — skipping image generation")
        return None

    ASSETS_DIR.mkdir(parents=True, exist_ok=True)
    image_path = ASSETS_DIR / f"{post['slug']}.png"

    # Build prompt
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

    if dry_run:
        info(f"[DRY RUN] Would save image to {image_path}")
        return str(image_path)

    try:
        from google import genai
        from google.genai import types

        client = genai.Client(api_key=api_key)

        response = client.models.generate_content(
            model="gemini-2.0-flash-exp",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_modalities=["TEXT", "IMAGE"],
            ),
        )

        # Extract image from response
        for part in response.candidates[0].content.parts:
            if part.inline_data is not None:
                image_data = part.inline_data.data
                image_path.write_bytes(image_data)
                ok(f"Image saved to {image_path}")
                return str(image_path)

        fail("Gemini response did not contain an image")
        return None

    except Exception as e:
        fail(f"Image generation failed: {e}")
        return None


# ---------------------------------------------------------------------------
# 3. Publish to website
# ---------------------------------------------------------------------------
def publish_to_site(post: dict, image_path: str | None, dry_run: bool = False) -> bool:
    """
    Publish the post to the website repo.

    - Writes markdown body to posts/{slug}.md
    - Updates posts/posts.json
    - Git add, commit, push
    """
    heading("Publishing to website")

    POSTS_DIR.mkdir(parents=True, exist_ok=True)
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)

    post_file = POSTS_DIR / f"{post['slug']}.md"
    rel_image = f"assets/{post['slug']}.png" if image_path else ""

    if dry_run:
        info(f"[DRY RUN] Would write post to {post_file}")
        info(f"[DRY RUN] Would update {POSTS_JSON}")
        info("[DRY RUN] Would git add, commit, push")
        return True

    # Write markdown body (without frontmatter)
    post_file.write_text(post["body"], encoding="utf-8")
    ok(f"Wrote {post_file}")

    # Update posts.json
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

    # Insert at top
    posts_list.insert(0, new_entry)

    # Enforce max 3 featured posts (newest win)
    featured_count = 0
    for p in posts_list:
        if p.get("featured"):
            featured_count += 1
            if featured_count > 3:
                p["featured"] = False

    POSTS_JSON.write_text(json.dumps(posts_list, indent=2, ensure_ascii=False), encoding="utf-8")
    ok(f"Updated {POSTS_JSON}")

    # Git operations
    try:
        os.chdir(REPO_ROOT)
        subprocess.run(["git", "add", "-A"], check=True, capture_output=True, text=True)
        result = subprocess.run(
            ["git", "commit", "-m", f"New post: {post['title']}"],
            check=True, capture_output=True, text=True,
        )
        ok(f"Git commit: {result.stdout.strip()}")

        push_result = subprocess.run(
            ["git", "push"],
            capture_output=True, text=True,
        )
        if push_result.returncode == 0:
            ok("Git push succeeded")
        else:
            warn(f"Git push failed (may need remote configured): {push_result.stderr.strip()}")
        return True
    except subprocess.CalledProcessError as e:
        fail(f"Git operation failed: {e.stderr.strip() if e.stderr else e}")
        return False


# ---------------------------------------------------------------------------
# 4. Publish to LinkedIn
# ---------------------------------------------------------------------------
def publish_to_linkedin(post: dict, image_path: str | None, dry_run: bool = False) -> bool:
    """
    Publish the post to LinkedIn via the Posts API.

    Uploads header image, creates a text or article post, and adds
    a first comment linking to the full site.
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
        "LinkedIn-Version": "202403",
        "Content-Type": "application/json",
    }

    post_url = f"https://harrysharman.com/post.html?slug={post['slug']}"

    # Build text content
    full_text = f"{post['title']}\n\n{post['body']}"
    if len(full_text) > 3000:
        truncated = full_text[:2800].rsplit(" ", 1)[0]
        text = f"{truncated}...\n\nRead more at {post_url}"
    else:
        text = full_text

    if dry_run:
        info(f"[DRY RUN] Would post to LinkedIn ({len(text)} chars)")
        info("[DRY RUN] Would add first comment with site link")
        return True

    # --- Upload image if available ---
    image_urn = None
    if image_path and Path(image_path).exists():
        try:
            # Step 1: Initialize upload
            init_payload = {
                "initializeUploadRequest": {
                    "owner": author,
                }
            }
            init_resp = requests.post(
                f"{base_url}/images?action=initializeUpload",
                headers=headers,
                json=init_payload,
            )
            init_resp.raise_for_status()
            upload_data = init_resp.json()["value"]
            upload_url = upload_data["uploadUrl"]
            image_urn = upload_data["image"]

            # Step 2: Upload binary
            img_bytes = Path(image_path).read_bytes()
            upload_headers = {
                "Authorization": f"Bearer {token}",
                "Content-Type": "application/octet-stream",
            }
            upload_resp = requests.put(upload_url, headers=upload_headers, data=img_bytes)
            upload_resp.raise_for_status()
            ok(f"Image uploaded to LinkedIn: {image_urn}")

        except Exception as e:
            warn(f"LinkedIn image upload failed, posting without image: {e}")
            image_urn = None

    # --- Create post ---
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

        # Attach image if uploaded
        if image_urn:
            post_payload["content"] = {
                "media": {
                    "title": post["title"],
                    "id": image_urn,
                }
            }

        resp = requests.post(f"{base_url}/posts", headers=headers, json=post_payload)
        resp.raise_for_status()

        # Extract post URN from header
        post_urn = resp.headers.get("x-restli-id", "")
        ok(f"LinkedIn post created: {post_urn}")

        # --- Add first comment ---
        if post_urn:
            try:
                comment_payload = {
                    "actor": author,
                    "message": {
                        "text": "Read this and 65+ other articles at harrysharman.com",
                    },
                    "object": post_urn,
                }
                comment_resp = requests.post(
                    f"{base_url}/socialActions/{post_urn}/comments",
                    headers=headers,
                    json=comment_payload,
                )
                comment_resp.raise_for_status()
                ok("First comment added")
            except Exception as e:
                warn(f"Failed to add first comment: {e}")

        return True

    except Exception as e:
        fail(f"LinkedIn post failed: {e}")
        if hasattr(e, "response") and e.response is not None:
            fail(f"Response body: {e.response.text[:500]}")
        return False


# ---------------------------------------------------------------------------
# 5. Publish to Substack (Draft)
# ---------------------------------------------------------------------------
def publish_to_substack(post: dict, dry_run: bool = False) -> bool:
    """
    Create a draft on Substack using the substack-api package.

    Converts markdown body to HTML and posts as a draft (not published).
    Fails gracefully if substack-api is not available or auth fails.
    """
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

        # Convert markdown to HTML
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
    """Main entry point — parse args and run the publishing pipeline."""
    parser = argparse.ArgumentParser(
        description="Publish a markdown blog post to website, LinkedIn, and Substack."
    )
    parser.add_argument("file", help="Path to markdown file with YAML frontmatter")
    parser.add_argument("--site-only", action="store_true", help="Only publish to website")
    parser.add_argument("--image-only", action="store_true", help="Only generate header image")
    parser.add_argument("--dry-run", action="store_true", help="Show what would happen without doing it")
    args = parser.parse_args()

    # Load .env from tools directory
    env_file = TOOLS_DIR / ".env"
    if env_file.exists():
        load_dotenv(env_file)
    else:
        # Also check repo root
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

    # Track results
    results = {}

    # --- Image only mode ---
    if args.image_only:
        image_path = generate_image(post, dry_run=args.dry_run)
        results["Image"] = image_path is not None
        print_summary(results, args.dry_run)
        sys.exit(0 if all(results.values()) else 1)

    # --- Generate image (used by site + LinkedIn) ---
    image_path = generate_image(post, dry_run=args.dry_run)
    results["Image"] = image_path is not None

    # --- Publish to site (always runs first) ---
    results["Website"] = publish_to_site(post, image_path, dry_run=args.dry_run)

    # --- Site only mode: stop here ---
    if args.site_only:
        print_summary(results, args.dry_run)
        sys.exit(0 if results["Website"] else 1)

    # --- LinkedIn ---
    results["LinkedIn"] = publish_to_linkedin(post, image_path, dry_run=args.dry_run)

    # --- Substack ---
    results["Substack"] = publish_to_substack(post, dry_run=args.dry_run)

    print_summary(results, args.dry_run)

    # Exit 0 if site publish succeeded (others are best-effort)
    sys.exit(0 if results.get("Website") else 1)


def print_summary(results: dict, dry_run: bool = False):
    """Print a coloured summary table of what succeeded and failed."""
    heading("Summary" + (" (DRY RUN)" if dry_run else ""))
    for platform, success in results.items():
        status = f"{C.GREEN}OK{C.RESET}" if success else f"{C.RED}FAILED{C.RESET}"
        print(f"  {platform:12s} {status}")
    print()


if __name__ == "__main__":
    main()
