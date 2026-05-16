# Optional Cloudflare Worker — API proxy for Version 5.0

This folder is optional. Version 5.0 of the site works in autonomous mode by default and does not require any API key.

Use this Worker only if you later decide to enable integrated API generation and AI scoring.

## Endpoints

- `GET /health` — health check
- `POST /api/translate` — sends a prompt to the OpenAI Responses API
- `POST /api/score` — evaluates a translation and returns JSON scores

The scoring format follows the current Version 5.0 criteria:

```json
{
  "PA": 0,
  "RCI": 0,
  "PK": 0,
  "rationale": "short explanation"
}
```

Criteria:

- `PA` — pragmatic adequacy
- `RCI` — recognition of digital interference
- `PK` — compensation techniques

The old `CS` field should not be used in the site interface.

## Deploy with Wrangler

1. Install Wrangler.
2. Open this `worker/` folder.
3. Log in:

```bash
wrangler login
```

4. Add the OpenAI API key as a secret:

```bash
wrangler secret put OPENAI_API_KEY
```

5. Deploy:

```bash
wrangler deploy
```

## Configure CORS

In `wrangler.toml`, set `ALLOWED_ORIGINS` to your GitHub Pages origin:

```toml
ALLOWED_ORIGINS = "https://<username>.github.io"
```

## Connect the website to the Worker

In the website file `assets/config.js`, replace the empty value with your Worker URL:

```js
window.LLM_API_BASE = "https://<worker-name>.<subdomain>.workers.dev";
```

If `window.LLM_API_BASE` is empty, the site remains fully autonomous and API buttons are disabled.

## Security

Never place `OPENAI_API_KEY` in GitHub, HTML, CSS, or browser JavaScript. Use Cloudflare Worker secrets only.
