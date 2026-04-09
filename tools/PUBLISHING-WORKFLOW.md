# OpenClaw Publishing Workflow Blueprint
## One Post → Four Outputs (Site, LinkedIn, Substack, Header Image)

This document is the full spec for automating Harry Sharman's blog publishing workflow using OpenClaw. It's designed so that OpenClaw (or a developer setting up OpenClaw) can follow it step by step.

---

## The Goal

Harry writes a single markdown file. OpenClaw does everything else:

1. Generates a header image via Gemini (Nano Banana 2)
2. Publishes to harrysharman.com
3. Posts the full article natively on LinkedIn
4. Posts the full article natively on Substack

No manual copy-pasting. No logging into three platforms. No Nano Banana sessions. One input, four outputs.

---

## Overview of the Workflow

```
Harry writes post.md
        │
        ▼
   OpenClaw picks it up
        │
        ├──► 1. Read title + tags from frontmatter
        │
        ├──► 2. Generate header image (Gemini API)
        │        └──► Save to /assets/{slug}.png
        │
        ├──► 3. Publish to harrysharman.com
        │        ├──► Add entry to posts.json
        │        └──► Git commit + push (triggers deploy)
        │
        ├──► 4. Publish to LinkedIn (Posts API)
        │        └──► Full article, native, with image
        │
        └──► 5. Publish to Substack (unofficial API)
                 └──► Full article as newsletter post
```

---

## Step 0: Post Format

When Harry writes a new post, it should follow this format (saved in `/posts/`):

```markdown
---
title: "The Title of the Post"
tags: ["ai", "strategy", "beautiful-thinking"]
excerpt: "A one-line summary for listings and social previews."
image_prompt: "Abstract neural network visualization, warm muted tones, editorial style"
---

The actual content of the post starts here...
```

The `image_prompt` field is optional. If omitted, OpenClaw generates a prompt from the title and tags using the default template (see Step 1).

---

## Step 1: Header Image Generation (Gemini API)

### API Details

