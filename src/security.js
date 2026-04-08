import { resolve4 } from 'node:dns/promises';
import { isIPv4 } from 'node:net';
import config from './config.js';

// ─── Dangerous IP ranges ────────────────────────────────

const DANGEROUS_CIDRS = [
  { ip: 0x7F000000, mask: 0xFF000000 }, // 127.0.0.0/8  (loopback)
  { ip: 0xA9FE0000, mask: 0xFFFF0000 }, // 169.254.0.0/16 (link-local / cloud metadata)
];

const DANGEROUS_EXACT = [
  '0.0.0.0',
  '::1',
];

/**
 * Convert dotted-quad IPv4 to a 32-bit unsigned integer.
 *
 * @param {string} addr
 * @returns {number}
 */
function ipToInt(addr) {
  const parts = addr.split('.').map(Number);
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

/**
 * Check whether an IP address falls within a dangerous range.
 *
 * @param {string} ip
 * @returns {boolean}
 */
export function isDangerousIp(ip) {
  if (DANGEROUS_EXACT.includes(ip)) return true;

  if (!isIPv4(ip)) return false;

  const numericIp = ipToInt(ip);
  return DANGEROUS_CIDRS.some(({ ip: netIp, mask }) => ((numericIp & mask) >>> 0) === netIp);
}

// ─── Host matching ──────────────────────────────────────

/**
 * Test whether a hostname matches an allowlist entry.
 * Supports exact match and wildcard prefix ('*.example.com').
 *
 * @param {string} hostname
 * @param {string} pattern
 * @returns {boolean}
 */
function matchesHostPattern(hostname, pattern) {
  if (pattern === hostname) return true;

  if (pattern.startsWith('*.')) {
    const suffix = pattern.slice(1); // '.example.com'
    return hostname.endsWith(suffix) && hostname.length > suffix.length;
  }

  return false;
}

/**
 * Check whether a hostname is present in the allowlist.
 *
 * @param {string} hostname
 * @param {string[]} allowlist
 * @returns {boolean}
 */
export function isAllowedHost(hostname, allowlist) {
  if (allowlist.length === 0) return true; // no restriction
  return allowlist.some((pattern) => matchesHostPattern(hostname, pattern));
}

/**
 * Check whether a hostname is a CDN host (skip path validation).
 *
 * @param {string} hostname
 * @returns {boolean}
 */
export function isCdnHost(hostname) {
  return config.security.cdnHosts.some((pattern) => matchesHostPattern(hostname, pattern));
}

// ─── Path matching ──────────────────────────────────────

/**
 * Convert a simple glob pattern to a RegExp.
 * Supports '*' as a wildcard that matches any characters.
 *
 * @param {string} pattern
 * @returns {RegExp}
 */
function globToRegex(pattern) {
  const parts = pattern.split('*');
  const regexStr = parts
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');

  return new RegExp(`^${regexStr}$`);
}

/**
 * Check whether a pathname matches any of the allowed path patterns.
 *
 * @param {string} pathname
 * @param {string[]} patterns
 * @returns {boolean}
 */
export function isAllowedPath(pathname, patterns) {
  if (patterns.length === 0) return true; // no restriction
  return patterns.some((pattern) => globToRegex(pattern).test(pathname));
}

// ─── DNS resolution ─────────────────────────────────────

/**
 * Resolve a hostname to IPv4 addresses and check for dangerous IPs.
 * Skips resolution when the hostname is already an IP literal.
 *
 * @param {string} hostname
 * @returns {Promise<void>}
 * @throws {Error} if any resolved IP is dangerous
 */
export async function resolveAndValidateIp(hostname) {
  let addresses;

  if (isIPv4(hostname)) {
    addresses = [hostname];
  } else {
    try {
      addresses = await resolve4(hostname);
    } catch {
      // DNS resolution failed — allow it through (might be internal Docker hostname).
      // The host allowlist already constrains which hostnames are reachable.
      return;
    }
  }

  for (const ip of addresses) {
    if (isDangerousIp(ip)) {
      throw Object.assign(
        new Error(`Blocked: hostname '${hostname}' resolves to dangerous IP ${ip}`),
        { statusCode: 422 },
      );
    }
  }
}

// ─── Main validation (for page.goto URLs) ───────────────

/**
 * Validate a URL before allowing Puppeteer to navigate to it.
 *
 * Checks: protocol -> host allowlist -> DNS/IP safety -> path allowlist.
 *
 * @param {string} rawUrl
 * @param {import('fastify').FastifyBaseLogger} logger
 * @returns {Promise<void>}
 * @throws {Error} with statusCode 422 on violation
 */
export async function validateNavigation(rawUrl, logger) {
  const { security } = config;

  if (!security.enabled || security.allowedHosts.length === 0) {
    return; // protection disabled or no allowlist configured
  }

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw Object.assign(
      new Error(`Blocked: invalid URL '${rawUrl}'`),
      { statusCode: 422 },
    );
  }

  // Protocol check
  if (!security.allowedProtocols.includes(parsed.protocol)) {
    logger.warn({ url: rawUrl, protocol: parsed.protocol }, 'SSRF: blocked protocol');
    throw Object.assign(
      new Error(`Blocked: protocol '${parsed.protocol}' is not allowed`),
      { statusCode: 422 },
    );
  }

  // Host allowlist
  if (!isAllowedHost(parsed.hostname, security.allowedHosts)) {
    logger.warn({ url: rawUrl, hostname: parsed.hostname }, 'SSRF: blocked host');
    throw Object.assign(
      new Error(`Blocked: host '${parsed.hostname}' is not in the allowlist`),
      { statusCode: 422 },
    );
  }

  // DNS resolution — reject dangerous IPs
  await resolveAndValidateIp(parsed.hostname);

  // Path allowlist (skip for CDN hosts)
  if (!isCdnHost(parsed.hostname) && !isAllowedPath(parsed.pathname, security.allowedPathPatterns)) {
    logger.warn({ url: rawUrl, pathname: parsed.pathname }, 'SSRF: blocked path');
    throw Object.assign(
      new Error(`Blocked: path '${parsed.pathname}' is not in the allowed patterns`),
      { statusCode: 422 },
    );
  }

  logger.debug({ url: rawUrl }, 'SSRF: navigation allowed');
}

