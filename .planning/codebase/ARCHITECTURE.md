# Architecture

## Pattern

**Stateless HTTP Microservice** — single-purpose service that accepts HTML input via HTTP POST and returns rendered PDF output. No state is persisted between requests; the only long-lived resource is a shared headless Chrome browser instance.

## System Overview

```
┌─────────────────────────────────────────────────┐
│  Client (e.g. Laravel Browsershot)              │
│  POST /render  { pages: [ { html, options } ] } │
└───────────────────────┬─────────────────────────┘
                        │ HTTP
                        ▼
┌───────────────────────────────────────────────────┐
│  Fastify Server  (src/server.js)                  │
│  ├─ JSON schema validation (src/schemas.js)       │
│  ├─ Error handler                                 │
│  └─ Graceful shutdown (SIGINT/SIGTERM)            │
└───────────────────────┬───────────────────────────┘
                        │ function call
                        ▼
┌───────────────────────────────────────────────────┐
│  Renderer  (src/renderer.js)                      │
│  ├─ getBrowser()     → singleton Chrome instance   │
│  ├─ renderPage()     → HTML → PDF buffer           │
│  ├─ mergePdfs()      → combine N buffers → 1 PDF   │
│  ├─ render()         → orchestrate full request     │
│  ├─ healthCheck()    → browser status               │
│  └─ shutdown()       → close Chrome                 │
└───────────────────────┬───────────────────────────┘
                        │ CDP (DevTools Protocol)
                        ▼
┌───────────────────────────────────────────────────┐
│  Google Chrome Stable (headless)                   │
│  Shared singleton, max N concurrent tabs           │
└───────────────────────────────────────────────────┘
```

## Layers

| Layer          | File               | Responsibility                               |
| -------------- | ------------------ | -------------------------------------------- |
| HTTP           | `src/server.js`    | Routing, schema validation, error handling   |
| Validation     | `src/schemas.js`   | JSON Schema for request body                 |
| Configuration  | `src/config.js`    | Environment variable parsing + defaults      |
| Rendering      | `src/renderer.js`  | Chrome lifecycle, PDF generation, merging    |

There is no middleware layer, no database layer, and no authentication layer.

## Data Flow

### Render Request Flow

1. **Client** sends `POST /render` with `{ pages: [{ html, options }] }`
2. **Fastify** validates request body against JSON Schema (`renderSchema`)
3. **server.js** extracts `pages` array and calls `render(pages, logger)`
4. **renderer.js → render()** iterates pages sequentially:
   - Calls `renderPage(html, options)` for each page
   - Checks concurrency limit (`activeTabs >= concurrency` → HTTP 503)
   - Opens a new Chrome tab via `page = instance.newPage()`
   - Sets HTML content with `page.setContent(html, { waitUntil: 'networkidle0' })`
   - Generates PDF with `page.pdf(options)` using Puppeteer
   - Closes the tab, decrements `activeTabs`
5. If multiple pages, **mergePdfs()** uses `pdf-lib` to combine buffers
6. Returns PDF buffer → Fastify sends `application/pdf` response

### Browser Lifecycle

- **Lazy initialization:** Chrome launches on first request via `getBrowser()`
- **Singleton:** One browser instance shared across all requests
- **Auto-reconnect:** If browser disconnects/crashes, `getBrowser()` re-launches
- **Graceful shutdown:** `SIGINT`/`SIGTERM` → `shutdown()` → `browser.close()`

## Key Abstractions

### Concurrency Semaphore

The `activeTabs` counter in `src/renderer.js` acts as a lightweight semaphore:

```js
if (activeTabs >= config.renderer.concurrency) {
  throw Object.assign(new Error('Too many concurrent renders'), { statusCode: 503 });
}
activeTabs++;
// ... render ...
activeTabs--; // in finally block
```

This prevents Chrome from being overwhelmed. Clients receive HTTP 503 when at capacity.

### Default Options Merging

PDF options use spread to merge provided options over defaults:

```js
const pdfOptions = { ...DEFAULT_OPTIONS, ...options };
```

Default options include: A4 format, no header/footer, zero margins, no background printing, scale 1.

## Entry Points

| Entry Point         | File             | Description                    |
| ------------------- | ---------------- | ------------------------------ |
| Application start   | `src/server.js`  | `node src/server.js`           |
| Docker entrypoint   | `Dockerfile`     | `CMD ["node", "src/server.js"]` |

## API Endpoints

| Method | Path      | Purpose                         | Response          |
| ------ | --------- | ------------------------------- | ----------------- |
| POST   | `/render` | Convert HTML pages to PDF       | `application/pdf` |
| GET    | `/health` | Service health + browser status | JSON              |
