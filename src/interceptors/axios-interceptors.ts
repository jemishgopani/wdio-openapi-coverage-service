import axios, { AxiosResponse, AxiosError, InternalAxiosRequestConfig } from 'axios';
import logger from '@wdio/logger';
import { IServerErrorRecord, IPathPattern } from '../types/index.js';
import { normalizePath } from '../utils/path-normalizer.js';
import { saveHitEndpoints, saveErrors } from '../utils/file-utils.js';
import { IOpenAPIDocument } from '../types/index.js';

// Create a logger instance
const log = logger('openapi:axios-interceptors');

// Export a singleton axios instance that can be imported in tests
export const apiClient = axios.create();

/**
 * Set up all interceptors on axios instances
 */
export function setupInterceptors(
  hitEndpoints: Set<string>,
  endpointErrors: Record<string, IServerErrorRecord>,
  apiSpec: IOpenAPIDocument | null,
  workerId: string,
  hitEndpointsFile: string,
  errorsFile: string,
  customPatterns?: IPathPattern[],
  recordPathCallback?: (path: string) => void
): void {
  log.info('Setting up axios interceptors for request tracking');

  // Set up request interceptor on default axios instance
  axios.interceptors.request.use(
    createRequestInterceptor(
      hitEndpoints,
      apiSpec,
      workerId,
      hitEndpointsFile,
      customPatterns,
      recordPathCallback
    )
  );
  log.info('Set up interceptor on default axios instance');

  // Set up response interceptor on default axios instance
  axios.interceptors.response.use(
    createResponseSuccessInterceptor(),
    createResponseErrorInterceptor(endpointErrors, apiSpec, workerId, errorsFile, customPatterns)
  );
  log.info('Set up response interceptor on default axios instance');

  // Set up request interceptor on our exported instance
  apiClient.interceptors.request.use(
    createRequestInterceptor(
      hitEndpoints,
      apiSpec,
      workerId,
      hitEndpointsFile,
      customPatterns,
      recordPathCallback
    )
  );

  // Set up response interceptor on our exported instance
  apiClient.interceptors.response.use(
    createResponseSuccessInterceptor(),
    createResponseErrorInterceptor(endpointErrors, apiSpec, workerId, errorsFile, customPatterns)
  );
  log.info('Set up interceptor on exported axios instance');
}

/**
 * Create a request interceptor function for tracking API requests
 */
function createRequestInterceptor(
  hitEndpoints: Set<string>,
  apiSpec: IOpenAPIDocument | null,
  workerId: string,
  hitEndpointsFile: string,
  customPatterns?: IPathPattern[],
  recordPathCallback?: (path: string) => void
): (config: InternalAxiosRequestConfig) => InternalAxiosRequestConfig {
  return (config: InternalAxiosRequestConfig): InternalAxiosRequestConfig => {
    try {
      if (!config.url) {
        log.warn('Skipping request tracking: URL is missing from request config');
        return config;
      }

      const url = config.url;
      log.debug(`Intercepted request to: ${url}`);

      let fullUrl;
      try {
        fullUrl = new URL(url);
      } catch (_e) {
        // Handle relative URLs
        const baseUrl = config.baseURL || 'http://localhost';
        fullUrl = new URL(url, baseUrl);
        log.debug(`Converted relative URL to: ${fullUrl.toString()}`);
      }

      let normalizedPath;
      try {
        normalizedPath = normalizePath(fullUrl.pathname, apiSpec, customPatterns);
      } catch (error) {
        log.error(
          `Failed to normalize path '${fullUrl.pathname}': ${error instanceof Error ? error.message : String(error)}`
        );
        normalizedPath = fullUrl.pathname; // Fall back to the original path
      }

      const method = (config.method || 'GET').toUpperCase();
      const key = `${method} ${normalizedPath}`;

      // Log the OpenAPI spec info for debugging
      if (apiSpec) {
        log.debug(`OpenAPI spec version: ${apiSpec.openapi || apiSpec.swagger || 'unknown'}`);
        log.debug(`OpenAPI spec has ${Object.keys(apiSpec.paths || {}).length} paths`);
      } else {
        log.debug('No OpenAPI spec available');
      }

      // Apply improved deduplication logic
      if (key.includes('{') && key.includes('}')) {
        // This is a template endpoint

        // Add the template endpoint
        hitEndpoints.add(key);

        // Find and remove any concrete endpoints that match this template
        const endpointsToRemove: string[] = [];

        hitEndpoints.forEach((existingEndpoint) => {
          // Skip if it's not a concrete endpoint (it's another template)
          if (existingEndpoint.includes('{') && existingEndpoint.includes('}')) {
            return;
          }

          // Check if this concrete endpoint matches our template
          if (endpointMatchesTemplate(existingEndpoint, key)) {
            endpointsToRemove.push(existingEndpoint);
          }
        });

        // Remove the matching concrete endpoints
        for (const endpoint of endpointsToRemove) {
          hitEndpoints.delete(endpoint);
        }
      } else {
        // This is a concrete endpoint

        // Check if a template version already exists that matches this endpoint
        let hasMatchingTemplate = false;

        for (const existingEndpoint of hitEndpoints) {
          // Skip if it's not a template
          if (!existingEndpoint.includes('{') || !existingEndpoint.includes('}')) {
            continue;
          }

          // Check if this template matches our concrete endpoint
          if (endpointMatchesTemplate(key, existingEndpoint)) {
            hasMatchingTemplate = true;
            break;
          }
        }

        // Only add if no matching template exists
        if (!hasMatchingTemplate) {
          hitEndpoints.add(key);
        }
      }

      // Log at debug level rather than info to reduce noise
      if (normalizedPath !== fullUrl.pathname) {
        log.debug(
          `Worker ${workerId} captured API request: ${key} (normalized from ${fullUrl.pathname})`
        );
      } else {
        log.debug(`Worker ${workerId} captured API request: ${key}`);
      }

      saveHitEndpoints(hitEndpointsFile, hitEndpoints, workerId);

      // Also record the original path for pattern learning if callback is provided
      if (recordPathCallback) {
        // Record the original path for pattern learning
        recordPathCallback(fullUrl.pathname);

        // Log less frequently to reduce verbosity
        if (hitEndpoints.size % 100 === 0) {
          log.info(`Worker ${workerId} has captured ${hitEndpoints.size} API requests so far`);
        }
      }
    } catch (err) {
      if (err instanceof Error) {
        log.error('Error in axios interceptor:', err.message);
      } else {
        log.error('Error in axios interceptor:', String(err));
      }
    }

    return config;
  };
}

