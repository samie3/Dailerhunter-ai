# DealHunter AI

Find the cheapest deals for any product or subscription across grey-market, reseller, and official sources.

## Setup

```bash
cp .env.example .env
# Add your Brave Search API key to .env
npm install
npm start
```

Open http://localhost:3000

## Requirements

- Node.js 18+
- Brave Search API key (free tier: https://brave.com/search/api/)

## How it works

1. Enter a product name (e.g. "Spotify Premium")
2. Backend searches 16+ query variations via Brave Search API
3. Results are parsed for prices, classified by type, and streamed back via SSE
4. Table shows results sorted by price (cheapest first)

## Sources searched

Grey-market (Plati, GGSEL, G2A, Eneba, Kinguin), subscription sharing (GamsGo, GoSplit), lifetime deals (AppSumo, StackSocial), and general web results.
