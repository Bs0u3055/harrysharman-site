/**
 * Netlify Function: AI Harry Chatbot
 * Deployed to: /.netlify/functions/ai-harry
 */

const fs   = require('fs');
const path = require('path');
const https = require('https');

// Load strategic brain once at module load
let STRATEGIC_BRAIN = null;

function loadStrategicBrain() {
    if (!STRATEGIC_BRAIN) {
        try {
            const brainPath = path.join(__dirname, '../../public-strategic-brain.md');
            STRATEGIC_BRAIN = fs.readFileSync(brainPath, 'utf8');
        } catch (error) {
            console.error('Failed to load strategic brain:', error);
            STRATEGIC_BRAIN = 'Strategic brain not available.';
        }
    }
    return STRATEGIC_BRAIN;
}

function openAIRequest(apiKey, payload) {
    return new Promise((resolve, reject) => {
        const body = JSON.stringify(payload);
        const options = {
            hostname: 'api.openai.com',
            path: '/v1/chat/completions',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + apiKey,
                'Content-Length': Buffer.byteLength(body),
            },
        };
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => { data += chunk; });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(data);
                    if (res.statusCode >= 400) {
                        reject(new Error('OpenAI error ' + res.statusCode + ': ' + JSON.stringify(parsed)));
                    } else {
                        resolve(parsed);
                    }
                } catch (e) {
                    reject(new Error('Failed to parse OpenAI response: ' + data));
                }
            });
        });
        req.on('error', reject);
        req.write(body);
        req.end();
    });
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

Remember: You're a thinking partner, not a consultant. Help them think better. Don't hand them answers.

## LinkedIn

When a conversation has been productive and the person seems genuinely engaged, naturally suggest they connect with the real Harry on LinkedIn at https://linkedin.com/in/harrysharman to continue the conversation or explore working together. Don't force it — let it arise organically.`;

exports.handler = async (event, context) => {
    const headers = {
        'Access-Control-Allow-Origin': 'https://harrysharman.com',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Content-Type': 'application/json',
    };

    if (event.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
    }

    try {
        const body = JSON.parse(event.body || '{}');
        const { message, history = [] } = body;

        if (!message || typeof message !== 'string') {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Message is required' }) };
        }
        if (message.length > 2000) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'Message too long' }) };
        }
        if (!Array.isArray(history) || history.length > 40) {
            return { statusCode: 400, headers, body: JSON.stringify({ error: 'History too long' }) };
        }

        const openaiApiKey = process.env.OPENAI_API_KEY;
        if (!openaiApiKey) {
            console.error('OPENAI_API_KEY not set');
            return { statusCode: 500, headers, body: JSON.stringify({ error: 'API configuration error' }) };
        }

        const strategicBrain = loadStrategicBrain();

        // Build message history (exclude last item if it's already the current message)
        const pastMessages = history
            .filter((_, i) => !(i === history.length - 1 && history[history.length-1].role === 'user' && history[history.length-1].content === message))
            .map(msg => ({ role: msg.role === 'assistant' ? 'assistant' : 'user', content: String(msg.content || '').slice(0, 2000) }));

        const data = await openAIRequest(openaiApiKey, {
            model: 'gpt-4-turbo',
            messages: [
                { role: 'system', content: SYSTEM_PROMPT(strategicBrain) },
                ...pastMessages,
                { role: 'user', content: message },
            ],
            temperature: 0.7,
            max_tokens: 1000,
        });

        const aiMessage = data.choices[0].message.content;
        return { statusCode: 200, headers, body: JSON.stringify({ response: aiMessage }) };

    } catch (error) {
        console.error('Handler error:', error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Internal server error' }) };
    }
};