// ─── Request interception (for sub-resources) ───────────

/**
 * Create a Puppeteer request interceptor that enforces the allowlist
 * on every sub-resource request (images, CSS, fonts, iframes, etc.).
 *
 * @param {import('fastify').FastifyBaseLogger} logger
 * @returns {(request: import('puppeteer-core').HTTPRequest) => Promise<void>}
 */
export function createRequestInterceptor(logger) {
  const { security } = config;

  return async (request) => {
    // Protection disabled or no allowlist — let everything through
    if (!security.enabled || security.allowedHosts.length === 0) {
      await request.continue();
      return;
    }

    const url = request.url();

    // data: URIs are inline content, not network requests — allow them
    if (url.startsWith('data:')) {
      await request.continue();
      return;
    }

    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      logger.warn({ url }, 'SSRF: aborting request with unparseable URL');
      await request.abort('blockedbyclient');
      return;
    }

    // Protocol check
    if (!security.allowedProtocols.includes(parsed.protocol)) {
      logger.warn({ url, protocol: parsed.protocol }, 'SSRF: aborting sub-request (blocked protocol)');
      await request.abort('blockedbyclient');
      return;
    }

    // Host check
    if (!isAllowedHost(parsed.hostname, security.allowedHosts)) {
      logger.warn({ url, hostname: parsed.hostname }, 'SSRF: aborting sub-request (blocked host)');
      await request.abort('blockedbyclient');
      return;
    }

    // Path check (skip for CDN hosts)
    if (!isCdnHost(parsed.hostname) && !isAllowedPath(parsed.pathname, security.allowedPathPatterns)) {
      logger.warn({ url, pathname: parsed.pathname }, 'SSRF: aborting sub-request (blocked path)');
      await request.abort('blockedbyclient');
      return;
    }

    await request.continue();
  };
}
