# html2pdf

[![CI](https://github.com/juniorfontenele/html2pdf/actions/workflows/ci.yml/badge.svg)](https://github.com/juniorfontenele/html2pdf/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/docker-ready-blue)](https://hub.docker.com/r/jftecnologia/html2pdf)

Stateless HTTP microservice that converts HTML to PDF using Google Chrome Stable and Puppeteer.

## Features

- HTML or URL in, PDF out — no external dependencies
- Multi-page support with automatic PDF merging (via pdf-lib)
- Per-page options (margins, header/footer, format, scale)
- Per-page `skipPages` for discarding placeholder pages during merge
- Tagged PDFs with link annotations preserved through merge
- **SSRF protection** — host allowlist, path allowlist, protocol enforcement, dangerous IP blocking, and Puppeteer request interception
- Structured JSON logging with UUID request ID correlation
- Configurable concurrency and timeouts
- Schema validation on all requests (Fastify + Ajv)
- Health check endpoint with browser status
- Graceful shutdown and auto-reconnect on browser crash
- Docker-ready with Chrome Stable pre-installed (non-root user)
- Lightweight and fast (Fastify + puppeteer-core)

## Quick Start

### Docker Compose (build from source)

```bash
docker compose up -d
```

### Docker Hub

```bash
docker pull jftecnologia/html2pdf
docker run -p 3000:3000 jftecnologia/html2pdf
```

### Test

```bash
curl -X POST http://localhost:3000/render \
  -H "Content-Type: application/json" \
  -d '{"pages": [{"html": "<h1>Hello, World!</h1>"}]}' \
  -o output.pdf
```

## API

### `POST /render`

Renders one or more HTML pages to a single PDF.

**Request body:**

Each page requires either `html` (raw HTML string) or `url` (navigated by Chrome).

```json
{
  "pages": [
    {
      "html": "<html><body><h1>Page 1</h1></body></html>",
      "options": {
        "format": "A4",
        "printBackground": true,
        "displayHeaderFooter": false,
        "headerTemplate": "",
        "footerTemplate": "",
        "preferCSSPageSize": false,
        "scale": 1,
        "tagged": true,
        "pageRanges": "1-3",
        "waitUntil": "networkidle0",
        "delay": 2000,
        "margin": {
          "top": "25mm",
          "right": "15mm",
          "bottom": "18mm",
          "left": "15mm"
        }
      }
    }
  ]
}
```

**Page fields:**

| Field | Type | Description |
|---|---|---|
| `html` | string | Raw HTML content (mutually exclusive with `url`) |
| `url` | string | URL to navigate to (mutually exclusive with `html`) |
| `skipPages` | int[] | 1-based page indices to discard before merging |
| `options` | object | Puppeteer PDF options (all optional) |

**Options:**

| Option | Default | Description |
|---|---|---|
| `format` | `A4` | Paper format (A4, Letter, etc.) |
| `printBackground` | `true` | Print background graphics |
| `displayHeaderFooter` | `false` | Display header and footer |
| `headerTemplate` | `<div></div>` | HTML template for the header |
| `footerTemplate` | `<div></div>` | HTML template for the footer |
| `preferCSSPageSize` | `false` | Give priority to CSS `@page` size over `format` |
| `scale` | `1` | Scale of the webpage rendering (0.1 – 2) |
| `tagged` | `true` | Generate tagged (accessible) PDF with link annotations |
| `pageRanges` | all pages | Page ranges to print, e.g. `"1-3"`, `"1,3,5"` |
| `waitUntil` | `networkidle0` | Navigation wait condition (`networkidle0`, `networkidle2`, `load`, `domcontentloaded`) |
| `delay` | `0` | Additional delay in ms after navigation (0 – 30000) |
| `margin` | `0mm` all sides | Page margins (`top`, `right`, `bottom`, `left`) |

**Response:** `application/pdf` binary

**Error response:**

```json
{
  "error": "Error message",
  "statusCode": 500
}
```

| Status | Cause |
|---|---|
| `400` | Invalid request body (schema validation) |
| `422` | SSRF protection blocked the URL |
| `503` | Concurrency limit reached |
| `500` | Render failure or internal error |

### `GET /health`

Returns service health status.

```json
{
  "status": "ok",
  "browser": "connected",
  "version": "HeadlessChrome/...",
  "activeTabs": 0,
  "maxConcurrency": 3,
  "uptime": 3600
}
```

## Configuration

Environment variables:

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `HOST` | `0.0.0.0` | Bind address |
| `BODY_LIMIT` | `52428800` | Max request body size in bytes (default 50 MB) |
| `CHROME_PATH` | `/usr/bin/google-chrome-stable` | Chrome executable path |
| `CONCURRENCY` | `3` | Max concurrent page renders |
| `TIMEOUT` | `30000` | Per-page render timeout (ms) |
| `LOG_LEVEL` | `info` | Log level (`trace`, `debug`, `info`, `warn`, `error`, `fatal`) |

### SSRF Protection

| Variable | Default | Description |
|---|---|---|
| `ALLOWED_HOSTS` | *(empty)* | Comma-separated list of allowed hosts. Supports wildcards (`*.example.com`). **Empty = no restriction** (backward-compatible). |
| `CDN_HOSTS` | *(empty)* | Comma-separated CDN hosts that skip path validation (any path allowed). Must also be in `ALLOWED_HOSTS`. |
| `ALLOWED_PATH_PATTERNS` | *(empty)* | Comma-separated glob patterns for allowed paths on non-CDN hosts (e.g. `/reports/*/print,/build/*`). **Empty = no path restriction**. |
| `SSRF_PROTECTION` | *(enabled)* | Set to `disabled` to bypass all SSRF checks (emergency kill switch). |

When `ALLOWED_HOSTS` is configured, the service enforces:

1. **Protocol validation** — only `https:` in production (`http:` also allowed when `NODE_ENV=development`)
2. **Host allowlist** — navigation and all sub-resource requests (images, CSS, fonts, iframes) are checked against the allowlist
3. **Dangerous IP blocking** — DNS resolution is performed and IPs in `127.0.0.0/8`, `169.254.0.0/16`, `0.0.0.0`, and `::1` are rejected (prevents SSRF to cloud metadata endpoints and loopback services)
4. **Path allowlist** — non-CDN hosts are restricted to specific path patterns (prevents access to unintended routes on allowed hosts)
5. **Request interception** — Puppeteer intercepts every sub-resource request during page rendering and enforces the same allowlist (covers `<img>`, `<iframe>`, `<link>`, `<script>`, CSS `@import`, `@font-face`, etc.)

Blocked navigation URLs return HTTP `422`. Blocked sub-resource requests are silently aborted (logged at `warn` level) without failing the overall render.

**Example configuration:**

```bash
docker run -p 3000:3000 \
  -e ALLOWED_HOSTS="*.example.com,cdn.example.net" \
  -e CDN_HOSTS="cdn.example.net" \
  -e ALLOWED_PATH_PATTERNS="/reports/*/print,/dashboard/*/print,/build/*" \
  jftecnologia/html2pdf
```

## Multi-page PDFs

Send multiple pages to generate a merged PDF:

```json
{
  "pages": [
    {
      "html": "<html>Cover page</html>",
      "options": { "margin": { "top": "0mm", "right": "0mm", "bottom": "0mm", "left": "0mm" } }
    },
    {
      "html": "<html>Body content</html>",
      "options": {
        "displayHeaderFooter": true,
        "headerTemplate": "<div style='font-size:8pt;text-align:center;width:100%'>Report</div>",
        "footerTemplate": "<div style='font-size:8pt;text-align:center;width:100%'><span class='pageNumber'></span> / <span class='totalPages'></span></div>",
        "margin": { "top": "25mm", "bottom": "18mm" }
      }
    }
  ]
}
```

## URL Rendering

Navigate to a URL instead of providing raw HTML. Useful when the page is a full web app (React, Vue, etc.) that needs JavaScript execution:

```json
{
  "pages": [
    {
      "url": "http://localhost:8000/reports/1/print?section=cover",
      "options": { "delay": 2000 }
    }
  ]
}
```

## Skip Pages

Discard specific pages (1-based) from a rendered document before merging. Useful for two-pass rendering where a body PDF has a blank placeholder page 1 for correct page numbering:

```json
{
  "pages": [
    {
      "url": "http://localhost:8000/reports/1/print?section=cover",
      "options": { "margin": { "top": "0mm", "right": "0mm", "bottom": "0mm", "left": "0mm" } }
    },
    {
      "url": "http://localhost:8000/reports/1/print?section=body",
      "skipPages": [1],
      "options": {
        "displayHeaderFooter": true,
        "headerTemplate": "<div>...</div>",
        "footerTemplate": "<div>...</div>",
        "margin": { "top": "25mm", "bottom": "18mm" }
      }
    }
  ]
}
```

The cover renders as page 1, and the body's blank placeholder is discarded. Chrome's `pageNumber` counter still counts correctly because each document is rendered independently.

## Logging

All requests are logged as structured JSON with a UUID `reqId` for end-to-end correlation:

```json
{"level":30,"time":1712600000000,"reqId":"a1b2c3d4-...","msg":"Starting render","pageCount":2,"sources":["url","url"]}
{"level":30,"time":1712600001000,"reqId":"a1b2c3d4-...","msg":"Page rendered","page":1,"durationMs":1200,"sizeBytes":45000}
```

SSRF violations are logged at `warn` level with the blocked URL, reason, and request ID:

```json
{"level":40,"time":1712600002000,"reqId":"a1b2c3d4-...","msg":"SSRF: blocked host","url":"http://evil.com/steal","hostname":"evil.com"}
```

Set `LOG_LEVEL=debug` for verbose output including navigation details and delay timing.

## Development

```bash
npm install
npm run dev     # Start with --watch (auto-restart on changes)
npm run lint    # ESLint
npm test        # Unit + integration tests (node:test)
```

## Project Structure

```
src/
├── server.js    # Fastify app, routes, error handler, lifecycle
├── config.js    # Environment variable parsing (incl. security settings)
├── schemas.js   # JSON Schema for request validation
├── renderer.js  # Puppeteer browser management, PDF rendering, merging
└── security.js  # SSRF protection: host/path/IP validation, request interception
tests/
├── security.test.js              # Unit tests for pure validation functions
└── security-integration.test.js  # Integration tests with configured allowlists
```

## License

MIT
