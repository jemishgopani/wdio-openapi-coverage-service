import SwaggerParser from '@apidevtools/swagger-parser';
import { existsSync } from 'node:fs';
import logger from '@wdio/logger';
import {
  IOpenAPIDocument,
  IPathPattern,
  IParameterObject,
  IPathItem,
  IOperationObject,
} from '../types/index.js';
import { getPossibleOpenApiPaths } from '../utils/file-utils.js';

// Create a logger instance
const log = logger('openapi:processor');

/**
 * Load and parse the OpenAPI specification
 */
export async function loadOpenApiSpec(customPath?: string): Promise<IOpenAPIDocument | null> {
  const possiblePaths = getPossibleOpenApiPaths(customPath);

  log.info(`Looking for OpenAPI spec in these locations: ${possiblePaths.join(', ')}`);

  for (const specPath of possiblePaths) {
    if (existsSync(specPath)) {
      log.info(`Found OpenAPI spec at: ${specPath}`);
      try {
        // Parse the OpenAPI/Swagger document
        const apiSpec = (await SwaggerParser.parse(specPath)) as IOpenAPIDocument;
        const version = apiSpec.openapi || apiSpec.swagger || 'unknown';
        log.info(`Successfully parsed OpenAPI spec (version: ${version})`);

        // Log the available paths for debugging
        if (apiSpec.paths) {
          const pathsCount = Object.keys(apiSpec.paths).length;
          log.info(`OpenAPI spec contains ${pathsCount} paths`);
          if (pathsCount > 0) {
            log.info(`First 10 paths: ${Object.keys(apiSpec.paths).slice(0, 10).join(', ')}`);
          } else {
            log.warn('OpenAPI spec contains no paths!');
          }
        } else {
          log.warn('OpenAPI spec has no paths property!');
        }

        return apiSpec;
      } catch (err) {
        log.error(`Failed to parse OpenAPI spec at ${specPath}:`, err);
      }
    }
  }

  log.error('Could not find a valid OpenAPI spec in any of the expected locations');
  return null;
}

/**
 * Extract endpoints from the OpenAPI spec
 */
export function extractEndpointsFromSpec(apiSpec: IOpenAPIDocument | null): Set<string> {
  const specEndpoints = new Set<string>();

  if (!apiSpec || !apiSpec.paths) {
    log.error('Invalid API spec - no paths found');
    return specEndpoints;
  }

  for (const [pathKey, pathItem] of Object.entries(apiSpec.paths)) {
    if (!pathItem) {
      continue;
    } // Skip null/undefined path items

    // Get all HTTP methods defined for this path
    const methods = Object.keys(pathItem).filter((key) =>
      ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'].includes(
        key.toLowerCase()
      )
    );

    for (const method of methods) {
      specEndpoints.add(`${method.toUpperCase()} ${pathKey}`);
    }
  }

  log.info(`Total Spec Endpoints: ${specEndpoints.size}`);

  return specEndpoints;
}

/**
 * Generate path normalization patterns from OpenAPI spec
 * This creates RegExp patterns that can match actual API calls to their OpenAPI template paths
 * e.g., /users/123 will be matched to /users/{id}
 */
