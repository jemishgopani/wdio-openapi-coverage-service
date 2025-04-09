import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  existsSync,
  mkdirSync,
  readFileSync as _readFileSync,
  readdirSync as _readdirSync,
  writeFileSync,
  unlinkSync as _unlinkSync,
} from 'node:fs';
import { join, resolve, dirname as _dirname } from 'node:path';
import logger from '@wdio/logger';
import { IServerErrorRecord } from '../types/index.js';

// Create a logger instance
const log = logger('openapi:file-utils');

/**
 * Constants for directory paths
 */
export const TEMP_DIR = join(process.cwd(), '.temp');
export const COVERAGE_DIR = join(TEMP_DIR, 'openapi');

/**
 * Get the current directory path for ES modules
 */
export function getCurrentDir(): string {
  const __filename = fileURLToPath(import.meta.url);
  return path.dirname(__filename);
}

/**
 * Ensure temporary directories exist for storing coverage data
 */
export function ensureTempDirs(): void {
  // Create base temp directory if it doesn't exist
  if (!existsSync(TEMP_DIR)) {
    try {
      mkdirSync(TEMP_DIR, { recursive: true });
      log.info(`Created temp directory: ${TEMP_DIR}`);
    } catch (err) {
      log.error(`Failed to create temp directory: ${TEMP_DIR}`, err);
    }
  }

  // Delete the coverage directory if it exists and recreate it fresh
  if (existsSync(COVERAGE_DIR)) {
    try {
      // Delete the directory and all its contents
      fs.rmSync(COVERAGE_DIR, { recursive: true, force: true });
      log.info(`Deleted existing coverage directory: ${COVERAGE_DIR}`);
    } catch (err) {
      log.error(`Failed to delete coverage directory: ${COVERAGE_DIR}`, err);
    }
  }

  // Create coverage directory
  try {
    mkdirSync(COVERAGE_DIR, { recursive: true });
    log.info(`Created coverage directory: ${COVERAGE_DIR}`);
  } catch (err) {
    log.error(`Failed to create coverage directory: ${COVERAGE_DIR}`, err);
  }
}

/**
 * Save an array of hit endpoints to a file
 */
export function saveHitEndpoints(
  filePath: string,
  endpoints: Set<string>,
  _workerId: string
): void {
  try {
    // Deduplicate endpoints before saving - create a new set to avoid modifying the original
    const dedupedEndpoints = new Set<string>();

    // Group endpoints by method
    const endpointsByMethod = new Map<string, string[]>();

    // First pass: group all endpoints by HTTP method
    for (const endpoint of endpoints) {
      const [method, path] = endpoint.split(' ', 2);
      if (!path) {
        continue;
      }

      if (!endpointsByMethod.has(method)) {
        endpointsByMethod.set(method, []);
      }
      endpointsByMethod.get(method)?.push(endpoint);
    }

    // Second pass: deduplicate within each method group
    for (const [_method, methodEndpoints] of endpointsByMethod.entries()) {
      // First add all template endpoints
      const templateEndpoints = methodEndpoints.filter((e) => e.includes('{') && e.includes('}'));

      // Track concrete endpoints that have been handled
      const handledConcreteEndpoints = new Set<string>();

      // Add all template endpoints first
      for (const templateEndpoint of templateEndpoints) {
        // Add the template endpoint
        dedupedEndpoints.add(templateEndpoint);

        // Find and mark any concrete endpoints that match this template
        for (const concreteEndpoint of methodEndpoints) {
          if (concreteEndpoint.includes('{') && concreteEndpoint.includes('}')) {
            // Skip other template endpoints
            continue;
          }

          // Check if this concrete endpoint matches the template structure
          if (endpointMatchesTemplate(concreteEndpoint, templateEndpoint)) {
            handledConcreteEndpoints.add(concreteEndpoint);
          }
        }
      }

      // Add any remaining concrete endpoints that didn't match any template
      for (const concreteEndpoint of methodEndpoints) {
        if (
          !handledConcreteEndpoints.has(concreteEndpoint) &&
          !concreteEndpoint.includes('{') &&
          !concreteEndpoint.includes('}')
        ) {
          dedupedEndpoints.add(concreteEndpoint);
        }
      }
    }

    // Convert the set to an array
    const endpointsArray = [...dedupedEndpoints];

    // Write the deduplicated endpoints to the file
    writeFileSync(filePath, JSON.stringify(endpointsArray, null, 2));
  } catch (err) {
    log.error(`Failed to write hit endpoints to file: ${filePath}`, err);
  }
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
 * Save endpoint errors to a file
 */
export function saveErrors(
  filePath: string,
  errors: Record<string, IServerErrorRecord>,
  _workerId: string
): void {
  try {
    // Deduplicate errors by preferring template versions
    const dedupedErrors: Record<string, IServerErrorRecord> = {};

    // First collect all template endpoint errors
    const templateKeys: string[] = [];
    for (const key of Object.keys(errors)) {
      if (key.includes('{') && key.includes('}')) {
        templateKeys.push(key);
        dedupedErrors[key] = errors[key];
      }
    }

    // Then add concrete endpoints only if no matching template exists
    for (const key of Object.keys(errors)) {
      if (key.includes('{') && key.includes('}')) {
        // Skip templates, already added
        continue;
      }

      // Check if a matching template exists
      let hasMatchingTemplate = false;
      for (const templateKey of templateKeys) {
        if (endpointMatchesTemplate(key, templateKey)) {
          hasMatchingTemplate = true;
          break;
        }
      }

      // Only add if no matching template
      if (!hasMatchingTemplate) {
        dedupedErrors[key] = errors[key];
      }
    }

    writeFileSync(filePath, JSON.stringify(dedupedErrors, null, 2));
    log.debug(`Worker ${_workerId} saved endpoint errors to file`);
  } catch (err) {
    log.error(`Failed to write errors to file: ${filePath}`, err);
  }
}

/**
 * List of possible OpenAPI specification file paths
 */
export function getPossibleOpenApiPaths(customPath?: string): string[] {
  const possiblePaths = [
    join(process.cwd(), 'src', 'api', 'data', 'openapi.json'),
    join(process.cwd(), 'src', 'api', 'data', 'openapi.yaml'),
    join(process.cwd(), 'src', 'api', 'data', 'swagger.json'),
    join(process.cwd(), 'src', 'api', 'data', 'swagger.yaml'),
    join(process.cwd(), 'openapi.json'),
    join(process.cwd(), 'openapi.yaml'),
    join(process.cwd(), 'swagger.json'),
    join(process.cwd(), 'swagger.yaml'),
  ];

  // Custom path from options if provided
  if (customPath) {
    possiblePaths.unshift(resolve(process.cwd(), customPath));
  }

  return possiblePaths;
}
