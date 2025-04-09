import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import logger from '@wdio/logger';
import {
  IServerErrorRecord,
  IMethodCoverage,
  IServerErrorStats,
  ICoverageReport,
  IEndpointPattern,
} from '../types/index.js';
import path from 'path';
import fs from 'fs';

// Create a logger instance
const log = logger('openapi:report-generator');

/**
 * Load endpoint patterns from a JSON file
 */
export function loadEndpointPatterns(patternFilePath: string | undefined): IEndpointPattern[] {
  if (!patternFilePath) {
    return [];
  }

  try {
    if (!existsSync(patternFilePath)) {
      log.error(`Endpoint pattern file does not exist: ${patternFilePath}`);
      return [];
    }

    const content = readFileSync(patternFilePath, 'utf-8');
    const patterns = JSON.parse(content) as IEndpointPattern[];

    if (!Array.isArray(patterns)) {
      log.error(`Invalid endpoint pattern file format: expected an array of patterns`);
      return [];
    }

    // Validate patterns
    const validPatterns = patterns.filter((pattern) => {
      if (!pattern.pattern || !pattern.replace) {
        log.warn(`Skipping invalid pattern: ${JSON.stringify(pattern)}`);
        return false;
      }
      return true;
    });

    log.info(`Loaded ${validPatterns.length} endpoint patterns from ${patternFilePath}`);
    return validPatterns;
  } catch (err) {
    log.error(`Failed to load endpoint patterns from ${patternFilePath}:`, err);
    return [];
  }
}

/**
 * Normalize endpoints by applying pattern replacements
 */
export function normalizeEndpoints(endpoints: string[], patterns: IEndpointPattern[]): string[] {
  if (!patterns.length) {
    return endpoints;
  }

  // Map to store normalized endpoints (unique)
  const normalizedEndpoints = new Map<string, string>();

  // First pass: apply patterns to normalize endpoints
  for (const endpoint of endpoints) {
    // Skip any already malformed endpoints
    if (endpoint.includes('}{') || endpoint.includes('}}') || endpoint.includes('{{')) {
      log.warn(`Skipping malformed endpoint: ${endpoint}`);
      continue;
    }

    const [method, path] = endpoint.split(' ', 2);
    if (!path) {
      continue;
    } // Skip if no path part

    // Apply each pattern in sequence
    let normalizedPath = path;

    for (const { pattern, replace } of patterns) {
      try {
        const regex = new RegExp(pattern);

        // Check if pattern matches
        if (regex.test(normalizedPath)) {
          // Replace the matched part with the parameter template
          normalizedPath = normalizedPath.replace(regex, `{${replace}}`);

          // Clean up any duplicate slashes that might have been introduced
          normalizedPath = normalizedPath.replace(/\/+/g, '/');
        }
      } catch (err) {
        log.warn(`Invalid pattern ${pattern}:`, err);
      }
    }

    // Check for malformed paths that might have been created
    if (
      normalizedPath.includes('}{') ||
      normalizedPath.includes('}}') ||
      normalizedPath.includes('{{')
    ) {
      log.warn(`Pattern created malformed path: ${normalizedPath} from ${path}`);
      // Use the original path instead
      normalizedPath = path;
    }

    const normalizedEndpoint = `${method} ${normalizedPath}`;

    // Create a structure key to group similar endpoints
    const structureKey = `${method} ${normalizedPath.replace(/\{[^}]+\}/g, '{PARAM}')}`;

    // Store in our map using the structure as key for deduplication
    if (normalizedEndpoint.includes('{') && normalizedEndpoint.includes('}')) {
      // Always prefer templated versions
      normalizedEndpoints.set(structureKey, normalizedEndpoint);
    } else if (!normalizedEndpoints.has(structureKey)) {
      // Only add concrete endpoints if no template exists yet
      normalizedEndpoints.set(structureKey, normalizedEndpoint);
    }
  }

  // Get unique normalized endpoints
  const result = Array.from(normalizedEndpoints.values());

  if (endpoints.length !== result.length) {
    log.info(
      `Deduplicated endpoints from ${endpoints.length} to ${result.length} after normalization`
    );
  }

  return result;
}

/**
 * Generate a coverage report with endpoints tested and not tested
 */
