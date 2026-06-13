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

## AI coach interest signal

The sequence also asks whether users would be interested in a future AI coach layer:

- Day 14: at the end of the free starter sequence
- Day 45
- Day 60
- Day 75
- Day 90

The prompt is deliberately clear that the coach is not built yet. It describes the possible offer as: send prompts, workflows, or AI-assisted outputs, then get feedback on what to improve, change, or think about differently.

Users can answer:

- yes
- maybe
- no

They can also indicate a rough willingness to pay:

- GBP 0
- GBP 5/month
- GBP 10/month
- GBP 19/month
- GBP 49+/month
- employer pays

Once a subscriber answers, their subscriber record is marked with:

- `ai_coach_interest_answered`
- `ai_coach_interest_response`
- `ai_coach_interest_price`
- `ai_coach_interest_at`

That flag stops future AI coach prompts for that subscriber.

Coach interest records are stored in the existing Netlify blob store:

- individual records: `ai-habit:coach-interest:<id>`
- index: `index:ai-habit-coach-interest`
- aggregate summary: `ai-habit:coach-interest-summary`

The protected coach report endpoint is:

`/.netlify/functions/ai-habit-coach-interest-report`

Set `AI_HABIT_COACH_ADMIN_TOKEN` in Netlify, or reuse `AI_HABIT_FEEDBACK_ADMIN_TOKEN`, then call the endpoint with either:

- `?token=<token>`
- `Authorization: Bearer <token>`

## AI coach build rule

Do not build the AI coach just because it sounds useful.

Prototype it only when one of these is true:

- At least five people answer yes or maybe and choose a non-zero willingness-to-pay band.
- At least 20 people answer, 35% or more answer yes/maybe, and at least three positive comments explain a real workflow pain.

The first prototype should be manual and narrow:

1. Ask for one prompt, workflow, or AI-assisted output.
2. Return a short critique with three changes and one rewritten example.
3. Measure whether the person says they would pay again.
4. Only automate once the manual version has repeated demand.

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