/**
 * Helper function to determine if a concrete endpoint matches a template
 */
function endpointMatchesTemplate(concreteEndpoint: string, templateEndpoint: string): boolean {
  const [concreteMethod, concretePath] = concreteEndpoint.split(' ', 2);
  const [templateMethod, templatePath] = templateEndpoint.split(' ', 2);

  // Methods must match
  if (concreteMethod !== templateMethod) {
    return false;
  }

  // Split paths into segments
  const concreteSegments = concretePath.split('/').filter(Boolean);
  const templateSegments = templatePath.split('/').filter(Boolean);

  // Must have same number of segments
  if (concreteSegments.length !== templateSegments.length) {
    return false;
  }

  // Compare each segment
  for (let i = 0; i < templateSegments.length; i++) {
    const templateSegment = templateSegments[i];
    const concreteSegment = concreteSegments[i];

    // If template segment is a parameter, it matches anything
    if (templateSegment.startsWith('{') && templateSegment.endsWith('}')) {
      // Check if concrete segment looks like a MongoDB ID
      if (/^[0-9a-f]{24}$/.test(concreteSegment)) {
        continue; // Match - parameter with MongoDB ID
      }

      // For other parameter types, we'll just assume it's a match
      continue;
    }

    // For non-parameter segments, they must match exactly
    if (templateSegment !== concreteSegment) {
      return false;
    }
  }

  // All segments matched
  return true;
}

/**
 * Create a response success interceptor function
 */
function createResponseSuccessInterceptor(): (response: AxiosResponse) => AxiosResponse {
  return (response: AxiosResponse): AxiosResponse => {
    // Just pass through successful responses
    return response;
  };
}

/**
 * Create a response error interceptor function for tracking server errors
 */
function createResponseErrorInterceptor(
  endpointErrors: Record<string, IServerErrorRecord>,
  apiSpec: IOpenAPIDocument | null,
  workerId: string,
  errorsFile: string,
  customPatterns?: IPathPattern[]
): (error: AxiosError) => Promise<never> {
  return (error: AxiosError): Promise<never> => {
    try {
      if (error.response) {
        const { status, config } = error.response;

        // Only track internal server errors (5xx)
        if (status >= 500 && status < 600) {
          const url = config.url || '';
          let fullUrl;

          try {
            fullUrl = new URL(url || '', config.baseURL || 'http://localhost');
          } catch (_e) {
            // Handle relative URLs
            const baseUrl = config.baseURL || 'http://localhost';
            fullUrl = new URL(url || '', baseUrl);
          }

          let normalizedPath;
          try {
            normalizedPath = normalizePath(fullUrl.pathname, apiSpec, customPatterns);
          } catch (error) {
            log.error(
              `Failed to normalize path '${fullUrl.pathname}' in error interceptor: ${error instanceof Error ? error.message : String(error)}`
            );
            normalizedPath = fullUrl.pathname; // Fall back to the original path
          }

          const method = (config.method || 'GET').toUpperCase();
          const key = `${method} ${normalizedPath}`;

          // Check if we have a template version of this endpoint
          let templateKey = key;

          if (!key.includes('{') && !key.includes('}')) {
            // This is a concrete endpoint, let's see if we have a template version
            for (const existingKey of Object.keys(endpointErrors)) {
              if (
                existingKey.includes('{') &&
                existingKey.includes('}') &&
                endpointMatchesTemplate(key, existingKey)
              ) {
                templateKey = existingKey;
                break;
              }
            }
          }

          // Initialize error record if it doesn't exist
          if (!endpointErrors[templateKey]) {
            endpointErrors[templateKey] = {
              count: 0,
              statusCodes: {},
            };
          }

          // Update error counts
          endpointErrors[templateKey].count++;

          // Update status code counts
          const statusStr = status.toString();
          endpointErrors[templateKey].statusCodes[statusStr] =
            (endpointErrors[templateKey].statusCodes[statusStr] || 0) + 1;

          // Store the last error message
          if (error.message) {
            endpointErrors[templateKey].lastError = error.message.substring(0, 200); // Limit size
          }

          // Log at debug level rather than info to reduce noise
          if (normalizedPath !== fullUrl.pathname) {
            log.debug(
              `Worker ${workerId} captured internal server error: ${key} (normalized from ${fullUrl.pathname}) (${status})`
            );
          } else {
            log.debug(`Worker ${workerId} captured internal server error: ${key} (${status})`);
          }

          // Save errors to file
          saveErrors(errorsFile, endpointErrors, workerId);
        }
      }
    } catch (err) {
      if (err instanceof Error) {
        log.error('Error in axios response interceptor:', err.message);
      } else {
        log.error('Error in axios response interceptor:', String(err));
      }
    }

    // Rethrow the error for the calling code
    return Promise.reject(error);
  };
}
