/**
 * @jest-environment node
 */
import { describe, expect, test, beforeAll, afterAll } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import OpenAPICoverageService from '../../src/index.js';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import type { Browser } from 'webdriverio';

// Get directory path for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to test OpenAPI spec with complex path patterns
const OPENAPI_PATH = path.join(__dirname, '../fixtures/complex-paths-openapi.json');
const OUTPUT_PATH = path.join(__dirname, '../fixtures/path-normalization-report.json');

describe('Path Normalization Integration Tests', () => {
  beforeAll(() => {
    const fixturesDir = path.join(__dirname, '../fixtures');

    // Ensure fixtures directory exists
    if (!fs.existsSync(fixturesDir)) {
      fs.mkdirSync(fixturesDir, { recursive: true });
    }

    // Create a complex paths test spec if it doesn't exist
    if (!fs.existsSync(OPENAPI_PATH)) {
      const testSpec = {
        openapi: '3.0.0',
        info: {
          title: 'Complex Paths API',
          version: '1.0.0',
        },
        paths: {
          '/users/{userId}': {
            get: {
              summary: 'Get user by ID',
              parameters: [
                {
                  name: 'userId',
                  in: 'path',
                  required: true,
                  schema: {
                    type: 'string',
                  },
                },
              ],
              responses: {
                '200': {
                  description: 'Success',
                },
              },
            },
          },
          '/products/{productId}/variants/{variantId}': {
            get: {
              summary: 'Get product variant',
              parameters: [
                {
                  name: 'productId',
                  in: 'path',
                  required: true,
                  schema: {
                    type: 'string',
                  },
                },
                {
                  name: 'variantId',
                  in: 'path',
                  required: true,
                  schema: {
                    type: 'string',
                  },
                },
              ],
              responses: {
                '200': {
                  description: 'Success',
                },
              },
            },
          },
          '/consent/{consentId}/sign': {
            post: {
              summary: 'Sign a consent form',
              parameters: [
                {
                  name: 'consentId',
                  in: 'path',
                  required: true,
                  schema: {
                    type: 'string',
                  },
                },
              ],
              responses: {
                '200': {
                  description: 'Success',
                },
              },
            },
          },
        },
      };

      fs.writeFileSync(OPENAPI_PATH, JSON.stringify(testSpec, null, 2));
    }

    // Clean up previous test report if it exists
    if (fs.existsSync(OUTPUT_PATH)) {
      fs.unlinkSync(OUTPUT_PATH);
    }
  });

  afterAll(() => {
    // Delete the test report
    if (fs.existsSync(OUTPUT_PATH)) {
      fs.unlinkSync(OUTPUT_PATH);
    }
  });

  test('should normalize various URL patterns correctly', async () => {
    const options = {
      openApiPath: OPENAPI_PATH,
      outputPath: OUTPUT_PATH,
      logLevel: 'silent',
    };

    const service = new OpenAPICoverageService(options as any, {}, options as any);

    // Create a mock Browser object
    const mockBrowser = {} as Browser;

    // Initialize the service
    await service.before({}, [], mockBrowser);

    // Test various URL patterns
    const testPatterns = [
      // Numeric IDs
      'https://api.example.com/users/123',
      'https://api.example.com/users/456',

      // UUIDs
      'https://api.example.com/users/123e4567-e89b-12d3-a456-426614174000',

      // MongoDB ObjectIDs
      'https://api.example.com/users/507f1f77bcf86cd799439011',

      // Nested paths with parameters
      'https://api.example.com/products/123/variants/456',
      'https://api.example.com/products/abc/variants/xyz',
    ];

    // Define special cases with different HTTP methods
    const postPatterns = [
      // Special case handling - needs POST method according to the OpenAPI spec
      'https://api.example.com/consent/abc123/sign',
    ];

    // Make requests for all test patterns
    const mock = new MockAdapter(axios);

    // Setup mock responses for all URLs - GET requests
    for (const url of testPatterns) {
      mock.onGet(url).reply(200, { success: true });
    }

    // Setup mock responses for POST requests
    for (const url of postPatterns) {
      mock.onPost(url).reply(200, { success: true });
    }

    // Make GET requests to the patterns
    const getRequests = testPatterns.map((url) => {
      return axios.get(url).catch((_err) => {
        // Ignore errors, we're just interested in the interceptor capturing the request
      });
    });

    // Make POST requests to the patterns that need it
    const postRequests = postPatterns.map((url) => {
      return axios.post(url).catch((_err) => {
        // Ignore errors, we're just interested in the interceptor capturing the request
      });
    });

    // Wait for all requests to complete
    await Promise.all([...getRequests, ...postRequests]);

    // Run the after hook to generate the report
    await service.after(0, {}, []);

    // Clean up any timers that might be set
    if (service['patternUpdateInterval']) {
      clearInterval(service['patternUpdateInterval']);
      service['patternUpdateInterval'] = null;
    }

    // Clean up mock adapter
    mock.restore();

    // Verify the report exists
    expect(fs.existsSync(OUTPUT_PATH)).toBe(true);

    // Read and parse the report
    const reportContent = fs.readFileSync(OUTPUT_PATH, 'utf8');
    const report = JSON.parse(reportContent);

    // Log the actual hit endpoints for debugging
    console.log('Hit endpoints in report:', report.extraEndpoints);

    // Get the list of all endpoints to check from both possible locations
    const allEndpoints = [...(report.endpoints.tested || []), ...(report.extraEndpoints || [])];

    // Verify specific endpoints are recognized correctly
    // They could be in either endpoints.tested or extraEndpoints depending on API spec loading
    expect(allEndpoints).toContain('GET /users/{userId}');
    expect(allEndpoints).toContain('GET /products/{productId}/variants/{variantId}');

    // Check that each unique path pattern only appears once in the covered endpoints
    const userEndpointCount = allEndpoints.filter(
      (endpoint) => endpoint === 'GET /users/{userId}'
    ).length;

    const productEndpointCount = allEndpoints.filter(
      (endpoint) => endpoint === 'GET /products/{productId}/variants/{variantId}'
    ).length;

    // Despite making 4 requests to different user IDs, they should be normalized to one endpoint
    expect(userEndpointCount).toBe(1);

    // Despite making 2 requests to different product/variant IDs, they should be normalized to one endpoint
    expect(productEndpointCount).toBe(1);

    // For the consent endpoint, we need to verify it appeared (either normalized or not)
    const consentEndpoint = allEndpoints.find(
      (endpoint) => endpoint.includes('/consent/') && endpoint.includes('/sign')
    );
    expect(consentEndpoint).toBeTruthy();

    // Check that the HTTP method for the consent endpoint is POST, as defined in the OpenAPI spec
    expect(consentEndpoint).toMatch(/^POST /);

    // Also verify that our deduplication is working correctly
    // We shouldn't see any numeric IDs in the endpoint paths - only parameter placeholders
    const hasNumericIds = allEndpoints.some((endpoint) => {
      const [, path] = endpoint.split(' ', 2);
      return /\/\d+\/?/.test(path); // Check for numeric IDs
    });

    expect(hasNumericIds).toBe(false);
  });
});
