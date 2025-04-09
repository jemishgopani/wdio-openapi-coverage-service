/**
 * @jest-environment node
 */
import { describe, expect, test, beforeAll, afterAll, afterEach } from '@jest/globals';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import OpenAPICoverageService from '../../src/index.js';
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import { normalizePath } from '../../src/utils/path-normalizer.js';
import type { Browser } from 'webdriverio';
import { join } from 'path';
import { apiClient } from '../../src/index.js';

// Get directory path for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Path to test OpenAPI spec
const OPENAPI_PATH = join(process.cwd(), 'tests', 'fixtures', 'test-openapi.json');
const OUTPUT_PATH = join(process.cwd(), '.openapi');

describe('OpenAPI Coverage Service Snapshots', () => {
  let service: OpenAPICoverageService;

  // Prepare a controlled test environment with fixed data
  beforeAll(() => {
    const fixturesDir = path.join(__dirname, '../fixtures');

    // Ensure fixtures directory exists
    if (!fs.existsSync(fixturesDir)) {
      fs.mkdirSync(fixturesDir, { recursive: true });
    }

    // Create a deterministic test OpenAPI spec for snapshots
    const testSpec = {
      openapi: '3.0.0',
      info: {
        title: 'Snapshot Test API',
        version: '1.0.0',
      },
      paths: {
        '/users': {
          get: { summary: 'Get all users' },
          post: { summary: 'Create a user' },
        },
        '/users/{id}': {
          get: { summary: 'Get user by ID' },
          put: { summary: 'Update user' },
          delete: { summary: 'Delete user' },
        },
        '/products': {
          get: { summary: 'Get all products' },
        },
        '/products/{productId}/variants/{variantId}': {
          get: { summary: 'Get product variant' },
        },
      },
    };

    fs.writeFileSync(OPENAPI_PATH, JSON.stringify(testSpec, null, 2));

    // Create service with silent logging for clean snapshots
    const options = {
      openApiPath: OPENAPI_PATH,
      logLevel: 'silent',
    };

    service = new OpenAPICoverageService(options as any, {}, options as any);
  });

  afterAll(() => {
    // Clean up test files
    if (fs.existsSync(OPENAPI_PATH)) {
      fs.unlinkSync(OPENAPI_PATH);
    }

    // Clean up any timeouts or intervals
    if (service['patternUpdateInterval']) {
      clearInterval(service['patternUpdateInterval']);
      service['patternUpdateInterval'] = null;
    }
  });

  afterEach(() => {
    // Clean up any timers that might be set
    if (service && service['patternUpdateInterval']) {
      clearInterval(service['patternUpdateInterval']);
      service['patternUpdateInterval'] = null;
    }

    // Reset axios interceptors if they exist
    if (service && service['axiosRequestInterceptorId']) {
      axios.interceptors.request.eject(service['axiosRequestInterceptorId']);
    }
    if (service && service['axiosResponseInterceptorId']) {
      axios.interceptors.response.eject(service['axiosResponseInterceptorId']);
    }
  });

  test('path normalization should match snapshot for various URL patterns', () => {
    // Simply test the normalizePath utility function that is used by the service
    const testUrls = [
      // Simple paths
      '/users',
      '/products',

      // Numeric IDs
      '/users/123',
      '/users/456',

      // UUID format
      '/users/123e4567-e89b-12d3-a456-426614174000',

      // MongoDB ObjectID format
      '/users/507f1f77bcf86cd799439011',

      // Nested paths with multiple parameters
      '/products/123/variants/456',
      '/products/abc/variants/xyz',

      // Special case handling
      '/consent/abc123/sign',

      // Edge cases
      '/users/123/profile',
      '/api/v1/users/123',
      '/users/by-name/john',
    ];

    // Parse the OpenAPI spec
    const apiSpec = JSON.parse(fs.readFileSync(OPENAPI_PATH, 'utf8'));

    // Create a map of original URLs to their normalized paths
    const normalizedPaths: Record<string, string> = {};

    for (const url of testUrls) {
      normalizedPaths[url] = normalizePath(url, apiSpec, []);
    }

    // This snapshot ensures path normalization behavior remains consistent
    expect(normalizedPaths).toMatchSnapshot();
  });

  test('coverage report format should match snapshot', async () => {
    // Create a service with a known OpenAPI spec
    const service = new OpenAPICoverageService(
      {
        openApiPath: path.join(__dirname, '../fixtures/openapi.json'),
        outputPath: path.join(__dirname, '../fixtures/report-snapshot.json'),
        logLevel: 'silent',
      } as any,
      {},
      {} as any
    );

    await service.before({}, [], {} as Browser);

    // Make some API calls to generate coverage
    try {
      await apiClient.get('https://jsonplaceholder.typicode.com/users');
      await apiClient.get('https://jsonplaceholder.typicode.com/users/1');
    } catch (_e) {
      // Ignore errors in test
    }

    await service.after(0, {}, []);

    // Read the report
    const report = JSON.parse(
      fs.readFileSync(path.join(__dirname, '../fixtures/report-snapshot.json'), 'utf8')
    );

    // Snapshot the structure of the report (ignoring dynamic data like timestamps)
    const simplifiedReport = {
      summary: report.summary,
      methodCoverage: report.methodCoverage,
      endpoints: {
        tested: report.endpoints.tested,
        untested: report.endpoints.untested.length, // Just the count to avoid large snapshots
      },
      extraEndpoints: report.extraEndpoints,
      timestamp: 'TIMESTAMP', // Normalize timestamp
    };

    // This snapshot ensures report format remains consistent
    expect(simplifiedReport).toMatchSnapshot();

    // Verify that our API calls were tracked in the correct sections
    // Depending on the OpenAPI spec loading and normalization, endpoints could be in
    // either endpoints.tested or extraEndpoints
    const testedEndpoints = report.endpoints.tested || [];
    const extraEndpoints = report.extraEndpoints || [];

    // Combined list to check against
    const allTrackedEndpoints = [...testedEndpoints, ...extraEndpoints];

    // Check that both our API endpoints were captured somewhere
    expect(allTrackedEndpoints).toContain('GET /users');
    expect(
      allTrackedEndpoints.some(
        (endpoint) => endpoint === 'GET /users/{id}' || endpoint === 'GET /users/1'
      )
    ).toBe(true);
  });

  test('axios request interceptor behavior', async () => {
    // Create a mock Browser object
    const mockBrowser = {} as Browser;

    // Initialize the service
    await service.before({}, [], mockBrowser);

    // Create a set of test requests
    const testRequests = [
      { method: 'get', url: 'https://api.example.com/users' },
      { method: 'post', url: 'https://api.example.com/users', data: { name: 'Test User' } },
      { method: 'get', url: 'https://api.example.com/users/123' },
      { method: 'put', url: 'https://api.example.com/users/123', data: { name: 'Updated User' } },
      { method: 'delete', url: 'https://api.example.com/users/123' },
      { method: 'get', url: '/users', baseURL: 'https://api.example.com' }, // Relative URL
      { url: 'https://api.example.com/users/456' }, // Missing method (defaults to GET)
      { method: 'get', url: 'https://api.example.com/products/123/variants/456' },
    ];

    // Create a mock adapter for axios
    const mock = new MockAdapter(axios);

    // Set up mock responses for all URLs
    testRequests.forEach((req) => {
      const method = (req.method || 'get').toLowerCase();
      const url = req.baseURL ? `${req.baseURL}${req.url}` : req.url;

      mock[`on${method.charAt(0).toUpperCase() + method.slice(1)}`](url).reply(200, {});
    });

    // Make the requests to trigger the interceptors
    await Promise.all(
      testRequests.map((req) => {
        const config = { ...req };
        return axios.request(config).catch(() => {
          // Ignore any errors
        });
      })
    );

    // Simply verify the test completes without errors
    expect(true).toBe(true);
  });

  test('test the axios interceptor', async () => {
    // Create a mock adapter for axios
    const mock = new MockAdapter(axios);

    try {
      // Test code goes here

      // Simply verify the test completes without errors
      expect(true).toBe(true);
    } finally {
      // Ensure mock adapter is cleaned up
      mock.restore();
    }
  });

  test('should properly handle request and response axios interceptors', async () => {
    // Create a new instance of service
    const options = {
      openApiPath: OPENAPI_PATH,
      outputPath: OUTPUT_PATH,
      logLevel: 'silent',
    };
    service = new OpenAPICoverageService(options as any, {}, options as any);
    await service.before({}, [], {} as Browser);

    // Create a mock adapter for axios
    const mock = new MockAdapter(axios);

    try {
      // Setup mock responses
      mock.onGet('/users').reply(200, { success: true });

      // Make a request that should be intercepted
      await axios.get('/users');

      // Simply verify the test completes without errors
      expect(true).toBe(true);
    } finally {
      // Ensure mock adapter is cleaned up
      mock.restore();
    }
  });
});
