import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import config from './config.js';
import { render, healthCheck, shutdown, setLogger } from './renderer.js';
import { renderSchema } from './schemas.js';

const startedAt = Date.now();

const app = Fastify({
  logger: {
    level: config.logLevel,
  },
  bodyLimit: config.bodyLimit,
  genReqId: () => randomUUID(),
});

// Share the app logger with the renderer for non-request scoped logs
setLogger(app.log);

app.log.info(
  {
    port: config.port,
    host: config.host,
    logLevel: config.logLevel,
    bodyLimit: config.bodyLimit,
    concurrency: config.renderer.concurrency,
    timeout: config.renderer.timeout,
  },
  'Configuration loaded',
);

// ─── Routes ──────────────────────────────────────────────

app.post('/render', { schema: renderSchema }, async (request, reply) => {
  const { pages } = request.body;

  const pdf = await render(pages, request.log);

  return reply
    .header('Content-Type', 'application/pdf')
    .header('Content-Length', pdf.length)
    .send(pdf);
});

app.get('/health', async () => {
  const info = await healthCheck();

  return {
    ...info,
    uptime: Math.floor((Date.now() - startedAt) / 1000),
  };
});

// ─── Error Handler ───────────────────────────────────────

app.setErrorHandler((error, request, reply) => {
  const statusCode = error.statusCode || 500;

  request.log.error({ err: error }, 'Request error');

  return reply.status(statusCode).send({
    error: error.message,
    statusCode,
  });
});

// ─── Lifecycle ───────────────────────────────────────────

const signals = ['SIGINT', 'SIGTERM'];

for (const signal of signals) {
  process.on(signal, async () => {
    app.log.info({ signal }, 'Shutting down');
    await shutdown();
    await app.close();
    process.exit(0);
  });
}

// ─── Start ───────────────────────────────────────────────

try {
  await app.listen({ port: config.port, host: config.host });
} catch (err) {
  app.log.fatal(err);
  process.exit(1);
}
