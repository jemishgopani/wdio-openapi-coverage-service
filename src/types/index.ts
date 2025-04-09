import type { Options } from '@wdio/types';

/**
 * Define a simplified OpenAPI document type since the imported types are causing issues
 */
export interface IOpenAPIDocument {
  openapi?: string;
  swagger?: string;
  paths: Record<string, IPathItem>;
  components?: {
    parameters?: Record<string, IParameterObject>;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

/**
 * Parameter object in OpenAPI spec
 */
export interface IParameterObject {
  name?: string;
  in?: string;
  description?: string;
  required?: boolean;
  schema?: ISchemaObject;
  $ref?: string;
  [key: string]: unknown;
}

/**
 * Schema object in OpenAPI spec
 */
export interface ISchemaObject {
  type?: string;
  format?: string;
  pattern?: string;
  enum?: Array<string | number>;
  [key: string]: unknown;
}

/**
 * Path item in OpenAPI spec
 */
export interface IPathItem {
  description?: string;
  summary?: string;
  parameters?: IParameterObject[];
  get?: IOperationObject;
  put?: IOperationObject;
  post?: IOperationObject;
  delete?: IOperationObject;
  patch?: IOperationObject;
  options?: IOperationObject;
  head?: IOperationObject;
  trace?: IOperationObject;
  [key: string]: unknown;
}

/**
 * Operation object in OpenAPI spec
 */
export interface IOperationObject {
  tags?: string[];
  summary?: string;
  description?: string;
  parameters?: IParameterObject[];
  responses?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Define an interface for server error tracking
 */
export interface IServerErrorRecord {
  count: number;
  statusCodes: Record<string, number>;
  lastError?: string;
}

/**
 * Define error record for merging from files
 */
export interface IErrorFileRecord {
  count?: number;
  statusCodes?: Record<string, number>;
  lastError?: string;
}

/**
 * Pattern definition for custom path normalization
 */
export interface IPathPattern {
  pattern: RegExp; // Regex pattern to match against URLs
  template: string; // Template to use for replacement
  priority?: number; // Optional priority (higher numbers match first)
}

/**
 * Extended options interface for the service
 */
export interface IOpenAPICoverageOptions {
  openApiPath?: string; // Path to OpenAPI specification
  outputPath?: string; // Path for coverage report output
  customPatterns?: IPathPattern[]; // Optional custom patterns (will be merged with auto-generated)
  enableDynamicPatternLearning?: boolean; // Enable learning patterns from API requests (default: true)
  endpointPatternFile?: string; // Path to JSON file containing endpoint pattern matching rules
}

/**
 * Endpoint pattern for matching and replacing in paths
 */
export interface IEndpointPattern {
  pattern: string; // Regex pattern as a string to match parts of URLs
  replace: string; // The replacement parameter name (without {} brackets)
}

/**
 * Combined service options type
 */
export type TServiceOptions = IOpenAPICoverageOptions & Options.Testrunner;

/**
 * Method coverage statistics
 */
export interface IMethodCoverage {
  total: number;
  tested: number;
  percentage: number;
}

/**
 * Server error statistics
 */
export interface IServerErrorStats {
  totalServerErrors: number;
  statusCodeCounts: Record<string, number>;
  errorsByEndpoint: Array<{
    endpoint: string;
    count: number;
  }>;
}

/**
 * Coverage report format
 */
export interface ICoverageReport {
  summary: {
    totalEndpoints: number;
    testedEndpoints: number;
    untestedEndpoints: number;
    coveragePercentage: number;
  };
  methodCoverage: Record<string, IMethodCoverage>;
  serverErrorStats: IServerErrorStats;
  endpoints: {
    tested: string[];
    untested: string[];
  };
  extraEndpoints?: string[];
  serverErrors: Record<string, IServerErrorRecord>;
  timestamp: string;
}
