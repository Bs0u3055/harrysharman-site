# AI Harry Chatbot Setup

The AI Harry chatbot is live on your site. Here's what was built and how it works.

---

## What's New

### 1. **Public Strategic Brain** (`public-strategic-brain.md`)
A curated, safe-for-public version of your strategic brain. No client work, no sensitive personal context — just the thinking, frameworks, and mental models.

Contains:
- Strategic philosophy
- How you approach problems
- Key behavioural science frameworks (COM-B, Dual Process, Virility Model)
- Micro-concepts (Micro-Laziness, F*** Future You, Strategic Dissonance, Signalling, Hawthorne Effect)
- Frameworks you use (Insight Formula, Impact/Feasibility Matrix, etc.)
- What you notice that others miss
- Your failure modes (honest section)
- AI & the future thinking
- Personal angle (dyslexia, working style)

### 2. **Chatbot Widget** (`html/ai-harry-chatbot.html`)
Beautiful, responsive chat interface:
- Dark header with your photo/avatar placeholder (currently 🧠 emoji)
- Clean message threading
- Loading states
- Mobile responsive
- Works as standalone HTML or embedded in iframe

### 3. **Backend API** (`netlify/functions/ai-harry.js`)
Netlify Function that:
- Receives chat messages from the frontend
- Maintains conversation history
- Calls OpenAI API with the public strategic brain as system context
- Returns AI responses
- Deployed at `/.netlify/functions/ai-harry`

### 4. **Loader Script** (`js/init-ai-harry.js`)
Single script tag that auto-embeds the chatbot on any page:
- Injects toggle button (💬 emoji)
- Handles open/close states
- Responsive on mobile
- No dependencies

### 5. **Homepage Integration** (`index.html`)
Added single line to load the chatbot:
```html
<script src="js/init-ai-harry.js"></script>
```

---

## How It Works

1. **User opens chatbot** → Clicks 💬 button (bottom right)
2. **User types question** → About your brand strategy, frameworks, etc.
3. **Frontend sends message** → To `/.netlify/functions/ai-harry`
4. **Backend receives request** → Loads public strategic brain
5. **Creates system prompt** → "You are AI Harry, built on this strategic brain..."
6. **Calls OpenAI API** → gpt-4-turbo model
7. **Returns response** → AI answers as "you"
8. **Frontend displays** → In chat interface

---

## Deployment Checklist

### ✅ Already Done
- [x] Created public strategic brain (filtered from full version)
- [x] Built chatbot HTML/CSS/JS interface
- [x] Created Netlify Function for backend
- [x] Added loader script to homepage
- [x] Updated netlify.toml

### 🔧 You Need to Do

1. **Set environment variable in Netlify**
   - Go to Site Settings → Environment
   - Add `OPENAI_API_KEY` = your existing OpenAI API key
   - Redeploy site
   
2. **Test the chatbot**
   - Go to harrysharman.com
   - Click 💬 button
   - Ask something like: "What's the difference between an insight and a finding?"
   - Confirm it works

3. **Optional: Customize**
   - **Avatar image** — Replace 🧠 emoji with your actual photo in `html/ai-harry-chatbot.html` (line ~187)
   - **Welcome message** — Edit the welcome text in the chatbot (lines ~189-191)
   - **Colour scheme** — Change `#1a1a2e` and `#16213e` in the CSS to match your brand
   - **Position** — By default bottom-right. Can move to bottom-left by tweaking CSS

4. **Optional: Model choice**
   - Currently using `gpt-4-turbo` (fast, ~$0.01-0.03 per conversation)
   - Can downgrade to `gpt-4o-mini` if cost is a concern (~$0.0005 per conversation)
   - Update both `netlify/functions/ai-harry.js` line 98 and `api/ai-harry.js` line 68

---

## Content Guidelines

### What AI Harry Should Say
- Answer about strategy, frameworks, behaviour science
- Ask clarifying questions to diagnose real problems
- Challenge conventional wisdom when it's leading them wrong
- Tell stories, not bullet points
- Be specific, not generic
- Willing to say "I don't know" or "you need primary research"

### What NOT to Include
- Client work or case studies (no names, no details)
- Personal/sensitive information
- Medical advice (you're a strategist, not a doctor)
- Unpublished frameworks or IP not in the public strategic brain
- Anything from the full strategic brain that isn't in the public version

---

## Monitoring & Logs

To check what people are asking:
1. Netlify site settings → Functions
2. Check `ai-harry` function logs
3. See conversations, response times, any errors

To disable if needed:
- Delete the `<script src="js/init-ai-harry.js"></script>` line from `index.html`
- Commit and deploy

---

## Future Improvements

These are optional but would be nice:

1. **Capture conversations for training** — Optional: save conversations to a database to improve future responses
2. **Conversation history persistence** — Let users save/resume chats (needs user auth)
3. **Mobile app native widget** — Embed on your newsletter landing pages
4. **Analytics** — Track popular questions, engagement, conversion (e.g. "% of people who ask about X also download the guide")
5. **Multiple AI Versions** — "AI Harry" for strategy + separate AI for different domain
6. **Custom knowledge base** — Add your latest blog posts or updates to the system prompt dynamically

---

## Security Notes

- **API key is hidden** — Never exposed to frontend, only used server-side by Netlify Function
- **CORS enabled** — Can be embedded on other domains if you want
- **Rate limiting** — Consider adding rate limits to Netlify Function to prevent abuse (Netlify does have free tier limits)
- **Conversation data** — Currently not logged. If you want to log conversations for training/analysis, add a database connection

---

## Questions?

The chatbot is live now, but the real test is: does it feel like Harry?

If responses feel off-brand, adjust the system prompt in `netlify/functions/ai-harry.js` (around line 14-50). The system prompt is where the personality lives.

Good luck. Let me know if anything breaks. 🧠