export function generateCoverageReport(
  specEndpoints: Set<string>,
  hitEndpoints: string[],
  allServerErrors: Record<string, IServerErrorRecord>,
  outputPath: string,
  endpointPatternFile?: string
): void {
  // Load endpoint patterns from file if provided
  const patterns = loadEndpointPatterns(endpointPatternFile);

  // Normalize endpoints using patterns if available
  const normalizedHitEndpoints =
    patterns.length > 0 ? normalizeEndpoints(hitEndpoints, patterns) : hitEndpoints;

  log.info(
    `Generating report with ${specEndpoints.size} spec endpoints and ${normalizedHitEndpoints.length} hit endpoints`
  );

  // Find endpoints in both spec and hit lists (exact matches only)
  const tested = [...specEndpoints].filter((e) => normalizedHitEndpoints.includes(e));

  // Find spec endpoints that weren't hit
  const _untested = [...specEndpoints].filter((e) => !tested.includes(e));

  // For hit endpoints that aren't exactly matching the spec, try checking if they're semantically the same
  // by comparing their structure (ignoring parameter values)
  const specEndpointsStructures = new Map<string, string>();
  [...specEndpoints].forEach((endpoint) => {
    const [method, path] = endpoint.split(' ', 2);
    const structureKey = `${method} ${path.replace(/\{[^}]+\}/g, '{PARAM}')}`;
    specEndpointsStructures.set(structureKey, endpoint);
  });

  // Collect endpoints that are actually hits for spec endpoints but don't match exactly
  const additionalTested: string[] = [];

  // Find hit endpoints that aren't in the spec
  const realExtraEndpoints: string[] = [];

  normalizedHitEndpoints.forEach((endpoint) => {
    if (specEndpoints.has(endpoint)) {
      // Already counted as tested
      return;
    }

    const [method, path] = endpoint.split(' ', 2);
    const structureKey = `${method} ${path.replace(/\{[^}]+\}/g, '{PARAM}')}`;

    if (specEndpointsStructures.has(structureKey)) {
      // This endpoint matches a spec endpoint structurally, so it's actually a test of that endpoint
      const specEndpoint = specEndpointsStructures.get(structureKey);
      if (specEndpoint) {
        additionalTested.push(specEndpoint);
        log.debug(
          `Matched hit endpoint ${endpoint} to spec endpoint ${specEndpoint} via structure`
        );
      }
    } else {
      // This is truly an extra endpoint not in the spec
      realExtraEndpoints.push(endpoint);
    }
  });

  // Combine the directly tested endpoints with the additional ones found by structure
  const allTested = [...new Set([...tested, ...additionalTested])];

  // Update untested to exclude the additional tested ones
  const allUntested = [...specEndpoints].filter((e) => !allTested.includes(e));

  // Additional deduplication for extraEndpoints in case there are templated and concrete versions
  const extraEndpointsByStructure = new Map<string, string>();
  for (const endpoint of realExtraEndpoints) {
    const [method, path] = endpoint.split(' ', 2);
    const structureKey = `${method} ${path.replace(/\{[^}]+\}/g, '{PARAM}')}`;

    if (endpoint.includes('{') && endpoint.includes('}')) {
      // Always prefer template versions for extra endpoints too
      extraEndpointsByStructure.set(structureKey, endpoint);
    } else if (!extraEndpointsByStructure.has(structureKey)) {
      extraEndpointsByStructure.set(structureKey, endpoint);
    }
  }

  // Use the deduplicated version
  const dedupedExtraEndpoints = Array.from(extraEndpointsByStructure.values());

  if (dedupedExtraEndpoints.length > 0) {
    log.warn(`Found ${dedupedExtraEndpoints.length} hit endpoints not in the OpenAPI spec`);
    log.warn(`First 5 extra endpoints: ${dedupedExtraEndpoints.slice(0, 5).join(', ')}`);
  }

  // Calculate coverage metrics
  const totalEndpoints = specEndpoints.size;
  const testedCount = allTested.length;
  const untestedCount = allUntested.length;
  const coveragePercentage = totalEndpoints > 0 ? (testedCount / totalEndpoints) * 100 : 0;

  // Group endpoints by HTTP method for additional insights
  const methodCoverage = generateMethodCoverage(specEndpoints, allTested);

  // Calculate error statistics
  const serverErrorStats = generateServerErrorStats(allServerErrors);

  // Log the report summary
  log.info('OpenAPI Coverage Report:');
  log.info(`Covered: ${testedCount}`);
  log.info(`Not Covered: ${untestedCount}`);
  log.info(`Coverage: ${coveragePercentage.toFixed(2)}%`);
  log.info(`Total Server Errors: ${serverErrorStats.totalServerErrors}`);

  // Create the full report object
  const report: ICoverageReport = {
    summary: {
      totalEndpoints,
      testedEndpoints: testedCount,
      untestedEndpoints: untestedCount,
      coveragePercentage: parseFloat(coveragePercentage.toFixed(2)),
    },
    methodCoverage,
    serverErrorStats,
    endpoints: {
      tested: allTested,
      untested: allUntested,
    },
    extraEndpoints: dedupedExtraEndpoints,
    serverErrors: allServerErrors,
    timestamp: new Date().toISOString(),
  };

  // Write the report to file
  try {
    // Ensure directory exists before writing
    const directory = path.dirname(outputPath);
    if (!existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true });
      log.info(`Created directory for report: ${directory}`);
    }

    writeFileSync(outputPath, JSON.stringify(report, null, 2));
    log.info(`Coverage report saved to ${outputPath}`);
  } catch (err) {
    log.error(`Failed to write coverage report to ${outputPath}`, err);
  }
}

