# Serverless proxy (Cloudflare Worker) for OpenAI API

This folder contains a minimal Cloudflare Worker that proxies:
- POST /api/translate  -> calls OpenAI Responses API
- POST /api/score      -> calls OpenAI Responses API, returns JSON scores when possible
- GET  /health

## Deploy (Wrangler CLI)
1) Install Wrangler: https://developers.cloudflare.com/workers/wrangler/
2) In this folder:
   - wrangler login
   - wrangler secret put OPENAI_API_KEY
   - wrangler deploy

## Configure CORS
Set ALLOWED_ORIGINS in wrangler.toml to your GitHub Pages origin:
https://<username>.github.io

## Update site config
In the website, set:
assets/config.js -> window.LLM_API_BASE = "https://<worker-name>.<subdomain>.workers.dev";