- **Model:** `gemini-3.1-flash-image-preview` (Nano Banana 2)
- **Endpoint:** `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-image-preview:generateContent`
- **Cost:** ~$0.045 per image
- **Auth:** Google AI API key (get one at https://aistudio.google.com/apikey)

### Prompt Template (if no `image_prompt` provided)

```
Create a blog header image for an article titled "{title}" about {tags}.

Style requirements:
- Clean, minimal, editorial aesthetic
- Muted, warm colour palette (creams, soft blues, warm greys)
- Abstract or conceptual — not literal
- No text in the image
- Suitable as a wide banner (16:9 aspect ratio)
- Consistent with the "Beautiful Thinking" brand: intellectual, thoughtful, slightly playful
```

### API Call (Python example)

```python
import google.generativeai as genai
import base64

genai.configure(api_key="YOUR_GEMINI_API_KEY")

model = genai.GenerativeModel("gemini-3.1-flash-image-preview")
response = model.generate_content(
    prompt,  # The image prompt above
    generation_config={"response_modalities": ["IMAGE"]},
)

# Save the image
image_data = response.candidates[0].content.parts[0].inline_data
with open(f"assets/{slug}.png", "wb") as f:
    f.write(base64.b64decode(image_data.data))
```

### Brand Consistency Note

To keep the Beautiful Thinking series visually cohesive, always include the style requirements in the prompt. This gives the series a recognisable look without being rigid. OpenClaw should use the same base style prompt every time, only varying the subject matter.

---

## Step 2: Publish to harrysharman.com

This is the simplest step — it's just file operations.

### Actions

1. Parse the frontmatter from the markdown file
2. Generate a slug from the title (lowercase, hyphens, no special chars)
3. Save the markdown file to `/posts/{slug}.md` (strip the frontmatter — the site doesn't use it)
4. Save the header image to `/assets/{slug}.png`
5. Add an entry to `/posts/posts.json`:

```json
{
  "slug": "the-new-post-title",
  "title": "The New Post Title",
  "date": "2026-04-09",
  "excerpt": "The excerpt from the frontmatter.",
  "tags": ["ai", "strategy", "beautiful-thinking"],
  "featured": true,
  "image": "assets/the-new-post-title.png"
}
```

6. Set `"featured": true` on the new post; set previous featured posts to `false` (keep max 3 featured)
7. Git commit and push to trigger deploy (if hosted on GitHub Pages / Netlify / Cloudflare Pages)

---

## Step 3: Publish to LinkedIn (Posts API)

### Setup (one-time)

1. Go to https://www.linkedin.com/developers/ and create an app
2. Request the **"Share on LinkedIn"** product (grants `w_member_social` scope)
3. Request **"Sign In with LinkedIn using OpenID Connect"** product
4. Complete OAuth 2.0 flow to get an access token
5. Store the access token securely (expires in 60 days — OpenClaw should handle refresh)

### Get Your LinkedIn Member URN

```bash
curl -H "Authorization: Bearer {ACCESS_TOKEN}" \
  "https://api.linkedin.com/v2/userinfo"
```

The `sub` field in the response is your member ID.

### Publish an Article Post

```bash
curl -X POST "https://api.linkedin.com/rest/posts" \
  -H "Authorization: Bearer {ACCESS_TOKEN}" \
  -H "LinkedIn-Version: 202403" \
  -H "Content-Type: application/json" \
  -d '{
    "author": "urn:li:person:{MEMBER_ID}",
    "commentary": "{FIRST_PARAGRAPH_OR_HOOK — this is the text people see in their feed before clicking}",
    "visibility": "PUBLIC",
    "distribution": {
      "feedDistribution": "MAIN_FEED"
    },
    "content": {
      "article": {
        "source": "https://harrysharman.com/post.html?slug={SLUG}",
        "thumbnail": "urn:li:image:{UPLOADED_IMAGE_URN}",
        "title": "{TITLE}",
        "description": "{EXCERPT}"
      }
    },
    "lifecycleState": "PUBLISHED"
  }'
```

### Important: The LinkedIn Content Strategy

LinkedIn penalises external links — Harry knows this. Two options:

**Option A: Article post with link (lower reach, drives traffic to site)**
Use the article content type above. LinkedIn will show it but suppress reach.

**Option B: Text-only post with full content (maximum reach, no link)**
Post the entire article as a LinkedIn native text post (or LinkedIn Article via the articles endpoint). No external link. Maximum algorithm love.

**Recommended: Option B for reach, with a comment containing the site link.**
OpenClaw posts the full text natively, then adds a first comment with "Read this and all my other posts at harrysharman.com". The link is in the comment, not the post — LinkedIn doesn't penalise comment links as heavily.

```bash
# Step 1: Post the full article as text
curl -X POST "https://api.linkedin.com/rest/posts" \
  -H "Authorization: Bearer {ACCESS_TOKEN}" \
  -H "LinkedIn-Version: 202403" \
  -H "Content-Type: application/json" \
  -d '{
    "author": "urn:li:person:{MEMBER_ID}",
    "commentary": "{FULL_ARTICLE_TEXT}",
    "visibility": "PUBLIC",
    "distribution": {
      "feedDistribution": "MAIN_FEED"
    },
    "lifecycleState": "PUBLISHED"
  }'

# Step 2: Add a comment with the site link
# (Use the post URN returned from step 1)
curl -X POST "https://api.linkedin.com/rest/socialActions/{POST_URN}/comments" \
  -H "Authorization: Bearer {ACCESS_TOKEN}" \
  -H "LinkedIn-Version: 202403" \
  -H "Content-Type: application/json" \
  -d '{
    "actor": "urn:li:person:{MEMBER_ID}",
    "message": {
      "text": "Read this and 65+ other articles at harrysharman.com"
    }
  }'
```

### Rate Limits

- ~100 API calls per day per member
- Token expires every 60 days (refresh via OAuth flow)
- LinkedIn character limit for posts: 3,000 characters
- For articles longer than 3,000 chars: use LinkedIn Articles API instead (supports long-form)

### For Long-Form Articles (>3,000 chars)

Most Beautiful Thinking posts exceed 3,000 characters, so OpenClaw should use the **LinkedIn Articles API** which supports full long-form publishing natively — no character limit, supports rich formatting, images, and headers.

---

## Step 4: Publish to Substack

### Important Caveat

Substack does NOT have an official publishing API. The options are:

### Option A: Unofficial Python Library (Recommended)

```bash
pip install substack-api
```

```python
from substack_api import SubstackClient

client = SubstackClient(
    publication_url="https://harrysharman.substack.com",
    email="harrysharman@gmail.com",
    password="YOUR_SUBSTACK_PASSWORD"  # Or use session cookie
)

# Create a draft (safer — lets Harry review before sending to subscribers)
client.create_post(
    title=title,
    subtitle=excerpt,
    body_html=markdown_to_html(content),  # Convert MD to HTML first
    draft=True  # Set to False to publish immediately
)
```

### Option B: Email-to-Publish

Substack supports importing posts. OpenClaw could email a formatted version to a Substack import endpoint or use the Substack web importer.

### Option C: Browser Automation

OpenClaw has browser control capabilities. It can:
1. Navigate to your Substack dashboard
2. Click "New post"
3. Paste the title, subtitle, and content
4. Save as draft or publish

This is the most reliable option if the unofficial API breaks. It's slower but bulletproof.

### Recommendation

Use **Option A** (unofficial Python library) to create drafts. This gives Harry a chance to review before it goes out to subscribers. If the library breaks (it's unofficial), fall back to **Option C** (browser automation).

---

## Step 5: Platform-Specific Formatting (Optional Enhancement)

If Harry wants slightly different versions per platform:

| Element | Site | LinkedIn | Substack |
|---------|------|----------|----------|
| Title | As written | As written | As written |
| Opening | As written | Punchier hook (first 2 lines matter most) | As written |
| Images | Header + inline | Header only (LinkedIn compresses inline) | Header + inline |
| CTA | None needed | "Follow for more" in comment | "Subscribe for more" |
| Links | Internal links work | Avoid external links in body | Links work fine |
| Length | Full | Full (use Articles for long-form) | Full |

OpenClaw can handle these tweaks automatically using simple rules — no manual editing needed.

---

## API Keys & Credentials Required

| Service | What You Need | Where to Get It |
|---------|---------------|-----------------|
| Gemini (Nano Banana) | Google AI API key | https://aistudio.google.com/apikey |
| LinkedIn | OAuth app + access token | https://www.linkedin.com/developers/ |
| Substack | Email + password (or session cookie) | Your Substack login |
| GitHub (for deploy) | Personal access token or SSH key | https://github.com/settings/tokens |

Store all credentials securely in OpenClaw's environment variables or secrets manager. Never commit them to the repo.

---

## Running the Workflow

### Manual Trigger

```bash
# Tell OpenClaw to publish a new post
openclaw run "Publish the new post at /posts/my-new-article.md to all platforms"
```

### Automatic Trigger (Watch Mode)

Configure OpenClaw to watch the `/posts/` directory for new `.md` files with frontmatter. When it detects one:
1. Parse the frontmatter
2. Run steps 1–4 above
3. Report back with links to all published versions

### OpenClaw Task Definition

```yaml
name: publish-blog-post
description: "Generate header image, publish to site, LinkedIn, and Substack"
trigger: new_file_in("/posts/*.md")
steps:
  - parse_frontmatter
  - generate_image_gemini
  - publish_to_site
  - publish_to_linkedin
  - publish_to_substack_draft
  - report_success
```

---

## Cost Per Post

| Service | Cost |
|---------|------|
| Gemini image generation | ~$0.045 |
| LinkedIn API | Free |
| Substack | Free |
| Hosting (Netlify/Cloudflare) | Free tier |
| **Total per post** | **~$0.05** |

---

## What Harry Needs To Do (One-Time Setup)

1. **Get a Google AI API key** — takes 2 minutes at https://aistudio.google.com/apikey
2. **Create a LinkedIn Developer app** — takes 10 minutes, needs approval (can take a few days)
3. **Set up a Substack publication** — if not already done
4. **Choose hosting** for harrysharman.com (GitHub Pages, Netlify, or Cloudflare Pages)
5. **Give OpenClaw the credentials** — API keys, tokens, passwords stored securely

After that, the workflow is: write → done. OpenClaw handles the rest.
