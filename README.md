# Tripr

Tripr is a mobile-first AI travel planner built with Next.js, Tailwind CSS, Gemini 2.5 Flash-Lite, and optional SerpApi Google Hotels pricing data.

## Run locally

1. Install dependencies:

```bash
pnpm install
```

2. Create `.env.local`:

```bash
GEMINI_API_KEY=AIzaSyCAp2kl79_KiOTljiPk0IG_tg-LkcZ7-_8
GEMINI_MODEL=gemini-2.5-flash-lite
SERPAPI_API_KEY=your_serpapi_key
```

`SERPAPI_API_KEY` is optional. Without it, Tripr still generates itineraries and falls back to Gemini-generated hotel suggestions.

3. Start the app:

```bash
pnpm dev
```

## Features

- Detailed itinerary generation with Gemini
- Arrival/departure-based trip length with derived days and nights
- Hotel suggestions that prefer live SerpApi Google Hotels pricing when available
- Conversational itinerary editing through floating chat
- Local trip persistence with `localStorage`
- Expandable day cards and per-activity visited tracking
- Mobile-first premium UI ready for Vercel deployment
