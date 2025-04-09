import logger from '@wdio/logger';
import { IOpenAPIDocument, IPathPattern } from '../types/index.js';

// Create a logger instance
const log = logger('openapi:path-normalizer');

/**
 * Normalize paths with parameters
 * Converts dynamic API paths like /api/users/123 to OpenAPI template paths like /api/users/{id}
 *
 * @param path - The original path to normalize
 * @param apiSpec - The OpenAPI specification document
 * @param customPatterns - Optional custom regex patterns for path normalization
 * @returns The normalized path
 */
export function normalizePath(
  path: string,
  apiSpec: IOpenAPIDocument | null,
  customPatterns?: IPathPattern[]
): string {
  if (!path) {
    log.warn('Empty path provided to normalizePath');
    return '';
  }

  // Ensure consistent path format (always start with /)
  const normalizedInputPath = path.startsWith('/') ? path : `/${path}`;

  // 1. Check for exact match in OpenAPI spec first (faster than regex matching)
  if (apiSpec?.paths && apiSpec.paths[normalizedInputPath]) {
    return normalizedInputPath;
  }

  // 1.5. Check if it might match a templated path in the spec (comparing structure)
  if (apiSpec?.paths) {
    const pathSegments = normalizedInputPath.split('/').filter(Boolean);

    // Get all paths from the spec to check for structural matches
    for (const [specPath, pathItem] of Object.entries(apiSpec.paths)) {
      if (!pathItem) {
        continue;
      }

      const specSegments = specPath.split('/').filter(Boolean);

      // Must have same number of segments
      if (pathSegments.length !== specSegments.length) {
        continue;
      }

      // Check if segments match structurally (either exact match or template parameter)
      let isMatch = true;
      for (let i = 0; i < specSegments.length; i++) {
        const specSegment = specSegments[i];
        const pathSegment = pathSegments[i];

        // If spec segment is a parameter, it matches anything in the path
        if (specSegment.startsWith('{') && specSegment.endsWith('}')) {
          continue; // Parameter segment always matches
        }

        // For non-parameter segments, they must match exactly
        if (specSegment !== pathSegment) {
          isMatch = false;
          break;
        }
      }

      if (isMatch) {
        log.debug(
          `Path structurally matched OpenAPI template: ${normalizedInputPath} → ${specPath}`
        );
        return specPath;
      }
    }
  }

  // 2. Try custom and auto-generated patterns
  if (customPatterns && Array.isArray(customPatterns) && customPatterns.length > 0) {
    // Sort patterns by priority (higher values first)
    const sortedPatterns = [...customPatterns]
      .filter((p) => p && typeof p === 'object')
      .sort((a, b) => (b.priority || 0) - (a.priority || 0));

    // Track number of patterns tried for debugging
    let patternsChecked = 0;

    for (const patternObj of sortedPatterns) {
      patternsChecked++;

      if (!patternObj || typeof patternObj !== 'object') {
        continue;
      }

      // Safely extract pattern and template
      const pattern = patternObj.pattern;
      const template = patternObj.template;

      if (!pattern || !template || typeof template !== 'string') {
        continue;
      }

      // Check if pattern is a valid RegExp with test method
      if (!(pattern instanceof RegExp) || typeof pattern.test !== 'function') {
        continue;
      }

      try {
        if (pattern.test(normalizedInputPath)) {
          const result = normalizedInputPath.replace(pattern, template);

          // Check if the resulting path exists in the API spec
          // If it does, this is the canonical form
          if (apiSpec?.paths && apiSpec.paths[result]) {
            log.debug(
              `Pattern matched and found in OpenAPI spec: ${normalizedInputPath} → ${result}`
            );
            return result;
          }

          // Use different log levels based on pattern origin
          if (patternObj.priority === 100) {
            // Custom user-provided pattern (highest priority)
            log.info(
              `Path matched custom pattern (priority ${patternObj.priority}): ${normalizedInputPath} → ${result}`
            );
          } else if (patternObj.priority === 50) {
            // OpenAPI generated pattern
            log.debug(`Path matched OpenAPI pattern: ${normalizedInputPath} → ${result}`);
          } else if (patternObj.priority === 30) {
            // Auto-inferred pattern
            log.debug(`Path matched inferred pattern: ${normalizedInputPath} → ${result}`);
          } else {
            log.debug(
              `Path matched pattern (priority ${patternObj.priority}): ${normalizedInputPath} → ${result}`
            );
          }

          return result;
        }
      } catch (_e) {
        // Skip this pattern if there's an error
      }
    }

    // If we have patterns but none matched, log that for debugging
    if (patternsChecked > 0) {
      log.debug(
        `No patterns matched path: ${normalizedInputPath} (tried ${patternsChecked} patterns)`
      );
    }
  } else {
    log.info(`No patterns available for path normalization: ${normalizedInputPath}`);
  }

  // 3. If all else fails, return the original path
  return normalizedInputPath;
}
