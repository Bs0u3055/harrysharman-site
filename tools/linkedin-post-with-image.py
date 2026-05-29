#!/usr/bin/env python3
"""
linkedin-post-with-image.py — Post to LinkedIn with an image attachment.

Usage:
    python3 linkedin-post-with-image.py --text post.txt --image image.jpg
    python3 linkedin-post-with-image.py --text post.txt --image image.jpg --comment "Full details: https://..."
    python3 linkedin-post-with-image.py --text post.txt --image image.jpg --dry-run

Credentials from /root/harrysharman-site/tools/.env
Prints the post URL on success.
"""
import argparse
import os
import sys
from pathlib import Path
from dotenv import load_dotenv
import requests

TOOLS_DIR = Path(__file__).resolve().parent
load_dotenv(TOOLS_DIR / ".env")

TOKEN = os.getenv("LINKEDIN_ACCESS_TOKEN")
MEMBER_ID = os.getenv("LINKEDIN_MEMBER_ID")

if not TOKEN or not MEMBER_ID:
    print("ERROR: LINKEDIN_ACCESS_TOKEN or LINKEDIN_MEMBER_ID missing from .env", file=sys.stderr)
    sys.exit(1)

AUTHOR = f"urn:li:person:{MEMBER_ID}"
HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "LinkedIn-Version": "202502",
    "Content-Type": "application/json",
    "X-Restli-Protocol-Version": "2.0.0",
}


def upload_image(image_path: str) -> str:
    """Upload image to LinkedIn, return the image URN."""
    # Step 1: initialise upload
    init_resp = requests.post(
        "https://api.linkedin.com/rest/images?action=initializeUpload",
        headers=HEADERS,
        json={"initializeUploadRequest": {"owner": AUTHOR}},
    )
    init_resp.raise_for_status()
    data = init_resp.json().get("value", {})
    upload_url = data.get("uploadUrl")
    image_urn = data.get("image")

    if not upload_url or not image_urn:
        raise RuntimeError(f"Unexpected initializeUpload response: {init_resp.text[:300]}")

    # Step 2: upload the binary
    with open(image_path, "rb") as f:
        img_bytes = f.read()

    # Detect content type from extension
    ext = Path(image_path).suffix.lower()
    content_type = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "gif": "image/gif"}.get(ext.lstrip("."), "image/jpeg")

    upload_resp = requests.put(
        upload_url,
        headers={"Authorization": f"Bearer {TOKEN}", "Content-Type": content_type},
        data=img_bytes,
    )
    if upload_resp.status_code not in (200, 201):
        raise RuntimeError(f"Image upload failed: {upload_resp.status_code} — {upload_resp.text[:200]}")

    return image_urn


def post_with_image(text: str, image_urn: str, comment: str | None = None) -> str:
    """Create LinkedIn post with image, return post URN."""
    payload = {
        "author": AUTHOR,
        "commentary": text,
        "visibility": "PUBLIC",
        "distribution": {
            "feedDistribution": "MAIN_FEED",
            "targetEntities": [],
            "thirdPartyDistributionChannels": [],
        },
        "content": {
            "media": {
                "id": image_urn,
            }
        },
        "lifecycleState": "PUBLISHED",
    }
    resp = requests.post("https://api.linkedin.com/rest/posts", headers=HEADERS, json=payload)
    resp.raise_for_status()
    post_urn = resp.headers.get("x-restli-id", "")

    if comment and post_urn:
        requests.post(
            f"https://api.linkedin.com/rest/socialActions/{post_urn}/comments",
            headers=HEADERS,
            json={"actor": AUTHOR, "message": {"text": comment}, "object": post_urn},
        )

    return post_urn


def main():
    parser = argparse.ArgumentParser(description="Post to LinkedIn with an image.")
    parser.add_argument("--text", required=True, help="Path to text file with post body")
    parser.add_argument("--image", required=True, help="Path to image file (jpg/png)")
    parser.add_argument("--comment", help="First comment text (e.g. article URL)")
    parser.add_argument("--dry-run", action="store_true", help="Show what would happen, no API calls")
    args = parser.parse_args()

    text = Path(args.text).read_text(encoding="utf-8").strip()
    if len(text) > 3000:
        text = text[:2900].rsplit(" ", 1)[0] + "..."

    if args.dry_run:
        print(f"[DRY RUN] Would post {len(text)} chars + image: {args.image}")
        if args.comment:
            print(f"[DRY RUN] First comment: {args.comment}")
        return

    print(f"Uploading image: {args.image}")
    try:
        image_urn = upload_image(args.image)
    except Exception as e:
        print(f"ERROR uploading image: {e}", file=sys.stderr)
        sys.exit(1)

    print("Creating post...")
    try:
        post_urn = post_with_image(text, image_urn, comment=args.comment)
    except Exception as e:
        print(f"ERROR creating post: {e}", file=sys.stderr)
        sys.exit(1)

    post_url = f"https://www.linkedin.com/feed/update/{post_urn}" if post_urn else "(URL unavailable)"
    print(f"Posted: {post_url}")


if __name__ == "__main__":
    main()
