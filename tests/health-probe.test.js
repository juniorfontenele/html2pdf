import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { probeBrowser } from '../src/renderer.js';

// ─── Fakes ──────────────────────────────────────────────

const never = () => new Promise(() => {});

/**
 * Minimal stand-in for a puppeteer Browser/Page pair, recording what the
 * probe did so the tests can assert the tab never leaks.
 */
function fakeBrowser({ newPage, setContent } = {}) {
  const calls = { setContent: [], closed: 0 };

  const page = {
    setContent: (html, options) => {
      calls.setContent.push({ html, options });
      return setContent ? setContent() : Promise.resolve();
    },
    close: () => {
      calls.closed++;
      return Promise.resolve();
    },
  };

  return {
    calls,
    browser: { newPage: () => (newPage ? newPage() : Promise.resolve(page)) },
  };
}

// ─── probeBrowser ───────────────────────────────────────

describe('probeBrowser', () => {
  it('opens a tab, loads a document and closes the tab', async () => {
    const { browser, calls } = fakeBrowser();

    await probeBrowser(browser, 1000);

    assert.equal(calls.setContent.length, 1);
    assert.equal(calls.setContent[0].options.waitUntil, 'load');
    assert.equal(calls.closed, 1);
  });

  it('rejects when loading the document exceeds the timeout, and still closes the tab', async () => {
    const { browser, calls } = fakeBrowser({ setContent: never });

    await assert.rejects(probeBrowser(browser, 50), /timed out/);
    assert.equal(calls.closed, 1);
  });

  it('rejects when opening the tab exceeds the timeout', async () => {
    const { browser } = fakeBrowser({ newPage: never });

    await assert.rejects(probeBrowser(browser, 50), /timed out/);
  });

  it('propagates a browser error and still closes the tab', async () => {
    const { browser, calls } = fakeBrowser({
      setContent: () => Promise.reject(new Error('Target closed')),
    });

    await assert.rejects(probeBrowser(browser, 1000), /Target closed/);
    assert.equal(calls.closed, 1);
  });
});
