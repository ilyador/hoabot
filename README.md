# HOABot

Live app: https://hoabot-production.up.railway.app  
Twitter/X: https://x.com/hoaboabot

HOABot was a failed experiment in creating a marketable SaaS product almost entirely through AI-assisted execution.

The idea was to combine three things:

- Claude-driven market research into memeable HOA pain points
- Fully automated marketing through a social content pipeline
- A vibe-coded but functional HOA management product

The product itself became a working prototype: an HOA management app with auth, payments, member invites, documents, maintenance requests, announcements, violations, AI-assisted rule citation, and accounting integrations. The marketing system also produced posts, images, reply drafts, and engagement workflows.

The experiment failed because a functional product plus automated content was not enough to create meaningful market demand. The result is useful mostly as a record of what was built, what was tried, and where the approach fell short.

## What Is In This Repo

- `server/` - Express, tRPC, Prisma, Stripe, email, Xero, and AI-related backend code
- `web/` - React app for the HOA management interface
- `landing/` - Static marketing pages
- `content/` - Social content pipeline, post queue, image templates, and marketing experiments
- `docs/` - Planning and implementation notes
- `tests/` - Vitest coverage for auth, subscriptions, invites, and rule citation behavior

## Tech Stack

- TypeScript
- Express 5
- tRPC
- React
- Prisma
- PostgreSQL
- Stripe
- Resend
- OpenAI API
- Xero
- Twitter/X API

## Status

This is not an active product. It is published as an experiment and code archive, not as a maintained SaaS starter kit.
