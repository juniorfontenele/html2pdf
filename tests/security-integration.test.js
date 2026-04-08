/**
 * Integration tests for validateNavigation and createRequestInterceptor.
 *
 * These tests require ALLOWED_HOSTS to be set BEFORE the module loads.
 * Run via: ALLOWED_HOSTS="*.myapp.com,cdn.example.net" ... node --test tests/security-integration.test.js
 *
 * The CI workflow sets these env vars in the test step.
 * The npm test script also sets them automatically.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { validateNavigation, createRequestInterceptor } from '../src/security.js';

const logger = {
  debug: () => {},
  warn: () => {},
  info: () => {},
};

// ─── validateNavigation ─────────────────────────────────

describe('validateNavigation (with ALLOWED_HOSTS configured)', () => {
  it('allows URL matching host and path allowlist', async () => {
    await validateNavigation('http://app.myapp.com/reports/42/print?signature=abc', logger);
  });

  it('allows Vite asset paths', async () => {
    await validateNavigation('http://app.myapp.com/build/assets/app-abc123.css', logger);
  });

  it('allows CDN host without path restriction', async () => {
    await validateNavigation('http://cdn.example.net/css?family=roboto:400', logger);
  });

  it('blocks host not in allowlist', async () => {
    await assert.rejects(
      () => validateNavigation('http://evil.com/reports/42/print', logger),
      (err) => {
        assert.equal(err.statusCode, 422);
        assert.match(err.message, /not in the allowlist/);
        return true;
      },
    );
  });

  it('blocks cloud metadata IP', async () => {
    await assert.rejects(
      () => validateNavigation('http://169.254.169.254/latest/meta-data/', logger),
      (err) => {
        assert.equal(err.statusCode, 422);
        return true;
      },
    );
  });

  it('blocks file:// protocol', async () => {
    await assert.rejects(
      () => validateNavigation('file:///etc/passwd', logger),
      (err) => {
        assert.equal(err.statusCode, 422);
        assert.match(err.message, /protocol/);
        return true;
      },
    );
  });

  it('blocks path not in allowed patterns', async () => {
    await assert.rejects(
      () => validateNavigation('http://app.myapp.com/admin/secret', logger),
      (err) => {
        assert.equal(err.statusCode, 422);
        assert.match(err.message, /path/);
        return true;
      },
    );
  });

  it('blocks invalid URL', async () => {
    await assert.rejects(
      () => validateNavigation('not-a-valid-url', logger),
      (err) => {
        assert.equal(err.statusCode, 422);
        assert.match(err.message, /invalid URL/);
        return true;
      },
    );
  });

  it('blocks internal service hostnames', async () => {
    await assert.rejects(
      () => validateNavigation('http://redis:6379/', logger),
      (err) => {
        assert.equal(err.statusCode, 422);
        return true;
      },
    );
  });

  it('blocks gopher protocol', async () => {
    await assert.rejects(
      () => validateNavigation('gopher://app.myapp.com/', logger),
      (err) => {
        assert.equal(err.statusCode, 422);
        return true;
      },
    );
  });
});

// ─── createRequestInterceptor ───────────────────────────

describe('createRequestInterceptor (with ALLOWED_HOSTS configured)', () => {
  /**
   * Create a mock Puppeteer HTTPRequest.
   */
  function mockRequest(url) {
    let action = null;
    return {
      url: () => url,
      continue: async () => { action = 'continue'; },
      abort: async (reason) => { action = `abort:${reason}`; },
      getAction: () => action,
    };
  }

  const interceptor = createRequestInterceptor(logger);

  it('allows data: URIs (inline content)', async () => {
    const req = mockRequest('data:image/png;base64,iVBORw0KGgo=');
    await interceptor(req);
    assert.equal(req.getAction(), 'continue');
  });

  it('allows request to permitted host and path', async () => {
    const req = mockRequest('http://app.myapp.com/build/assets/app.css');
    await interceptor(req);
    assert.equal(req.getAction(), 'continue');
  });

  it('allows request to CDN host (any path)', async () => {
    const req = mockRequest('http://cdn.example.net/css?family=roboto:400');
    await interceptor(req);
    assert.equal(req.getAction(), 'continue');
  });

  it('blocks request to disallowed host', async () => {
    const req = mockRequest('http://evil.com/steal-data');
    await interceptor(req);
    assert.equal(req.getAction(), 'abort:blockedbyclient');
  });

  it('blocks request to cloud metadata endpoint', async () => {
    const req = mockRequest('http://169.254.169.254/latest/meta-data/');
    await interceptor(req);
    assert.equal(req.getAction(), 'abort:blockedbyclient');
  });

  it('blocks request to disallowed path on allowed host', async () => {
    const req = mockRequest('http://app.myapp.com/admin/users');
    await interceptor(req);
    assert.equal(req.getAction(), 'abort:blockedbyclient');
  });

  it('blocks ftp:// protocol', async () => {
    const req = mockRequest('ftp://app.myapp.com/file');
    await interceptor(req);
    assert.equal(req.getAction(), 'abort:blockedbyclient');
  });

  it('blocks request to internal service', async () => {
    const req = mockRequest('http://redis:6379/');
    await interceptor(req);
    assert.equal(req.getAction(), 'abort:blockedbyclient');
  });
});
