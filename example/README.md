# WebdriverIO OpenAPI Coverage Service Example

This directory contains a comprehensive example of how to use the WebdriverIO OpenAPI Coverage Service.

## Structure

- `api/openapi.json` - Sample OpenAPI specification file describing a simple API (using JSONPlaceholder)
- `test/api.test.ts` - Example test file showing how to use the service's `apiClient` to make API calls that are tracked for coverage
- `wdio.conf.ts` - Example WebdriverIO configuration showing how to set up the service
- `endpoint-patterns.json` - Example custom patterns for normalizing API paths

## Running the Example

To run this example:

1. Make sure you have built the project:
   ```bash
   npm run build
   ```

2. Install additional dependencies for the examples:
   ```bash
   npm install --no-save mocha chai
   ```

3. Run WebdriverIO:
   ```bash
   npx wdio run example/wdio.conf.ts
   ```

4. Check the generated coverage report at `reports/api-coverage.json`

## Features Demonstrated

This example demonstrates the following features:

1. **Basic API Coverage Tracking**: Automatic tracking of all API requests made with the `apiClient`.
   
2. **Path Normalization**: Converting dynamic paths (e.g., `/users/123`) to template paths (e.g., `/users/{id}`).
   
3. **Custom Path Patterns**: Using custom regex patterns specified in `endpoint-patterns.json` for advanced path normalization.
   
4. **Dynamic Pattern Learning**: The service can learn patterns from actual requests (when enabled).
   
5. **Error Tracking**: The service tracks and reports on API errors encountered during testing.
   
6. **HTTP Method Coverage**: The report shows coverage broken down by HTTP method (GET, POST, PUT, DELETE, etc.).

## Configuration Options

The example `wdio.conf.ts` demonstrates these configuration options:

- `openApiPath`: Path to your OpenAPI specification
- `outputPath`: Where to save the coverage report
- `endpointPatternFile`: Path to custom endpoint pattern rules
- `enableDynamicPatternLearning`: Whether to learn patterns from actual requests
- `customPatterns`: Programmatically defined custom patterns
- `logLevel`: Control logging verbosity

## Coverage Report

The generated coverage report includes:

- **Summary**: Overall coverage percentage and endpoint counts
- **Method Coverage**: Coverage broken down by HTTP method
- **Tested Endpoints**: List of all endpoints that were tested
- **Untested Endpoints**: List of endpoints defined in the spec that weren't tested
- **Extra Endpoints**: Endpoints called that weren't defined in the spec
- **Server Errors**: Any server errors encountered during testing

Example report structure:
```json
{
  "summary": {
    "totalEndpoints": 7,
    "testedEndpoints": 5,
    "untestedEndpoints": 2,
    "coveragePercentage": 71.43
  },
  "methodCoverage": {
    "GET": {"total": 4, "tested": 3, "percentage": 75},
    "POST": {"total": 1, "tested": 1, "percentage": 100},
    "PUT": {"total": 1, "tested": 1, "percentage": 100},
    "DELETE": {"total": 1, "tested": 0, "percentage": 0}
  },
  "endpoints": {
    "tested": [
      "GET /users",
      "GET /users/{id}",
      "POST /posts",
      "PUT /posts/{id}",
      "GET /posts"
    ],
    "untested": [
      "POST /users",
      "DELETE /users/{id}"
    ]
  },
  "extraEndpoints": [
    "GET /comments/{id}"
  ],
  "serverErrors": {},
  "timestamp": "2023-06-15T12:34:56.789Z"
}
``` 