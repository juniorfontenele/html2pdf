import puppeteer from 'puppeteer-core';
import { PDFDocument } from 'pdf-lib';
import config from './config.js';

/** @type {import('puppeteer-core').Browser | null} */
let browser = null;
let activeTabs = 0;

const DEFAULT_OPTIONS = {
  format: 'A4',
  printBackground: true,
  preferCSSPageSize: false,
  displayHeaderFooter: false,
  headerTemplate: '<div></div>',
  footerTemplate: '<div></div>',
  margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
  scale: 1,
};

/**
 * Launch or retrieve the shared browser instance.
 * Auto-reconnects if the browser was closed or crashed.
 */
async function getBrowser() {
  if (browser && browser.connected) {
    return browser;
  }

  browser = await puppeteer.launch({
    headless: true,
    executablePath: config.chrome.executablePath,
    args: config.chrome.args,
  });

  browser.on('disconnected', () => {
    browser = null;
  });

  return browser;
}

/**
 * Render a page (from HTML string or URL) to a PDF buffer.
 *
 * @param {{ html?: string, url?: string, options?: object }} pageEntry
 * @param {number} timeout - Timeout in ms
 * @returns {Promise<Buffer>}
 */
async function renderPage(pageEntry, timeout = config.renderer.timeout) {
  if (activeTabs >= config.renderer.concurrency) {
    throw Object.assign(new Error('Too many concurrent renders'), { statusCode: 503 });
  }

  activeTabs++;
  const instance = await getBrowser();
  const page = await instance.newPage();

  try {
    const { waitUntil, delay, ...pdfOpts } = pageEntry.options || {};
    const navigation = waitUntil || 'networkidle0';

    if (pageEntry.url) {
      await page.goto(pageEntry.url, { waitUntil: navigation, timeout });
    } else {
      await page.setContent(pageEntry.html, { waitUntil: navigation, timeout });
    }

    if (delay && delay > 0) {
      await new Promise((resolve) => setTimeout(resolve, delay));
    }

    const pdfOptions = { ...DEFAULT_OPTIONS, ...pdfOpts };

    return await page.pdf(pdfOptions);
  } finally {
    await page.close();
    activeTabs--;
  }
}

/**
 * Merge multiple PDF buffers into a single PDF.
 *
 * @param {Buffer[]} buffers
 * @returns {Promise<Buffer>}
 */
async function mergePdfs(buffers) {
  if (buffers.length === 1) {
    return buffers[0];
  }

  const merged = await PDFDocument.create();

  for (const buffer of buffers) {
    const doc = await PDFDocument.load(buffer);
    const pages = await merged.copyPages(doc, doc.getPageIndices());
    for (const page of pages) {
      merged.addPage(page);
    }
  }

  const bytes = await merged.save();
  return Buffer.from(bytes);
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

  logger.info({ pageCount: pages.length }, 'Starting render');

  const buffers = [];

  for (const page of pages) {
    const buffer = await renderPage(page);
    buffers.push(buffer);
  }

  const result = await mergePdfs(buffers);

  const durationMs = Date.now() - startTime;
  logger.info({ durationMs, pages: pages.length, sizeBytes: result.length }, 'Render complete');

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
    await browser.close();
    browser = null;
  }
}
