# Code Conventions

## Language & Module Style

- **ES Modules** throughout (`import`/`export`, `"type": "module"` in package.json)
- **ECMAScript 2024** target (ESLint `ecmaVersion: 2024`)
- No TypeScript, no transpilation — runs directly on Node.js 22+
- `.js` file extensions always included in imports

## Code Style

### Naming

| Element         | Convention           | Example                          |
| --------------- | -------------------- | -------------------------------- |
| Files           | `camelCase.js`       | `renderer.js`, `schemas.js`     |
| Functions       | `camelCase`          | `renderPage`, `getBrowser`       |
| Constants       | `UPPER_SNAKE_CASE`   | `DEFAULT_OPTIONS`                |
| Config keys     | `camelCase`          | `config.bodyLimit`               |
| Env variables   | `UPPER_SNAKE_CASE`   | `CHROME_PATH`, `LOG_LEVEL`       |

### Formatting

- No Prettier configured — relies on ESLint only
- Single quotes for strings (ESLint recommended defaults)
- 2-space indentation (implicit from ESLint)
- Trailing commas in multiline objects/arrays

### JSDoc

Functions in `src/renderer.js` have JSDoc comments with `@param` and `@returns` annotations:

```js
/**
 * Render a single HTML string to a PDF buffer.
 *
 * @param {string} html
 * @param {object} options - Puppeteer page.pdf() options
 * @param {number} timeout - Timeout in ms
 * @returns {Promise<Buffer>}
 */
async function renderPage(html, options = {}, timeout = config.renderer.timeout) { ... }
```

## Patterns

### Configuration Pattern

Single `config.js` file exports a frozen object built from `process.env` with sane defaults:

```js
const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  // ...
};
export default config;
```

All env var parsing is centralized — other modules just `import config`.

### Singleton Pattern (Browser)

`src/renderer.js` maintains a module-level `browser` variable. `getBrowser()` lazily initializes and auto-reconnects:

```js
let browser = null;

async function getBrowser() {
  if (browser && browser.connected) return browser;
  browser = await puppeteer.launch({ ... });
  browser.on('disconnected', () => { browser = null; });
  return browser;
}
```

### Error Handling

- **Validation errors:** JSON Schema → Fastify's built-in 400 responses
- **Concurrency limit:** `Object.assign(new Error(...), { statusCode: 503 })` — attaches status code to error
- **Render errors:** Caught by Fastify's error handler → logged + JSON error response
- **Cleanup:** `try/finally` in `renderPage()` ensures tab close + counter decrement

```js
app.setErrorHandler((error, request, reply) => {
  const statusCode = error.statusCode || 500;
  request.log.error({ err: error }, 'Request error');
  return reply.status(statusCode).send({ error: error.message, statusCode });
});
```

### Graceful Shutdown

Signal handlers for `SIGINT` and `SIGTERM`:
1. Close browser (`shutdown()`)
2. Close Fastify server (`app.close()`)
3. Exit process

## ESLint Configuration (`eslint.config.js`)

- Flat config format (ESLint 10)
- Extends `@eslint/js` recommended
- Custom globals: `console`, `process`, `Buffer`, `URL`, `fetch`
- Single custom rule: `no-unused-vars` with `argsIgnorePattern: '^_'`

## Import Conventions

All imports are explicit with file extensions:

```js
import config from './config.js';
import { render, healthCheck, shutdown } from './renderer.js';
import { renderSchema } from './schemas.js';
```

Third-party imports use bare specifiers:

```js
import Fastify from 'fastify';
import puppeteer from 'puppeteer-core';
import { PDFDocument } from 'pdf-lib';
```
