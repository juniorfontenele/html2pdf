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
};

export default config;