export function generatePathPatterns(apiSpec: IOpenAPIDocument | null): IPathPattern[] {
  if (!apiSpec || !apiSpec.paths) {
    log.warn('Cannot generate patterns: Invalid or empty API spec');
    return [];
  }

  const patterns: IPathPattern[] = [];
  const specPaths = Object.keys(apiSpec.paths);

  log.debug(`Generating path patterns from ${specPaths.length} OpenAPI paths`);

  // Create a map of parameter definitions from components
  const parameterDefinitions = new Map<string, IParameterObject>();
  if (apiSpec.components && apiSpec.components.parameters) {
    Object.entries(apiSpec.components.parameters).forEach(([name, paramDef]) => {
      parameterDefinitions.set(name, paramDef);
    });
    log.debug(`Loaded ${parameterDefinitions.size} parameter definitions from components`);
  }

  for (const templatePath of specPaths) {
    // Skip paths without parameters
    if (!templatePath.includes('{')) {
      continue;
    }

    try {
      // Get path item to extract parameter information
      const pathItem = apiSpec.paths[templatePath];
      if (!pathItem) {
        continue;
      }

      // Collect parameters from all operations on this path
      // First, get path-level parameters
      const pathParameters = pathItem.parameters || [];

      // Then collect all operation-level parameters
      const allParameters: IParameterObject[] = [...pathParameters];

      // Add operation-specific parameters
      ['get', 'post', 'put', 'delete', 'patch', 'options', 'head'].forEach((method) => {
        const operation = pathItem[method as keyof IPathItem] as IOperationObject | undefined;
        if (operation?.parameters) {
          allParameters.push(...operation.parameters);
        }
      });

      // Extract parameter names and their schemas if available
      const paramInfoMap = new Map<
        string,
        {
          type?: string;
          format?: string;
          pattern?: string;
          enum?: Array<string | number>;
        }
      >();

      // Extract parameter names from template path
      const paramNames = [...templatePath.matchAll(/{([^}]+)}/g)].map((match) => match[1]);

      // For each parameter in the path, find its definition
      for (const paramName of paramNames) {
        // Look for parameter in the collected parameters
        const paramDef = allParameters.find((p) => p.name === paramName);

        if (paramDef && paramDef.schema) {
          // Use direct parameter definition
          paramInfoMap.set(paramName, {
            type: paramDef.schema.type,
            format: paramDef.schema.format,
            pattern: paramDef.schema.pattern,
            enum: paramDef.schema.enum,
          });
        } else if (paramDef && paramDef.$ref) {
          // Handle parameter reference
          const refName = paramDef.$ref.split('/').pop();
          if (refName) {
            const refParamDef = parameterDefinitions.get(refName);
            if (refParamDef && refParamDef.schema) {
              paramInfoMap.set(paramName, {
                type: refParamDef.schema.type,
                format: refParamDef.schema.format,
                pattern: refParamDef.schema.pattern,
                enum: refParamDef.schema.enum,
              });
            }
          }
        }
      }

      // Generate regex pattern for this path based on parameter types
      let patternString = templatePath;

      // Replace each parameter with an appropriate pattern based on its type
      for (const paramName of paramNames) {
        const paramInfo = paramInfoMap.get(paramName);
        let paramPattern = '([^/]+)'; // Default pattern

        if (paramInfo) {
          // Use type-specific patterns when available
          if (paramInfo.pattern) {
            // Use the schema's pattern directly if available
            paramPattern = `(${paramInfo.pattern})`;
          } else if (paramInfo.enum && paramInfo.enum.length > 0) {
            // For enums, create a pattern that matches any of the enum values
            paramPattern = `(${paramInfo.enum.map(String).join('|')})`;
          } else if (paramInfo.type === 'integer' || paramInfo.type === 'number') {
            paramPattern = '(\\d+)';
          } else if (paramInfo.format === 'uuid') {
            paramPattern = '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})';
          } else if (paramInfo.format === 'date') {
            paramPattern = '(\\d{4}-\\d{2}-\\d{2})';
          } else if (paramInfo.format === 'date-time') {
            paramPattern =
              '(\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?(Z|[+-]\\d{2}:\\d{2}))';
          } else if (paramInfo.type === 'string' && paramName.toLowerCase().includes('id')) {
            // Special case for IDs - could be numeric or UUID or MongoDB ObjectId
            paramPattern =
              '([0-9a-f]{24}|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|\\d+)';
          }
        }

        // Replace the parameter placeholder with the regex pattern
        patternString = patternString.replace(new RegExp(`\\{${paramName}\\}`, 'g'), paramPattern);
      }

      // Finalize the pattern string
      patternString = `^${patternString.replace(/\//g, '\\/')}$`;

      // Create the final regex pattern
      const pattern = new RegExp(patternString);

      // Add pattern to our collection
      patterns.push({
        pattern,
        template: templatePath,
        priority: 50, // Medium priority - users can override with custom patterns
      });

      log.debug(`Created pattern for ${templatePath}: ${pattern}`);
    } catch (error) {
      log.error(
        `Failed to create pattern for path ${templatePath}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  log.debug(`Successfully generated ${patterns.length} path normalization patterns`);
  return patterns;
}

/**
 * Infers additional path patterns from a collection of API requests
 * This allows the system to learn and adapt to actual API usage patterns
 * @param paths Array of paths from actual API requests
 * @param existingPatterns Existing patterns to avoid duplicates
 * @returns Array of inferred path patterns
 */
export function inferPatternsFromRequests(
  paths: string[],
  existingPatterns: IPathPattern[]
): IPathPattern[] {
  if (!paths || paths.length < 2) {
    return [];
  }

  log.debug(`Analyzing ${paths.length} API request paths to infer patterns`);

  // Group similar paths together - use a more sophisticated approach
  const pathGroups = groupSimilarPaths(paths);

  const inferredPatterns: IPathPattern[] = [];
  let patternCount = 0;

  // For each group of similar paths, create a pattern
  for (const [groupKey, groupPaths] of pathGroups.entries()) {
    // Only consider groups with multiple paths (more likely to be a pattern)
    if (groupPaths.length < 2) {
      continue;
    }

    try {
      // First verify if these paths are already handled by existing patterns
      const alreadyCovered = arePathsCoveredByPatterns(groupPaths, existingPatterns);
      if (alreadyCovered) {
        // Skip this group if all paths are already covered by existing patterns
        continue;
      }

      // Create the pattern
      const pattern = createPatternFromGroup(groupKey, groupPaths);
      if (pattern) {
        inferredPatterns.push(pattern);
        patternCount++;

        // Log information about the pattern
        if (patternCount <= 3) {
          // Only log details for the first few patterns to avoid excessive logging
          log.info(`Inferred pattern: ${pattern.template} from paths like ${groupPaths[0]}`);
        }
      }
    } catch (error) {
      // Skip this pattern group if there's an error
      log.debug(
        `Error creating pattern for group: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  if (inferredPatterns.length > 0) {
    log.info(
      `Successfully inferred ${inferredPatterns.length} new patterns from ${paths.length} API paths`
    );
  }
  return inferredPatterns;
}

/**
 * Group similar paths together using path structure analysis
 */
function groupSimilarPaths(paths: string[]): Map<string, string[]> {
  const pathGroups = new Map<string, string[]>();

  for (const path of paths) {
    // Split the path into segments
    const segments = path.startsWith('/') ? path.slice(1).split('/') : path.split('/');

    // Remove empty segments
    const nonEmptySegments = segments.filter(Boolean);

    // Create a signature that captures the structure
    const signature = nonEmptySegments
      .map((segment) => {
        // Try to identify different types of IDs
        if (/^\d+$/.test(segment)) {
          return '{number}';
        }
        if (/^[0-9a-f]{24}$/i.test(segment)) {
          return '{objectId}';
        }
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)) {
          return '{uuid}';
        }
        if (/^[0-9a-f]{12,40}$/i.test(segment)) {
          return '{hash}';
        }
        // Special handling for API versioning
        if (/^v\d+$/.test(segment)) {
          return segment; // Keep API version segments as-is
        }
        // Special handling for common resource names
        if (
          /^(users|products|orders|items|posts|comments|auth|login|categories|tags|api)$/i.test(
            segment
          )
        ) {
          return segment.toLowerCase();
        }
        // Dynamic tokens that might be IDs or identifiers
        if (segment.length > 20 || /[A-F0-9]{8,}|[-_]/.test(segment)) {
          return '{token}';
        }
        return segment;
      })
      .join('/');

    // Add this path to its group
    if (!pathGroups.has(signature)) {
      pathGroups.set(signature, []);
    }
    pathGroups.get(signature)?.push(path);
  }

  return pathGroups;
}

