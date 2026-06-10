# AI Habit Feedback Workflow

## What is captured

Each lesson email includes two feedback links:

- Thumbs up
- Thumbs down

The links open `/projects/ai-habit/feedback/` with the lesson day, track, subscriber id, and rating prefilled. The rating is not stored until the user submits the form, which avoids false votes from email security scanners.

The form stores:

- lesson day
- rating
- track: starter, paid, or unknown
- optional comment
- optional reply email
- subscriber id when present
- timestamp
- basic user agent/referrer context

## Where it is stored

Feedback records are stored in the existing Netlify blob store:

- individual records: `ai-habit:feedback:<id>`
- index: `index:ai-habit-feedback`
- aggregate summary: `ai-habit:feedback-summary`

The protected report endpoint is:

`/.netlify/functions/ai-habit-feedback-report`

Set `AI_HABIT_FEEDBACK_ADMIN_TOKEN` in Netlify, then call the endpoint with either:

- `?token=<token>`
- `Authorization: Bearer <token>`

## Amendment rule

Review feedback weekly while the cohort is small.

Prioritise amendments when any of these happen:

- A lesson gets three or more thumbs down.
- Two or more comments identify the same issue.
- A paid-track lesson gets a thumbs down with a clear comment.
- A lesson is repeatedly described as too vague, too long, too easy, too hard, or not transferable to real work.

When amending a lesson:

1. Preserve the lesson number and broad theme unless the whole lesson is wrong.
2. Edit the relevant `data/ai-habit-sequence/day_XX.json`.
3. Add a short `review_notes` entry explaining what changed.
4. Run the sequence validation and site traffic tests.
5. Deploy.

## What not to do

- Do not chase every single thumbs down.
- Do not turn lessons into over-explained essays.
- Do not expose individual feedback publicly.
- Do not treat feedback as statistically meaningful until there are enough responses.
