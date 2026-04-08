# html2pdf

[![CI](https://github.com/juniorfontenele/html2pdf/actions/workflows/ci.yml/badge.svg)](https://github.com/juniorfontenele/html2pdf/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/docker-ready-blue)](https://hub.docker.com/r/jftecnologia/html2pdf)

Stateless HTTP microservice that converts HTML to PDF using Google Chrome Stable and Puppeteer.

## Features

- HTML in, PDF out — no external dependencies
- Multi-page support with automatic PDF merging
- Per-page options (margins, header/footer, format)
- Configurable concurrency and timeouts
- Health check endpoint
- Docker-ready with Chrome Stable pre-installed
- Lightweight and fast (Fastify + puppeteer-core)

## Quick Start

```bash
docker compose up -d
```

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

All `options` fields are optional. Defaults:

| Option | Default |
|---|---|
| `format` | `A4` |
| `printBackground` | `true` |
| `displayHeaderFooter` | `false` |
| `headerTemplate` | `<div></div>` |
| `footerTemplate` | `<div></div>` |
| `preferCSSPageSize` | `false` |
| `scale` | `1` |
| `margin` | `0mm` all sides |

**Response:** `application/pdf` binary

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
| `BODY_LIMIT` | `52428800` | Max request body size (bytes) |
| `CHROME_PATH` | `/usr/bin/google-chrome-stable` | Chrome executable path |
| `CONCURRENCY` | `3` | Max concurrent page renders |
| `TIMEOUT` | `30000` | Per-page render timeout (ms) |
| `LOG_LEVEL` | `info` | Log level (trace/debug/info/warn/error/fatal) |

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

## Images

For self-contained PDFs, embed images as base64 data URIs:

```html
<img src="data:image/png;base64,iVBOR..." />
```

This ensures images render correctly without external network access.

## License

MIT
