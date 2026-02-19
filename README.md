# Leaside Fades Website

Conversion-focused marketing site for Leaside Fades with secure Google Reviews integration.

## Stack

- Frontend: Semantic HTML + CSS + vanilla JS (mobile-first)
- Backend: Node.js + Express
- Reviews data: Google Places Details API via backend-only route

## Features Implemented

- `GET /api/google-reviews` backend endpoint
- `GET /api/site-config` endpoint for env-driven public links and CTAs
- Backend-only Google API calls (no browser API key exposure)
- 12-hour cache (`data/google-reviews-cache.json`)
- Normalized review payload
- Graceful fallback order:
  - Fresh cache
  - Stale cache
  - Local fallback (`data/reviews-fallback.json`)
- Frontend reviews component with max 6 reviews
- Lazy review loading (IntersectionObserver)
- Mobile-first layout and performance-oriented media loading

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env` from `.env.example`:

```bash
cp .env.example .env
```

3. Add environment values:

- `GOOGLE_PLACES_API_KEY`
- `GOOGLE_PLACE_ID`
- `SITE_GOOGLE_MAPS_URL`
- `SITE_INSTAGRAM_URL`
- `SITE_FACEBOOK_URL`
- `SITE_BOOKING_URL` (optional until Fresha is live)
- `SITE_PHONE_E164`

4. Start locally:

```bash
npm run dev
```

Open `http://localhost:3000`.

## API Response Shape

`GET /api/google-reviews`

```json
{
  "source": "google_places_api",
  "fetchedAt": 1739900000000,
  "stale": false,
  "businessName": "Leaside Fades",
  "overallRating": 4.9,
  "totalReviews": 123,
  "googleMapsUrl": "https://maps.google.com/...",
  "reviews": [
    {
      "authorName": "Client Name",
      "authorUrl": "https://...",
      "profilePhotoUrl": "https://...",
      "rating": 5,
      "text": "Great fade...",
      "relativeTimeDescription": "a month ago",
      "publishTime": 1739500000
    }
  ]
}
```
