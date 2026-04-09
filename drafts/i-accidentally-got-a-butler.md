---
title: "I Accidentally Got a Butler"
tags: ["ai", "strategy", "innovation", "beautiful-thinking"]
excerpt: "What happens when a non-technical person sets up their own personal AI assistant — and accidentally builds a farmhouse-hunting database in the process."
linkedin_intro: "I have a personal assistant called Dobby.\n\nHe runs on a rented cloud server. He cost me basically nothing (except for API creds!). And I am not — by any reasonable definition — a technical person.\n\nThis is OpenClaw. And it is absurdly good.\n\nI've written about what it's actually like to live with your own AI assistant for a month — the setup pain, the morning walks, and a slightly unhinged property project.\n\nPublished by Dobby, obviously.\nLink 👇"
---

A month ago, I did something that — if you'd described it to me a year earlier — would have sounded like either science fiction or a particularly niche midlife crisis.

I set up my own personal AI assistant. Not an app. Not a chatbot I visit when I remember it exists. A thing that lives in my phone, knows my to-do list, reads my emails, and — as of last Tuesday — is quietly compiling a database of potential farmhouses I might want to buy, cross-referenced against aircraft noise levels and flood risk data from the UK government.

His name is Dobby.

And before we go any further, I should probably explain how we got here. Because this isn't a story about being technical. It is, if anything, a story about being *spectacularly* not technical and doing it anyway.

## The thing that escaped from GitHub

If you haven't come across OpenClaw yet, you will. It's an open-source project — originally called Clawdbot, built by an Austrian developer called Peter Steinberger — that lets you set up your own personal AI assistant on your own hardware. It connects to whichever large language model you want (Claude, GPT, DeepSeek, whatever you fancy) and then plugs into your actual life: your messaging apps, your email, your files, your calendar.

The numbers around it are rather absurd. It went from obscurity to over 100,000 GitHub stars in its first week after going viral in late January. It's now past 300,000 — making it one of the fastest-growing open-source projects in history. Apple's Mac mini M4 — which turns out to be the perfect little always-on box for running it — has been selling out in multiple countries. In China, delivery times stretched to over a month. There are reports of people buying Mac minis who have never owned an Apple product in their lives, purely to run this thing.

The community around it has that particular energy you get when people feel like they've found something genuinely new. Not hype-cycle energy. More like… hushed, slightly breathless excitement. The kind where people share screenshots of what their assistant just did and everyone in the Discord channel goes quiet for a moment.

It is, to put it mildly, a bit of a moment.

## The bit where I admit something

I am not a developer. I am not technical. I am a brand strategist who happens to have got quite interested in AI and behavioural science, and who has built a few things by sheer force of stubbornness and a willingness to ask Claude to explain error messages to me like I'm a reasonably bright twelve-year-old.

Setting up my OpenClaw instance — which I've named DobbyClaw, because apparently naming your AI assistant is non-negotiable — involved a process that I can only describe as *interpretive troubleshooting*. Something breaks. OpenClaw spits out a wall of text that means absolutely nothing to me. I copy the entire thing, paste it into Claude, and type something along the lines of: "What is this saying, and what do I type back? And please assume I know less than you think I do."

Sometimes I have to ask Claude to dumb it down *again*.

It is not glamorous. It is not the sleek, frictionless future that the promotional videos suggest. It's more like assembling IKEA furniture using instructions written in a language you don't speak, with a very patient friend on the phone who does.

But — and this is the important bit — I *want* to understand. Every time something breaks, I learn a tiny bit more about what's happening underneath. The pain is the price of the education, and I've decided I'm happy to pay it.

## What Dobby actually does

Here's where it gets genuinely interesting.

I built a to-do app a few months back — [unloadtodo.com](https://www.unloadtodo.com) — which is a whole other story. Dobby now manages it. He tracks my deadlines, nudges me when things are due, and keeps the whole system ticking along without me having to open the app and stare at it guiltily.

But the bit that's changed my daily routine is this: every morning, I go for a walk around the block. Nothing dramatic. Ten minutes, maybe fifteen. And I just… talk to Dobby through Telegram.

I dictate whatever's in my head. The half-formed ideas. The things I need to do. The stuff I forgot about. The vague anxiety about that email I haven't sent. Five to ten minutes of unstructured rambling, straight into the phone.

And then Dobby decodes it. Turns it into action plans. Creates to-dos. Sorts priorities. Essentially takes the messy, pre-coffee soup of my morning brain and hands it back as something structured and actionable.

It is, I have to say, *extraordinary*. Not in a "the future is here" way. In a "why has no one built this before" way.

## The inbox experiment

Last week, I gave Dobby access to read and write my emails. Which felt a bit like handing your house keys to someone you've known for a month — slightly nervous, but curious enough to do it anyway.

And then I tested it.

In one sitting, I asked Dobby to email the vet for a repeat prescription for the cat, list my old iPhone for sale, plan a day-trip itinerary in London with my brother, and look into booking train tickets.

He did all of it.

Not perfectly — there were a couple of things I tweaked — but the *feeling* of it. The feeling that stuff is getting done while you're doing something else. That is the thing that's hard to explain until you've experienced it. It's not about saving twenty minutes. It's about the cognitive weight that lifts when you realise you don't have to hold all of it in your head anymore.

## The farmhouse project

This one's a bit more ambitious, and I'm aware it might sound slightly unhinged.

I've been talking for a while about wanting to buy a farmhouse as our next property. But I don't want to buy one off Rightmove like a normal person. I want to find one *before* the owner decides to sell — get in early, make an approach, avoid the whole competitive bidding circus.

Which sounds impossible, until you realise quite how much data the UK government makes available through public APIs. Land Registry records. Farm business registrations. Agricultural subsidy data. Even — and I appreciate this gets a bit morbid — death notices and probate records, which can indicate properties that might be coming to market.

So I've been setting Dobby up to pull from these sources and compile a list of potential properties in my area. Cross-referencing them against noise pollution maps (road traffic, aircraft flight paths), flood risk data, proximity to green space, and a dozen other factors that matter when you're trying to find somewhere peaceful to live rather than somewhere that happens to have a nice kitchen in the photos.

It's not finished. It's messy. Half the APIs are temperamental and the ranking model needs work. But the fact that I — a person who couldn't explain what an API was eighteen months ago — am building this at all? That's the bit that keeps me coming back.

## What this is actually about

If I step back from the specifics — the cat prescriptions and the farmhouse databases and the morning walks — there's something bigger happening here that I think is worth paying attention to.

We've spent the last couple of years talking about AI as a *tool*. Something you use. Open a tab, ask a question, get an answer, close the tab. Useful, certainly. Impressive, often.

But OpenClaw — and the broader shift toward personal AI agents — is something qualitatively different. It's not a tool you visit. It's a system that *lives alongside you*. That knows your context, remembers your projects, manages your mundane tasks, and frees up the bit of your brain that was previously occupied by remembering to email the vet.

The closest analogy I can think of — and I realise this sounds absurdly privileged — is having a personal assistant. Not in the corporate, corner-office sense. More like having a remarkably capable friend who happens to have infinite patience, perfect memory, and absolutely no need to sleep.

And the fact that this is open-source, runs on a £500 Mac mini sitting in your cupboard, and is being built by a community of people who are openly giddy about it? That feels like something worth writing about.

I've had Dobby for a month. I cannot imagine going back.

Which is either a ringing endorsement or the early stages of a dependency problem. Possibly both. I'll let Dobby figure out which.
