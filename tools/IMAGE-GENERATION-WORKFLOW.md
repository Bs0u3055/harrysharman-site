# Beautiful Thinking — Hero Image Generation Workflow

## Overview
Every blog post gets a hero image. The image follows a strict brand system where only the doodle illustrations change per post — everything else stays constant.

## Brand Assets (Fixed)
- **Cutout photo**: A pre-cut PNG of Harry on transparent background (stored as `assets/images/harry-cutout.png`)
- **White sunglasses overlay**: Hand-drawn white line-art sunglasses composited onto the photo (part of the cutout asset)
- **Background colour**: Solid mustard yellow (`#E8A820`)

## What Changes Per Post
The white hand-drawn doodle illustrations that fill the background. These are thematic to the blog content and arranged in a swirling, spiraling composition around Harry's head.

---

## Step-by-Step Workflow

### Step 1: Extract Visual Concepts from the Blog

Feed the blog markdown to an LLM with this prompt:

```
You are a visual concept extractor for a blog illustration system.

Read the following blog post and extract 8-10 concrete, drawable objects or icons that represent the key themes and ideas. 

Rules:
- Each item must be a simple, recognisable object that works as a small doodle icon (e.g. "brain", "rocket", "lightbulb", "clipboard with checklist", "speech bubble", "DNA helix")
- Avoid abstract concepts that can't be drawn as a single icon
- Include a mix of literal objects from the content AND metaphorical representations of the themes
- Always include at least one arrow or flow element (e.g. "curved arrows", "connecting dotted lines", "spiral arrows")
- If the blog mentions AI, tech, or science, include relevant icons (circuit nodes, atom, binary code snippets)
- Output ONLY a comma-separated list, nothing else

Blog post:
{blog_content}
```

**Example output for a post about personality profiles:**
`brain, clipboard with checklist, emoji face, magnifying glass, puzzle pieces, spiral arrows, question mark, mirror, bar chart, connecting dotted lines`

### Step 2: Generate the Illustration Background

Use this image generation prompt, inserting the extracted icons:

```
A solid mustard yellow background (#E8A820) covered in white hand-drawn doodle illustrations. Thin white line art in a loose, playful editorial sketch style — like whiteboard doodles drawn with a thin marker. No fills, outlines only. 

The illustrations are arranged in a swirling, spiraling composition that radiates outward from a central point in the upper-middle area of the image. Small icons and symbols are connected by flowing curved lines, dotted trails, and gentle spiral paths.

Include these icons scattered throughout the composition: {extracted_icons_list}

Also include small decorative elements between the main icons: tiny dots, small stars, mini arrows, dashes, and sparkle marks.

The "AI" text should appear hand-lettered in white somewhere in the lower-left area.

Style: editorial illustration, hand-drawn doodle, whiteboard sketch, consistent thin white line weight throughout. No colour other than white on yellow. No gradients. No photographic elements. No text other than "AI".

Aspect ratio: 16:9
Resolution: 1200x675px minimum
```

### Step 3: Composite the Final Image

Using Python PIL/Pillow:

1. Open the generated illustration background
2. Open `assets/images/harry-cutout.png` (Harry with sunglasses, transparent background)
3. Resize the cutout proportionally so Harry occupies roughly the bottom 70-80% of the image height
4. Position Harry center-bottom, so head is roughly centered horizontally and the image is cropped at roughly chest/shoulder level
5. Composite the cutout onto the background using alpha channel
6. Export as both:
   - `posts/{post-slug}/hero.jpg` (for web, quality 85)
   - `posts/{post-slug}/hero-social.jpg` (1200x630 for OG/social cards)

```python
from PIL import Image

def compose_hero_image(background_path, cutout_path, output_path, social_output_path):
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
    
    # Save web version
    bg.convert("RGB").save(output_path, "JPEG", quality=85)
    
    # Save social card version (1200x630)
    social = bg.resize((1200, 630), Image.LANCZOS)
    social.convert("RGB").save(social_output_path, "JPEG", quality=85)
```

---

## Image Generation API

Use the Google Gemini image generation API (Imagen) for Step 2. The model handles the doodle/illustration style well.

If Gemini output doesn't match the style closely enough, fall back to describing the style more explicitly:
- "like a designer's whiteboard sketch"
- "similar to infographic doodle art"  
- "hand-drawn icons you'd see in a visual thinking or sketchnote style"

---

## Asset Checklist

- [ ] Create the Harry cutout PNG with sunglasses (one-time setup — use background removal on a photo, then overlay the white line-art sunglasses)
- [ ] Store at `assets/images/harry-cutout.png`
- [ ] Confirm hex code for mustard yellow matches existing posts (#E8A820 — sample from existing images to confirm exact value)

---

## Notes

- The sunglasses are part of the cutout asset, NOT generated per-image. They're a fixed brand element.
- The swirl/spiral composition should always radiate from roughly where Harry's head will be placed, so the doodles frame him naturally.
- Keep the doodle density medium — not so sparse it looks empty, not so packed you can't distinguish individual icons.
- The "AI" hand-lettered text is a recurring brand element — include it in every image.
