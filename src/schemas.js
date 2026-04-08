export const renderSchema = {
  body: {
    type: 'object',
    required: ['pages'],
    properties: {
      pages: {
        type: 'array',
        minItems: 1,
        items: {
          type: 'object',
          anyOf: [
            { required: ['html'] },
            { required: ['url'] },
          ],
          properties: {
            html: { type: 'string', minLength: 1 },
            url: { type: 'string', minLength: 1 },
            skipPages: {
              type: 'array',
              items: { type: 'integer', minimum: 1 },
              uniqueItems: true,
            },
            options: {
              type: 'object',
              properties: {
                format: { type: 'string' },
                printBackground: { type: 'boolean' },
                preferCSSPageSize: { type: 'boolean' },
                displayHeaderFooter: { type: 'boolean' },
                headerTemplate: { type: 'string' },
                footerTemplate: { type: 'string' },
                scale: { type: 'number', minimum: 0.1, maximum: 2 },
                tagged: { type: 'boolean' },
                pageRanges: { type: 'string' },
                waitUntil: {
                  type: 'string',
                  enum: ['networkidle0', 'networkidle2', 'load', 'domcontentloaded'],
                },
                delay: { type: 'integer', minimum: 0, maximum: 30000 },
                margin: {
                  type: 'object',
                  properties: {
                    top: { type: 'string' },
                    right: { type: 'string' },
                    bottom: { type: 'string' },
                    left: { type: 'string' },
                  },
                  additionalProperties: false,
                },
              },
              additionalProperties: false,
            },
          },
          additionalProperties: false,
        },
      },
    },
    additionalProperties: false,
  },
};
