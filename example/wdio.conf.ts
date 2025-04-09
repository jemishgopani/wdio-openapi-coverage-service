import type { Options } from '@wdio/types';

export const config: Options.Testrunner = {
  // Basic WebdriverIO configuration
  runner: 'local',
  specs: ['./test/**/*.ts'],
  exclude: [],
  maxInstances: 10,
  capabilities: [
    {
      maxInstances: 5,
      browserName: 'chrome',
    },
  ],
  logLevel: 'info',
  bail: 0,
  baseUrl: 'http://localhost',
  waitforTimeout: 10000,
  connectionRetryTimeout: 120000,
  connectionRetryCount: 3,
  framework: 'mocha',
  reporters: ['spec'],

  // Add OpenAPI Coverage Service to WebdriverIO services
  services: [
    [
      'openapi',
      {
        // Path to your OpenAPI specification
        openApiPath: './api/openapi.json',

        // Output path for the coverage report
        outputPath: './reports/api-coverage.json',

        // Custom endpoint pattern file for path normalization
        endpointPatternFile: './endpoint-patterns.json',

        // Enable dynamic pattern learning from API requests
        // This will be disabled if endpointPatternFile is specified
        enableDynamicPatternLearning: true,

        // Provide custom patterns programmatically (alternative to endpointPatternFile)
        customPatterns: [
          {
            pattern: new RegExp('/comments/\\d+'),
            template: '/comments/{id}',
            priority: 100, // Higher priority than auto-generated patterns
          },
        ],

        // Set log level for the service
        logLevel: 'info',
      },
    ],
  ],

  // WebdriverIO's Mocha configuration
  mochaOpts: {
    ui: 'bdd',
    timeout: 60000,
  },
};
