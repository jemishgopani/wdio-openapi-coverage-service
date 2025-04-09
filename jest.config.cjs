/**
 * Jest configuration for OpenAPI Coverage Service tests
 * Uses ESM mode for proper compatibility with the ES module format of the service
 */
module.exports = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  testMatch: ['**/tests/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        isolatedModules: true,
        tsconfig: {
          // Override tsconfig options for tests
          target: "ES2022",
          module: "NodeNext"
        }
      },
    ],
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  // Make Jest handle mocking of ES modules properly
  transformIgnorePatterns: [
    'node_modules/(?!(.*\\.mjs$))'
  ],
}; 