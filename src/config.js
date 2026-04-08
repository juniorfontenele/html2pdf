const isDev = (process.env.NODE_ENV || 'development') === 'development';

/**
 * Parse a comma-separated env var into a trimmed, non-empty array.
 *
 * @param {string | undefined} value
 * @returns {string[]}
 */
function parseList(value) {
  if (!value) return [];
  return value.split(',').map((s) => s.trim()).filter(Boolean);
}

const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  bodyLimit: parseInt(process.env.BODY_LIMIT || '52428800', 10), // 50MB
  logLevel: process.env.LOG_LEVEL || 'info',

  chrome: {
    executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome-stable',
    args: [
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-sandbox',
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
    ],
  },

  renderer: {
    concurrency: parseInt(process.env.CONCURRENCY || '3', 10),
    timeout: parseInt(process.env.TIMEOUT || '30000', 10), // per page, ms
  },

  security: {
    /** When false, all SSRF checks are bypassed (emergency kill switch). */
    enabled: process.env.SSRF_PROTECTION !== 'disabled',

    /**
     * Hosts the browser is allowed to connect to.
     * Supports wildcards: '*.example.com' matches 'sub.example.com'.
     * Empty list = no restriction (backward-compatible).
     */
    allowedHosts: parseList(process.env.ALLOWED_HOSTS),

    /**
     * CDN hosts that skip path validation (any path is allowed).
     * Must also be present in allowedHosts.
     */
    cdnHosts: parseList(process.env.CDN_HOSTS),

    /**
     * Path patterns allowed for non-CDN hosts.
     * Supports simple globs: '/build/*' matches '/build/assets/app.css'.
     * Empty list = no path restriction.
     */
    allowedPathPatterns: parseList(process.env.ALLOWED_PATH_PATTERNS),

    /** Protocols the browser may navigate to. */
    allowedProtocols: isDev ? ['https:', 'http:'] : ['https:'],
  },
};

export default config;
