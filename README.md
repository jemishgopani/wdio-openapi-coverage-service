# WebdriverIO OpenAPI Coverage Service

[![npm version](https://img.shields.io/npm/v/wdio-openapi-service.svg)](https://www.npmjs.com/package/wdio-openapi-service)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Build Status](https://img.shields.io/github/actions/workflow/status/humaorg/wdio-openapi-service/build.yml?branch=main)](https://github.com/humaorg/wdio-openapi-service/actions)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)](https://www.typescriptlang.org/)
[![WebdriverIO](https://img.shields.io/badge/WebdriverIO-8.x-orange)](https://webdriver.io/)

A powerful WebdriverIO service for tracking, analyzing, and reporting API coverage based on OpenAPI/Swagger specifications. Ensure your automated tests are covering your API endpoints effectively.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
  - [Options](#options)
  - [Endpoint Pattern File](#endpoint-pattern-file)
  - [Custom Patterns](#custom-patterns)
- [API Coverage Report](#api-coverage-report)
- [Path Normalization](#path-normalization)
- [Examples](#examples)
- [FAQ](#faq)
- [Contributing](#contributing)
- [License](#license)

## Features

🔍 **Complete API Coverage Tracking**
- Track all API requests made during WebdriverIO test runs
- Match requests against OpenAPI/Swagger specification endpoints
- Support for OpenAPI 3.0 and Swagger 2.0 specifications

📊 **Comprehensive Reporting**
- Generate detailed coverage reports in JSON format
- Break down coverage by HTTP method (GET, POST, PUT, DELETE, etc.)
- Track untested and partially tested endpoints
- Monitor server errors (4xx/5xx) encountered during testing

🔄 **Advanced Path Normalization**
- Automatically convert dynamic paths (e.g., `/users/123`) to template paths (e.g., `/users/{id}`)
- Define custom patterns for path normalization
- Dynamic pattern learning from API requests

⚡ **Optimized for CI/CD**
- Support for parallel test execution with worker coordination
- Compatible with GitHub Actions, Jenkins, CircleCI, and other CI systems
- Detailed logging for troubleshooting

## Installation

```bash
npm install --save-dev wdio-openapi-service
```

## Quick Start

1. Install the package:

```bash
npm install --save-dev wdio-openapi-service
```

2. Add the service to your `wdio.conf.js` or `wdio.conf.ts` file:

```javascript

export const config = {
  // ...other WebdriverIO config
  services: [
    ['openapi', {
      openApiPath: './openapi.yaml',
      outputPath: './reports/api-coverage.json'
    }]
  ],
  // ...
};
```

3. Use the provided `apiClient` in your tests to make API calls:

```javascript
import { apiClient } from 'wdio-openapi-service';

describe('API Tests', () => {
  it('should retrieve user data', async () => {
    const response = await apiClient.get('https://api.example.com/users/1');
    expect(response.status).toBe(200);
  });
});
```

4. After running your tests, check the generated coverage report at `./reports/api-coverage.json`.

## Configuration

### Options

| Option | Type | Description | Default |
|--------|------|-------------|---------|
| `openApiPath` | string | Path to your OpenAPI/Swagger specification file | Auto-detected |
| `outputPath` | string | Where to save the coverage report | `./api-coverage-report.json` |
| `logLevel` | string | Logging level: 'trace', 'debug', 'info', 'warn', 'error', 'silent' | `'info'` |
| `endpointPatternFile` | string | Path to custom endpoint pattern rules file | - |
| `enableDynamicPatternLearning` | boolean | Whether to learn patterns from actual requests | `true` |
| `customPatterns` | array | Programmatically defined custom patterns | `[]` |

Example configuration with all options:

```javascript
services: [
  ['openapi', {
    openApiPath: './openapi.yaml',
    outputPath: './reports/api-coverage.json',
    logLevel: 'info',
    endpointPatternFile: './endpoint-patterns.json',
    enableDynamicPatternLearning: true,
    customPatterns: [
      {
        pattern: new RegExp('/users/\\d+'),
        template: '/users/{id}',
        priority: 100
      }
    ]
  }]
]
```

### Endpoint Pattern File

The `endpointPatternFile` option allows you to define custom patterns for normalizing API paths with dynamic segments like IDs to their template equivalents.

Create a JSON file with this structure:

```json
[
  {
    "pattern": "/users/(\\d+)",
    "replace": "id"
  },
  {
    "pattern": "/products/(\\d+)/reviews",
    "replace": "product_id/reviews"
  }
]
```

Each pattern consists of:
- `pattern`: A regex pattern string to match parts of the URL path
- `replace`: The parameter name or path segment to replace the matched portion

### Custom Patterns

You can also define patterns programmatically:

```javascript
customPatterns: [
  {
    pattern: new RegExp('/comments/\\d+'),
    template: '/comments/{id}',
    priority: 100 // Higher priority than auto-generated patterns
  }
]
```

## API Coverage Report

The generated coverage report includes:

- **Summary**: Overall coverage percentage and endpoint counts
- **Method Coverage**: Coverage broken down by HTTP method
- **Tested Endpoints**: List of all endpoints that were tested
- **Untested Endpoints**: List of endpoints defined in the spec that weren't tested
- **Extra Endpoints**: Endpoints called that weren't defined in the spec
- **Server Errors**: Any server errors encountered during testing

Example report:

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

## Path Normalization

Path normalization converts dynamic paths like `/users/123` to template paths like `/users/{id}` for proper coverage reporting. This is done through three mechanisms:

1. **OpenAPI-based**: Paths defined in your OpenAPI specification are used as templates
2. **Custom patterns**: You can define custom regex patterns for specific endpoints
3. **Dynamic learning**: The service can automatically detect patterns in your API calls

## Examples

A complete example project is available in the [example](example) directory.

Check out the [example/README.md](example/README.md) for details on how to run the example project.

## FAQ

### How does path normalization work?

Path normalization converts concrete API paths (e.g., `/users/123`) to template paths (e.g., `/users/{id}`). This is essential for accurate coverage reporting. The service uses three sources of patterns:

1. Your OpenAPI specification
2. Custom patterns you define
3. Patterns learned dynamically from your API requests

### Can I use this with other API testing frameworks?

Yes, as long as you're using WebdriverIO as your test runner. The service provides an `apiClient` (based on Axios) that automatically tracks requests for coverage reporting.

### How do I handle authentication?

Use the `apiClient` to make authenticated requests:

```javascript
// Set up authentication headers
apiClient.defaults.headers.common['Authorization'] = `Bearer ${token}`;

// Make authenticated requests
const response = await apiClient.get('/protected-resource');
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes using conventional commits (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.