# Testing

## Overview

| Property             | Value                                         |
| -------------------- | --------------------------------------------- |
| Test framework       | **None** — no unit test framework installed    |
| Test runner          | Shell scripts in CI workflow                   |
| Test type            | Integration / smoke tests only                 |
| Test location        | `.github/workflows/ci.yml` (inline)            |
| Coverage tool        | None                                           |
| Pre-commit hooks     | None                                           |

## Current Test Strategy

All tests run inside the CI pipeline (`.github/workflows/ci.yml`) as shell commands against a running Docker container. There are no local test scripts or `npm test` command.

### Integration Test Cases

| #  | Test                     | Method                                          | Assertion                     |
| -- | ------------------------ | ----------------------------------------------- | ----------------------------- |
| 1  | Health check             | `GET /health`                                   | `status === "ok"`             |
| 2  | Single-page PDF          | `POST /render` with simple HTML                 | MIME type = `application/pdf` |
| 3  | Link rendering           | `POST /render` with `<a>` tag                   | MIME type = `application/pdf` |
| 4  | Multi-page merge         | `POST /render` with 2 pages                     | MIME type = `application/pdf` |
| 5  | Validation (empty pages) | `POST /render` with `{ "pages": [] }`           | HTTP 400                      |

### Test Execution Flow

```
1. docker build -t html2pdf:test .
2. docker run -d --name html2pdf -p 3000:3000 html2pdf:test
3. Wait up to 60s for /health to respond
4. Run 5 curl-based integration tests
5. docker rm -f html2pdf
```

## Lint Check

| Job    | Command        | Trigger   |
| ------ | -------------- | --------- |
| `lint` | `npm run lint` | PR to master |

ESLint runs as a separate CI job (not gated on Docker build).

## What's Missing

- **Unit test framework:** No test runner (e.g. Vitest, Jest, Node test runner)
- **`npm test` script:** Not defined in package.json
- **Local test support:** Cannot run tests without Docker
- **PDF content validation:** Tests only check MIME type, not rendered content
- **Edge case coverage:** No tests for concurrency limits (503), large payloads, timeout handling, Chrome crash recovery, malformed HTML, or header/footer templates
- **Coverage reporting:** No code coverage tool
- **Mocking:** No mock infrastructure (Chrome is real in CI)
