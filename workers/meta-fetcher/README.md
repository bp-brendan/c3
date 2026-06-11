# Visualist Meta Fetcher

Small Cloudflare Worker for the add-event form URL field.

It accepts:

```txt
GET /api/meta?url=https://example.org/event
POST /api/meta { "url": "https://example.org/event" }
```

It returns a compact metadata object from Open Graph, Twitter Card, regular
description tags, and JSON-LD event data when present.

```bash
npm install
npm run dev
npm run deploy
```

On Cloudflare Pages, the form uses same-origin `/api/meta`. During plain local
static development it points at `http://127.0.0.1:8787/api/meta`, which matches
`wrangler dev`. If the Worker is deployed separately, set
`window.VISUALIST_META_ENDPOINT` before the form script runs:

```html
<script>
  window.VISUALIST_META_ENDPOINT = 'https://visualist-meta-fetcher.YOUR_SUBDOMAIN.workers.dev/api/meta';
</script>
```
