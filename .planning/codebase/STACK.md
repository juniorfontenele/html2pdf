# Technology Stack

## Runtime

| Property        | Value                       |
| --------------- | --------------------------- |
| Language        | JavaScript (ES Modules)     |
| Runtime         | Node.js ≥ 22.0.0            |
| Module system   | ESM (`"type": "module"`)    |
| Package manager | npm (lockfile v3)           |
| Container       | Docker (node:22-slim base)  |

## Framework

| Component  | Package            | Version   | Purpose                         |
| ---------- | ------------------ | --------- | ------------------------------- |
| HTTP       | `fastify`          | ^5.3.3    | High-perf HTTP server           |
| Browser    | `puppeteer-core`   | ^24.9.0   | Chrome automation (PDF render)  |
| PDF merge  | `pdf-lib`          | ^1.17.1   | Multi-page PDF merging          |

### Why puppeteer-core (not puppeteer)

The project uses `puppeteer-core` to avoid bundling Chromium in `node_modules`. Instead, Google Chrome Stable is installed at the OS level inside the Docker image via apt, and referenced via the `CHROME_PATH` environment variable (`/usr/bin/google-chrome-stable`).

## Dev Dependencies

| Package      | Version   | Purpose               |
| ------------ | --------- | --------------------- |
| `eslint`     | ^10.2.0   | Linting               |
| `@eslint/js` | ^10.0.1   | ESLint recommended ruleset |

## Configuration

All configuration is loaded from environment variables in `src/config.js`:

| Variable       | Default                          | Description                     |
| -------------- | -------------------------------- | ------------------------------- |
| `PORT`         | `3000`                           | HTTP listen port                |
| `HOST`         | `0.0.0.0`                        | Bind address                    |
| `BODY_LIMIT`   | `52428800` (50 MB)               | Max request body size (bytes)   |
| `LOG_LEVEL`    | `info`                           | Pino log level                  |
| `CHROME_PATH`  | `/usr/bin/google-chrome-stable`  | Chrome executable path          |
| `CONCURRENCY`  | `3`                              | Max concurrent page renders     |
| `TIMEOUT`      | `30000`                          | Per-page render timeout (ms)    |

## Docker

### Multi-stage build (`Dockerfile`)

| Stage        | Base           | Purpose                                            |
| ------------ | -------------- | -------------------------------------------------- |
| `base`       | node:22-slim   | Chrome Stable + intl fonts + non-root user `pptruser` |
| `deps`       | base           | `npm ci --omit=dev` for production deps            |
| `production` | base           | Copy deps + src, run as `pptruser`, expose 3000    |

**Security hardening:**
- Non-root user (`pptruser`) with restricted group membership
- `--no-sandbox` flag (safe inside container with non-root user)
- Build tools (curl, gnupg2) purged after Chrome install

### Docker Compose (`docker-compose.yml`)

Single service `html2pdf` with:
- Port mapping `3000:3000`
- Environment: `PORT=3000`, `CONCURRENCY=3`, `TIMEOUT=30000`, `LOG_LEVEL=info`
- Health check using `node -e fetch(...)` (no curl dependency at runtime)

## Scripts

| Script         | Command                      | Purpose                     |
| -------------- | ---------------------------- | --------------------------- |
| `npm start`    | `node src/server.js`         | Production start            |
| `npm run dev`  | `node --watch src/server.js` | Dev with Node.js file watch |
| `npm run lint` | `eslint src/`                | Lint source files           |
