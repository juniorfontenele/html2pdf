import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { isDangerousIp, isAllowedHost } from '../src/security.js';

// ─── isDangerousIp ──────────────────────────────────────

describe('isDangerousIp', () => {
  it('blocks loopback 127.0.0.1', () => {
    assert.equal(isDangerousIp('127.0.0.1'), true);
  });

  it('blocks full loopback range 127.x.x.x', () => {
    assert.equal(isDangerousIp('127.0.0.53'), true);
    assert.equal(isDangerousIp('127.255.255.255'), true);
  });

  it('blocks link-local 169.254.x.x (cloud metadata)', () => {
    assert.equal(isDangerousIp('169.254.169.254'), true);
    assert.equal(isDangerousIp('169.254.0.1'), true);
  });

  it('blocks 0.0.0.0', () => {
    assert.equal(isDangerousIp('0.0.0.0'), true);
  });

  it('blocks IPv6 loopback ::1', () => {
    assert.equal(isDangerousIp('::1'), true);
  });

  it('allows public IPs', () => {
    assert.equal(isDangerousIp('8.8.8.8'), false);
    assert.equal(isDangerousIp('1.1.1.1'), false);
    assert.equal(isDangerousIp('93.184.216.34'), false);
  });

  it('allows private Docker-range IPs (controlled by host allowlist)', () => {
    assert.equal(isDangerousIp('10.0.0.1'), false);
    assert.equal(isDangerousIp('172.18.0.2'), false);
    assert.equal(isDangerousIp('192.168.1.1'), false);
  });
});

// ─── isAllowedHost ──────────────────────────────────────

describe('isAllowedHost', () => {
  it('allows any host when allowlist is empty', () => {
    assert.equal(isAllowedHost('evil.com', []), true);
  });

  it('matches exact hostname', () => {
    assert.equal(isAllowedHost('cdn.example.net', ['cdn.example.net']), true);
  });

  it('rejects non-matching exact hostname', () => {
    assert.equal(isAllowedHost('evil.com', ['cdn.example.net']), false);
  });

  it('matches wildcard subdomain', () => {
    assert.equal(isAllowedHost('app.myapp.com', ['*.myapp.com']), true);
    assert.equal(isAllowedHost('tenant1.myapp.com', ['*.myapp.com']), true);
  });

  it('rejects base domain for wildcard pattern', () => {
    assert.equal(isAllowedHost('myapp.com', ['*.myapp.com']), false);
  });

  it('rejects unrelated domain for wildcard', () => {
    assert.equal(isAllowedHost('evil.com', ['*.myapp.com']), false);
  });

  it('rejects subdomain injection via suffix match', () => {
    assert.equal(isAllowedHost('evil-myapp.com', ['*.myapp.com']), false);
  });

  it('works with multiple patterns', () => {
    const list = ['*.myapp.com', 'cdn.example.net'];
    assert.equal(isAllowedHost('app.myapp.com', list), true);
    assert.equal(isAllowedHost('cdn.example.net', list), true);
    assert.equal(isAllowedHost('evil.com', list), false);
  });
});
