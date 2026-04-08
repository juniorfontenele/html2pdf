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
          required: ['html'],
          properties: {
            html: { type: 'string', minLength: 1 },
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