/**
 * Generate coverage statistics by HTTP method
 */
function generateMethodCoverage(
  specEndpoints: Set<string>,
  tested: string[]
): Record<string, IMethodCoverage> {
  const methodCoverage: Record<string, IMethodCoverage> = {};

  // Initialize method counters
  ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'].forEach((method) => {
    methodCoverage[method] = { total: 0, tested: 0, percentage: 0 };
  });

  // Count endpoints by method
  [...specEndpoints].forEach((endpoint) => {
    const [method] = endpoint.split(' ');
    if (methodCoverage[method]) {
      methodCoverage[method].total += 1;
      if (tested.includes(endpoint)) {
        methodCoverage[method].tested += 1;
      }
    }
  });

  // Calculate percentages for each method
  Object.keys(methodCoverage).forEach((method) => {
    const { total, tested } = methodCoverage[method];
    if (total > 0) {
      methodCoverage[method].percentage = parseFloat(((tested / total) * 100).toFixed(2));
    }
  });

  return methodCoverage;
}

/**
 * Calculate server error statistics
 */
function generateServerErrorStats(
  allServerErrors: Record<string, IServerErrorRecord>
): IServerErrorStats {
  // First normalize the error keys to use templated versions when available
  const normalizedErrors: Record<string, IServerErrorRecord> = {};

  // Group errors by their path structure
  const errorsByStructure: Record<string, { endpoints: string[]; records: IServerErrorRecord[] }> =
    {};

  // Collect and group all errors
  for (const [endpoint, record] of Object.entries(allServerErrors)) {
    const [method, path] = endpoint.split(' ', 2);
    // Create key that represents the structure, replacing IDs with placeholder
    const _structureKey = `${method} ${path.replace(/\/[0-9a-f]{24}(?:\/|$)/g, '/{id}/')}`;

    if (!errorsByStructure[_structureKey]) {
      errorsByStructure[_structureKey] = {
        endpoints: [],
        records: [],
      };
    }

    errorsByStructure[_structureKey].endpoints.push(endpoint);
    errorsByStructure[_structureKey].records.push(record);
  }

  // For each group, prefer templated versions or merge records
  for (const [_structureKey, group] of Object.entries(errorsByStructure)) {
    // Find templated version if available
    const templatedEndpoint = group.endpoints.find((e) => e.includes('{') && e.includes('}'));
    const targetEndpoint = templatedEndpoint || group.endpoints[0];

    // Create a merged record for this structure
    const mergedRecord: IServerErrorRecord = {
      count: 0,
      statusCodes: {},
      lastError: group.records[0]?.lastError || '',
    };

    // Combine all error counts and status codes
    for (const record of group.records) {
      mergedRecord.count += record.count || 0;

      // Merge status codes
      if (record.statusCodes) {
        for (const [status, count] of Object.entries(record.statusCodes)) {
          mergedRecord.statusCodes[status] = (mergedRecord.statusCodes[status] || 0) + count;
        }
      }
    }

    // Use the merged record
    normalizedErrors[targetEndpoint] = mergedRecord;
  }

  // Calculate statistics for these normalized errors
  const totalServerErrors = Object.values(normalizedErrors).reduce(
    (sum, { count }) => sum + count,
    0
  );

  const statusCodeCounts: Record<string, number> = {};

  // Aggregate status codes across all endpoints
  Object.values(normalizedErrors).forEach(({ statusCodes }) => {
    Object.entries(statusCodes).forEach(([code, count]) => {
      statusCodeCounts[code] = (statusCodeCounts[code] || 0) + count;
    });
  });

  return {
    totalServerErrors,
    statusCodeCounts,
    errorsByEndpoint: Object.entries(normalizedErrors).map(([endpoint, { count }]) => ({
      endpoint,
      count,
    })),
  };
}
