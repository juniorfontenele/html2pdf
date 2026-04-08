# External Integrations

## Browser Engine — Google Chrome Stable

| Property        | Value                                  |
| --------------- | -------------------------------------- |
| Type            | Headless browser (PDF rendering)       |
| Executable      | `/usr/bin/google-chrome-stable`        |
| Installation    | apt (Google's official Debian repo)    |
| Communication   | Puppeteer DevTools Protocol (CDP)      |
| Lifecycle       | Singleton, auto-reconnect on crash     |
| Concurrency     | Controlled via `CONCURRENCY` env var   |

### Chrome Launch Args (`src/config.js`)

```js
[
  '--disable-dev-shm-usage',     // Use /tmp instead of /dev/shm
  '--disable-gpu',               // No GPU in container
  '--no-sandbox',                // Safe with non-root user
  '--disable-setuid-sandbox',
  '--disable-extensions',
  '--disable-background-networking',
  '--disable-default-apps',
  '--disable-sync',
  '--disable-translate',
  '--metrics-recording-only',
  '--mute-audio',
  '--no-first-run',
  '--safebrowsing-disable-auto-update',
]
```

## Docker Hub — Image Registry

| Property    | Value                                    |
| ----------- | ---------------------------------------- |
| Image       | `jftecnologia/html2pdf`                 |
| Tags        | `latest`, semver `x.y.z`, `x.y`, `x`   |
| Trigger     | Push to `master` (via release-please)    |
| Build cache | GitHub Actions cache (`type=gha`)        |
| Auth        | `DOCKERHUB_USERNAME` + `DOCKERHUB_TOKEN` secrets |

## GitHub Actions — CI/CD

### CI Pipeline (`.github/workflows/ci.yml`)

Triggered on **pull requests to master**.

| Job    | Steps                                                                 |
| ------ | --------------------------------------------------------------------- |
| `lint` | Checkout → setup-node@v4 (Node 22) → `npm ci` → `npm run lint`       |
| `test` | Build Docker image → start container → integration tests → cleanup    |

**Integration tests** (shell-based, not a test framework):
1. Health endpoint returns `status: "ok"`
2. Single-page PDF generation (validates MIME type)
3. Link rendering in PDF
4. Multi-page merge
5. Validation error (empty pages array → HTTP 400)

### Publish Pipeline (`.github/workflows/publish.yml`)

Triggered on **push to master**.

| Job              | Steps                                                  |
| ---------------- | ------------------------------------------------------ |
| `release-please` | googleapis/release-please-action@v4 (node type)       |
| `publish`        | Docker meta → buildx → login → build + push to Hub    |

**Release strategy:** [release-please](https://github.com/googleapis/release-please) manages versioning via conventional commits. On release creation, Docker image is built and pushed with semver tags.

## Databases

**None.** This is a stateless microservice — no database, no persistent storage, no cache layer.

## Authentication

**None.** The service exposes unauthenticated HTTP endpoints. Authentication is expected to be handled by the calling service or a reverse proxy.

## External API Calls

**None.** The service does not make outbound HTTP/API calls. All content (HTML, images) must be provided inline in the request body (images as base64 data URIs).
