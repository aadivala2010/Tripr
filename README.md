# Tripr

Tripr is a mobile-first AI travel planner built with Next.js, Tailwind CSS, Gemini 2.5 Flash-Lite, and optional MakCorps hotel pricing data.

## Run locally

1. Install dependencies:

```bash
pnpm install
```

2. Create `.env.local`:

```bash
GEMINI_API_KEY=AIzaSyCAp2kl79_KiOTljiPk0IG_tg-LkcZ7-_8
GEMINI_MODEL=gemini-2.5-flash-lite
MAKCORPS_USERNAME=your_makcorps_username
MAKCORPS_PASSWORD=your_makcorps_password
```

MakCorps credentials are optional. Without them, Tripr will still generate itineraries and will fall back to estimated hotel suggestions from Gemini.

3. Start the app:

```bash
pnpm dev
```

## Features

- Detailed itinerary generation with Gemini
- Arrival/departure-based trip length with derived days and nights
- Hotel suggestions that prefer live MakCorps market data when available
- Conversational itinerary editing through floating chat
- Local trip persistence with `localStorage`
- Expandable day cards and per-activity visited tracking
- Mobile-first premium UI ready for Vercel deployment
