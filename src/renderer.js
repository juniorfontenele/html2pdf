import puppeteer from 'puppeteer-core';
import { PDFDocument } from 'pdf-lib';
import config from './config.js';
import { validateNavigation, createRequestInterceptor } from './security.js';

/** @type {import('puppeteer-core').Browser | null} */
let browser = null;
let activeTabs = 0;

/** @type {import('fastify').FastifyBaseLogger | null} */
let appLogger = null;

const DEFAULT_OPTIONS = {
  format: 'A4',
  printBackground: true,
  preferCSSPageSize: false,
  displayHeaderFooter: false,
  headerTemplate: '<div></div>',
  footerTemplate: '<div></div>',
  margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
  scale: 1,
  tagged: true,
};

/**
 * Set the application-level logger for non-request scoped operations.
 *
 * @param {import('fastify').FastifyBaseLogger} logger
 */
export function setLogger(logger) {
  appLogger = logger;
}

/**
 * Launch or retrieve the shared browser instance.
 * Auto-reconnects if the browser was closed or crashed.
 */
async function getBrowser() {
  if (browser && browser.connected) {
    return browser;
  }

  appLogger?.info('Launching Chrome browser');

  browser = await puppeteer.launch({
    headless: true,
    executablePath: config.chrome.executablePath,
    args: config.chrome.args,
  });

  const version = await browser.version();
  appLogger?.info({ version, pid: browser.process()?.pid }, 'Chrome browser ready');

  browser.on('disconnected', () => {
    appLogger?.warn('Chrome browser disconnected — will reconnect on next request');
    browser = null;
  });

  return browser;
}

/**
 * Render a page (from HTML string or URL) to a PDF buffer.
 *
 * @param {{ html?: string, url?: string, options?: object }} pageEntry
 * @param {import('fastify').FastifyBaseLogger} logger
 * @param {number} pageIndex
 * @param {number} timeout - Timeout in ms
 * @returns {Promise<Buffer>}
 */
async function renderPage(pageEntry, logger, pageIndex, timeout = config.renderer.timeout) {
  // Validate navigation URL against SSRF allowlist before consuming a tab slot
  if (pageEntry.url) {
    await validateNavigation(pageEntry.url, logger);
  }

  if (activeTabs >= config.renderer.concurrency) {
    logger.warn(
      { activeTabs, maxConcurrency: config.renderer.concurrency },
      'Concurrency limit reached — rejecting render',
    );
    throw Object.assign(new Error('Too many concurrent renders'), { statusCode: 503 });
  }

  activeTabs++;

  const source = pageEntry.url ? 'url' : 'html';
  const target = pageEntry.url || `[html ${pageEntry.html.length} chars]`;
  logger.info(
    { page: pageIndex + 1, source, target, activeTabs },
    'Rendering page',
  );

  const pageStart = Date.now();
  const instance = await getBrowser();
  const page = await instance.newPage();

  try {
    // Intercept all sub-resource requests (images, CSS, fonts, iframes)
    await page.setRequestInterception(true);
    page.on('request', createRequestInterceptor(logger));

    const { waitUntil, delay, ...pdfOpts } = pageEntry.options || {};
    const navigation = waitUntil || 'networkidle0';

    if (pageEntry.url) {
      logger.debug({ url: pageEntry.url, waitUntil: navigation }, 'Navigating to URL');
      await page.goto(pageEntry.url, { waitUntil: navigation, timeout });
    } else {
      logger.debug({ waitUntil: navigation, htmlLength: pageEntry.html.length }, 'Setting HTML content');
      await page.setContent(pageEntry.html, { waitUntil: navigation, timeout });
    }

    if (delay && delay > 0) {
      logger.debug({ delay }, 'Applying post-navigation delay');
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    const pdfOptions = { ...DEFAULT_OPTIONS, ...pdfOpts };
    const buffer = await page.pdf(pdfOptions);

    const durationMs = Date.now() - pageStart;
    logger.info(
      { page: pageIndex + 1, durationMs, sizeBytes: buffer.length },
      'Page rendered',
    );

    return buffer;
  } catch (err) {
    const durationMs = Date.now() - pageStart;
    logger.error(
      { page: pageIndex + 1, source, durationMs, err: err.message },
      'Page render failed',
    );
    throw err;
  } finally {
    await page.close();
    activeTabs--;
  }
}

/**
 * Merge multiple PDF buffers into a single PDF.
 *
 * Each entry can optionally specify page indices to skip (1-based).
 * This is used for two-pass rendering where the body PDF has a blank
 * placeholder page 1 that must be discarded during merge.
 *
 * @param {{ buffer: Buffer, skipPages?: number[] }[]} entries
 * @param {import('fastify').FastifyBaseLogger} logger
 * @returns {Promise<Buffer>}
 */
async function mergePdfs(entries, logger) {
  if (entries.length === 1 && !entries[0].skipPages?.length) {
    return entries[0].buffer;
  }

  logger.info({ documents: entries.length }, 'Merging PDFs');
  const mergeStart = Date.now();

  const merged = await PDFDocument.create();

  for (const entry of entries) {
    const doc = await PDFDocument.load(entry.buffer);
    const allIndices = doc.getPageIndices();
    const skip = new Set((entry.skipPages || []).map((p) => p - 1)); // 1-based → 0-based
    const indices = allIndices.filter((i) => !skip.has(i));

    if (skip.size > 0) {
      logger.info(
        { totalPages: allIndices.length, skipped: skip.size, kept: indices.length },
        'Filtering pages',
      );
    }

    const pages = await merged.copyPages(doc, indices);
    for (const page of pages) {
      merged.addPage(page);
    }
  }

  const bytes = await merged.save();
  const result = Buffer.from(bytes);

  const durationMs = Date.now() - mergeStart;
  logger.info(
    { durationMs, totalPages: merged.getPageCount(), sizeBytes: result.length },
    'PDFs merged',
  );

  return result;
}

/**
 * Process a full render request (one or more pages → merged PDF).
 *
 * @param {{ html?: string, url?: string, options?: object }[]} pages
 * @param {import('fastify').FastifyBaseLogger} logger
 * @returns {Promise<Buffer>}
 */
export async function render(pages, logger) {
  const startTime = Date.now();

  const sources = pages.map((p) => (p.url ? 'url' : 'html'));
  logger.info({ pageCount: pages.length, sources }, 'Starting render');

  const entries = [];

  for (let i = 0; i < pages.length; i++) {
    const buffer = await renderPage(pages[i], logger, i);
    entries.push({ buffer, skipPages: pages[i].skipPages });
  }

  const result = await mergePdfs(entries, logger);

  const durationMs = Date.now() - startTime;
  logger.info(
    { durationMs, pages: pages.length, sizeBytes: result.length },
    'Render complete',
  );

  return result;
}

/**
 * Check if the browser is healthy.
 */
export async function healthCheck() {
  try {
    const instance = await getBrowser();
    const version = await instance.version();

    return {
      status: 'ok',
      browser: 'connected',
      version,
      activeTabs,
      maxConcurrency: config.renderer.concurrency,
    };
  } catch (err) {
    return {
      status: 'error',
      browser: 'disconnected',
      error: err.message,
      activeTabs,
      maxConcurrency: config.renderer.concurrency,
    };
  }
}

/**
 * Gracefully close the browser.
 */
export async function shutdown() {
  if (browser) {
    appLogger?.info('Closing Chrome browser');
    await browser.close();
    browser = null;
  }
}
