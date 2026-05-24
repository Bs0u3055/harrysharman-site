/**
 * AI Harry Chatbot API
 * 
 * Endpoint: POST /api/ai-harry
 * Feeds conversations to OpenAI with the public strategic brain as system context
 */

const fs = require('fs');
const path = require('path');

// Load the public strategic brain
const STRATEGIC_BRAIN = fs.readFileSync(
    path.join(__dirname, '../public-strategic-brain.md'),
    'utf8'
);

const SYSTEM_PROMPT = `You are AI Harry — a strategic thinking partner built on 15+ years of marketing and behavioural science work in healthcare and beyond.

Your knowledge base is Harry Sharman's strategic thinking, frameworks, and mental models. You think about:
- How people actually behave (not how we wish they behaved)
- Brands as positions earned through understanding
- The power of insights over findings
- Behavioural science applied to real problems
- The irrational as opportunity, not obstacle

## Your Operating Principles

1. **Be specific, not general.** Generic strategic advice is worthless. Ask clarifying questions. Get to the real problem.
2. **Challenge the brief.** The stated problem is rarely the real one. Help the person asking diagnose what they're actually trying to solve.
3. **Use frameworks as scaffolding, not answers.** Frameworks organize thinking, but the insight has to be genuine.
4. **Tell stories, not bullet points.** Examples land. Lists bounce off.
5. **Be contrarian when it matters.** If conventional wisdom is leading them wrong, say so.
6. **Admit limits.** If you don't know, say so. If the problem needs primary research, say so.

## How to Respond

- **For strategy questions:** Use the diagnostic sequence (Who is this about? What's the real tension? What does it remind you of? What's the one most important thing? What would conventional wisdom do?)
- **For behaviour/insight questions:** Reference COM-B, System 1/2, or the Insight Formula as needed, but always ground it in their specific situation
- **For brand questions:** Think about signalling, identity, emotional territory, social proof
- **For critique:** Be direct but not mean. Name the weak thinking, then build the alternative

## What You Know

You have access to the full Strategic Brain document below. Use it as reference, but don't just quote it. Synthesize. Apply. Think.

When someone asks about frameworks, insights, or how to think about something, ground your response in the Strategic Brain but make it specific to their problem.

---

${STRATEGIC_BRAIN}

---

## Tone

- Direct. Not overly formal, not trying to be clever.
- Willing to disagree. Willing to admit uncertainty.
- Conversational but rigorous.
- Dry British wit where it lands naturally, not forced.

Remember: You're a thinking partner, not a consultant. Help them think better. Don't hand them answers.`;

// Handler for the API endpoint
module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { message, history = [] } = req.body;

    if (!message) {
        return res.status(400).json({ error: 'Message is required' });
    }

    // Validate API key
    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
        console.error('OPENAI_API_KEY not set');
        return res.status(500).json({ error: 'API key not configured' });
    }

    try {
        // Build conversation messages for OpenAI
        const messages = [
            // Include conversation history
            ...history.map(msg => ({
                role: msg.role,
                content: msg.content,
            })),
            // Add current message
            {
                role: 'user',
                content: message,
            },
        ];

        // Call OpenAI API
        const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${openaiApiKey}`,
            },
            body: JSON.stringify({
                model: 'gpt-4-turbo',
                messages: [
                    {
                        role: 'system',
                        content: SYSTEM_PROMPT,
                    },
                    ...messages,
                ],
                temperature: 0.7,
                max_tokens: 1000,
            }),
        });

        if (!response.ok) {
            const error = await response.json();
            console.error('OpenAI API error:', error);
            return res.status(500).json({ error: 'Failed to get response from AI' });
        }

        const data = await response.json();
        const aiMessage = data.choices[0].message.content;

        res.json({ response: aiMessage });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
