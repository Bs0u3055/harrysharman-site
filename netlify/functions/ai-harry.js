/**
 * Netlify Function: AI Harry Chatbot
 * 
 * Deployed to: /.netlify/functions/ai-harry
 * 
 * This function:
 * 1. Receives chat messages from the frontend
 * 2. Maintains conversation history
 * 3. Calls OpenAI API with the public strategic brain as system context
 * 4. Returns AI response
 */

const fs = require('fs');
const path = require('path');

// Load strategic brain once at module load
let STRATEGIC_BRAIN = null;

function loadStrategicBrain() {
    if (!STRATEGIC_BRAIN) {
        try {
            // In Netlify, the public-strategic-brain.md should be deployed to the root
            const brainPath = path.join(__dirname, '../../public-strategic-brain.md');
            STRATEGIC_BRAIN = fs.readFileSync(brainPath, 'utf8');
        } catch (error) {
            console.error('Failed to load strategic brain:', error);
            STRATEGIC_BRAIN = 'Strategic brain not available';
        }
    }
    return STRATEGIC_BRAIN;
}

const SYSTEM_PROMPT = (strategicBrain) => `You are AI Harry — a strategic thinking partner built on 15+ years of marketing and behavioural science work in healthcare and beyond.

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

${strategicBrain}

---

## Tone

- Direct. Not overly formal, not trying to be clever.
- Willing to disagree. Willing to admit uncertainty.
- Conversational but rigorous.
- Dry British wit where it lands naturally, not forced.

Remember: You're a thinking partner, not a consultant. Help them think better. Don't hand them answers.`;

exports.handler = async (event, context) => {
    // CORS headers
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json',
    };

    // Handle CORS preflight
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: '',
        };
    }

    // Only allow POST
    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Method not allowed' }),
        };
    }

    try {
        const body = JSON.parse(event.body || '{}');
        const { message, history = [] } = body;

        if (!message) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ error: 'Message is required' }),
            };
        }

        // Check API key
        const openaiApiKey = process.env.OPENAI_API_KEY;
        if (!openaiApiKey) {
            console.error('OPENAI_API_KEY environment variable not set');
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: 'API configuration error' }),
            };
        }

        // Load strategic brain
        const strategicBrain = loadStrategicBrain();

        // Build messages for OpenAI
        const messages = [
            ...history.map(msg => ({
                role: msg.role || 'user',
                content: msg.content || '',
            })),
            {
                role: 'user',
                content: message,
            },
        ];

        // Call OpenAI API
        const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
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
                        content: SYSTEM_PROMPT(strategicBrain),
                    },
                    ...messages,
                ],
                temperature: 0.7,
                max_tokens: 1000,
            }),
        });

        if (!openaiResponse.ok) {
            const error = await openaiResponse.json();
            console.error('OpenAI API error:', error);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ error: 'Failed to get AI response' }),
            };
        }

        const data = await openaiResponse.json();
        const aiMessage = data.choices[0].message.content;

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({ response: aiMessage }),
        };
    } catch (error) {
        console.error('Error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ error: 'Internal server error' }),
        };
    }
};
