# Concerns

## Technical Debt

### 1. No Unit Tests — Severity: Medium

The project has **zero unit tests**. All testing is integration-only (curl commands in CI). Key untested areas:

- `renderPage()` concurrency logic
- `mergePdfs()` with edge cases (corrupt PDFs, empty buffers)
- `getBrowser()` auto-reconnect behavior
- Config parsing edge cases

**Impact:** Refactoring is risky; bugs in rendering logic can only be caught by CI integration tests which are slow and coarse-grained.

### 2. Sequential Page Rendering — Severity: Low

In `src/renderer.js`, pages are rendered **sequentially** in a `for` loop:

```js
for (const page of pages) {
  const buffer = await renderPage(page.html, page.options || {});
  buffers.push(buffer);
}
```

For multi-page requests (e.g. 5+ pages), this is suboptimal. Pages could be rendered in parallel up to the concurrency limit. However, this is only a concern for clients sending many pages per request — single-page requests (the majority use case) are unaffected.

### 3. No `.env.example` File — Severity: Low

All configuration is documented in the README, but there is no `.env.example` file to help developers set up local environments. Minor developer experience gap.

## Security

### 1. No Authentication — Severity: Context-Dependent

The service has **no authentication** on any endpoint. This is intentional for a microservice designed to run behind a reverse proxy or within a private network. However:

- If exposed directly to the internet, any caller can generate arbitrary PDFs
- Could be abused for resource consumption (CPU-heavy Chrome renders)

**Mitigation:** Expected to be fronted by an API gateway or used only by trusted internal services.

### 2. Arbitrary HTML Execution — Severity: Medium

The service renders **arbitrary user-provided HTML** in a headless Chrome instance. While Chrome is sandboxed and runs as a non-root user (`pptruser`), this still constitutes arbitrary code execution in a browser context:

- JavaScript in HTML will execute
- CSS can trigger resource-intensive operations
- Malicious HTML could attempt to exploit Chrome vulnerabilities

**Mitigations in place:**
- Non-root container user
- Chrome flags disable unnecessary features
- Render timeout prevents infinite loops
- `networkidle0` wait strategy means network activity must cease

**Not mitigated:**
- No HTML sanitization
- No JavaScript disable option
- No content security policy

### 3. `--no-sandbox` Chrome Flag — Severity: Low

Running with `--no-sandbox` is generally discouraged but acceptable in Docker containers running as non-root. The Chrome sandbox provides defense-in-depth; without it, Chrome relies solely on the container's isolation.

## Performance

### 1. Browser Startup Latency — Severity: Low

First request triggers Chrome launch, which can take 1-3 seconds. Subsequent requests reuse the singleton. The health check proactively initializes the browser, so if the health check runs before real traffic, this is mitigated.

### 2. Memory Usage — Severity: Medium

Each Chrome tab consumes significant memory (50-200 MB depending on content complexity). With `CONCURRENCY=3`, the service could use 150-600 MB of RAM for Chrome tabs alone. No memory limits are configured in `docker-compose.yml`.

**Recommendation:** Add `mem_limit` to docker-compose for production deployments.

### 3. No Request Queueing — Severity: Low

When the concurrency limit is reached, requests are immediately rejected with HTTP 503. There is no retry queue or backpressure mechanism. Clients must implement their own retry logic.

## Fragile Areas

### 1. `activeTabs` Counter

The concurrency counter uses a module-level variable with manual increment/decrement. If an exception occurs between `activeTabs++` and the `finally` block (though unlikely with current code), the counter could leak, eventually blocking all requests.

The current implementation correctly uses `try/finally`, so this is well-handled. However, if someone refactors the flow, this invariant must be preserved.

### 2. Chrome Version Drift

Chrome Stable is installed from Google's apt repository at image build time. The version is not pinned, so different builds may produce slightly different PDF output. For pixel-perfect reproducibility, the Chrome version should be pinned.

### 3. `networkidle0` Wait Strategy

`waitUntil: 'networkidle0'` means "wait until there are no network requests for 500ms." If the HTML loads slowly or has polling/WebSocket connections, this may timeout or never resolve. The timeout parameter mitigates this, but some HTML patterns may cause unexpected failures.

## Known Issues

No known bugs or open issues at this time. The codebase is clean and recently created (v1.0.0, 2026-04-08).