/**
 * Check if a group of paths is already covered by existing patterns
 */
function arePathsCoveredByPatterns(paths: string[], patterns: IPathPattern[]): boolean {
  if (!patterns || patterns.length === 0) {
    return false;
  }

  // For the path group to be considered covered, all paths must match at least one pattern
  return paths.every((path) => {
    return patterns.some((pattern) => {
      try {
        return pattern.pattern.test(path);
      } catch (_e) {
        return false;
      }
    });
  });
}

/**
 * Create a pattern object from a group of similar paths
 */
function createPatternFromGroup(groupKey: string, paths: string[]): IPathPattern | null {
  if (paths.length < 2) {
    return null;
  }

  // Analyze the paths to determine which segments are variable
  const segments = paths[0].split('/').filter(Boolean);
  const variableSegments = new Set<number>();

  // Identify segments that vary across paths
  for (let i = 0; i < segments.length; i++) {
    const segmentValues = new Set(paths.map((p) => p.split('/').filter(Boolean)[i]));

    if (segmentValues.size > 1) {
      variableSegments.add(i);
    }
  }

  // Create regex pattern segments
  const patternSegments = segments.map((segment, index) => {
    if (variableSegments.has(index)) {
      // Check the nature of this segment to create an appropriate matcher
      const allSegments = paths.map((p) => p.split('/').filter(Boolean)[index]);

      // Check if all values are numeric
      if (allSegments.every((s) => /^\d+$/.test(s))) {
        return '(\\d+)';
      }

      // Check if all values are UUIDs
      if (
        allSegments.every((s) =>
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
        )
      ) {
        return '([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})';
      }

      // Check if all values are MongoDB ObjectIDs
      if (allSegments.every((s) => /^[0-9a-f]{24}$/i.test(s))) {
        return '([0-9a-f]{24})';
      }

      // Default to a generic segment matcher
      return '([^/]+)';
    }

    // Keep static segments as-is
    return segment;
  });

  // Create template segments for the normalized path
  const templateSegments = segments.map((segment, index) => {
    if (variableSegments.has(index)) {
      // Sample values from this segment
      const sampleValues = paths.slice(0, 3).map((p) => p.split('/').filter(Boolean)[index]);

      // Try to infer the parameter type
      if (sampleValues.every((s) => /^\d+$/.test(s))) {
        return '{id}';
      }
      if (
        sampleValues.every((s) =>
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
        )
      ) {
        return '{uuid}';
      }
      if (sampleValues.every((s) => /^[0-9a-f]{24}$/i.test(s))) {
        return '{id}';
      }

      // Look at the previous segment to infer parameter name
      if (index > 0) {
        const prevSegment = segments[index - 1].toLowerCase();
        if (/^(user|product|order|item|post|comment|category|tag)s?$/.test(prevSegment)) {
          return `{${prevSegment.replace(/s$/, '')}_id}`;
        }
      }

      // Default parameter name
      return '{param}';
    }

    return segment;
  });

  try {
    // Construct the full pattern and template
    const patternString = `^/${patternSegments.join('/')}$`;
    const template = `/${templateSegments.join('/')}`;

    const pattern = new RegExp(patternString);

    return {
      pattern,
      template,
      priority: 30, // Lower priority than OpenAPI-derived patterns
    };
  } catch (error) {
    log.error(
      `Failed to create pattern for path group: ${error instanceof Error ? error.message : String(error)}`
    );
    return null;
  }
}
