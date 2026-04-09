# Blog Publishing Tool

Automates publishing a markdown blog post to multiple platforms.

## Setup

```bash
cd /root/harrysharman-site/tools
cp .env.example .env
# Fill in your API keys in .env
pip install -r requirements.txt
```

## Usage

```bash
# Publish everywhere (site + LinkedIn + Substack draft)
python publish.py post.md

# Site only (git commit + push)
python publish.py post.md --site-only

# Generate header image only
python publish.py post.md --image-only

# Preview what would happen
python publish.py post.md --dry-run
```

## Markdown Format

Posts must have YAML frontmatter:

```markdown
---
title: "Your Post Title"
tags: ["ai", "strategy"]
excerpt: "One-line summary for listings."
image_prompt: "Optional custom prompt for Gemini image generation"
---

Your post content in markdown...
```

## Environment Variables

| Variable | Purpose |
|---|---|
| `GEMINI_API_KEY` | Google Gemini API key for image generation |
| `LINKEDIN_ACCESS_TOKEN` | LinkedIn OAuth2 access token |
| `LINKEDIN_MEMBER_ID` | Your LinkedIn member/person ID |
| `SUBSTACK_EMAIL` | Substack login email |
| `SUBSTACK_PASSWORD` | Substack login password |
| `SUBSTACK_URL` | Your Substack publication URL (e.g. https://you.substack.com) |

## How It Works

1. Parses the markdown file and YAML frontmatter
2. Generates a header image via Gemini API (or uses custom prompt)
3. Publishes to website: saves post, updates posts.json, git commit + push
4. Posts to LinkedIn with image and first comment
5. Creates a Substack draft (not published)

Each platform fails independently -- a LinkedIn failure will not block the site publish.
