import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import logger from '@wdio/logger';
import { IServerErrorRecord, IErrorFileRecord } from '../types/index.js';
import { COVERAGE_DIR } from '../utils/file-utils.js';

// Create a logger instance
const log = logger('openapi:endpoint-collector');

/**
 * Get all hit endpoints from all worker files
 */
export function getAllHitEndpoints(hitEndpoints: Set<string>, _workerId: string): string[] {
  const allHitEndpoints = new Set<string>();

  // First add the endpoints from the current worker (in memory)
  hitEndpoints.forEach((endpoint) => allHitEndpoints.add(endpoint));

  // Then read all the endpoint files from the coverage directory
  try {
    if (existsSync(COVERAGE_DIR)) {
      const files = readdirSync(COVERAGE_DIR).filter(
        (f) => f.startsWith('endpoints-') && f.endsWith('.json')
      );

      let totalEndpointsAdded = 0;
      for (const file of files) {
        try {
          const filePath = join(COVERAGE_DIR, file);
          const fileContent = readFileSync(filePath, 'utf-8');
          const fileEndpoints = JSON.parse(fileContent);

          if (Array.isArray(fileEndpoints)) {
            const initialSize = allHitEndpoints.size;
            fileEndpoints.forEach((endpoint) => allHitEndpoints.add(endpoint));
            totalEndpointsAdded += allHitEndpoints.size - initialSize;
          }
        } catch (fileErr) {
          log.error(`Error reading file ${file}:`, fileErr);
        }
      }

      if (files.length > 0 && totalEndpointsAdded > 0) {
        log.info(`Added ${totalEndpointsAdded} endpoints from ${files.length} files`);
      }
    }
  } catch (err) {
    log.error('Error reading coverage directory:', err);
  }

  // Pre-process to deduplicate concrete endpoints that have template versions
  // This helps reduce the number of endpoints before the normalizeEndpoints function is applied
  const endpointsByPath = new Map<string, Set<string>>();

  // Group endpoints by their path structure (without parameters)
  for (const endpoint of allHitEndpoints) {
    const [method, path] = endpoint.split(' ', 2);

    // Create a key that represents the path structure
    // Replace any IDs that look like MongoDB ObjectIds with a placeholder
    const structurePath = path.replace(/\/[0-9a-f]{24}(?:\/|$)/g, '/{id}/');
    const key = `${method} ${structurePath}`;

    if (!endpointsByPath.has(key)) {
      endpointsByPath.set(key, new Set());
    }

    endpointsByPath.get(key)?.add(endpoint);
  }

  // For each group, prefer template versions over concrete versions
  const dedupedEndpoints = new Set<string>();

  for (const endpoints of endpointsByPath.values()) {
    // Check if there's a template version in this group
    const hasTemplate = [...endpoints].some((e) => e.includes('{') && e.includes('}'));

    if (hasTemplate) {
      // Only add the template version(s)
      for (const endpoint of endpoints) {
        if (endpoint.includes('{') && endpoint.includes('}')) {
          dedupedEndpoints.add(endpoint);
        }
      }
    } else {
      // No template version, keep all concrete versions
      endpoints.forEach((e) => dedupedEndpoints.add(e));
    }
  }

  return [...dedupedEndpoints];
}

/**
 * Get all server errors from all worker files
 */
export function getAllServerErrors(
  endpointErrors: Record<string, IServerErrorRecord>
): Record<string, IServerErrorRecord> {
  const allServerErrors: Record<string, IServerErrorRecord> = {};

  // First add the errors from the current worker (in memory)
  Object.entries(endpointErrors).forEach(([endpoint, record]) => {
    allServerErrors[endpoint] = { ...record };
  });

  // Then read all the error files from the coverage directory
  try {
    if (existsSync(COVERAGE_DIR)) {
      const files = readdirSync(COVERAGE_DIR).filter(
        (f) => f.startsWith('errors-') && f.endsWith('.json')
      );

      if (files.length === 0) {
        return allServerErrors;
      }

      let totalErrorCount = 0;
      for (const file of files) {
        try {
          const filePath = join(COVERAGE_DIR, file);
          const fileContent = readFileSync(filePath, 'utf-8');
          const fileErrors = JSON.parse(fileContent);

          // Merge errors from this file
          Object.entries(fileErrors).forEach(([endpoint, record]) => {
            const errorRecord = record as IErrorFileRecord;
            totalErrorCount++;

            if (!allServerErrors[endpoint]) {
              allServerErrors[endpoint] = {
                count: 0,
                statusCodes: {},
              };
            }

            // Add to total count
            allServerErrors[endpoint].count += errorRecord.count || 0;

            // Merge status codes
            if (errorRecord.statusCodes) {
              Object.entries(errorRecord.statusCodes).forEach(([status, count]) => {
                const countVal = count as number;
                allServerErrors[endpoint].statusCodes[status] =
                  (allServerErrors[endpoint].statusCodes[status] || 0) + countVal;
              });
            }

            // Keep the last error message
            if (errorRecord.lastError) {
              allServerErrors[endpoint].lastError = errorRecord.lastError;
            }
          });
        } catch (fileErr) {
          log.error(`Error reading file ${file}:`, fileErr);
        }
      }

      if (totalErrorCount > 0) {
        log.info(`Processed ${totalErrorCount} errors from ${files.length} files`);
      }
    }
  } catch (err) {
    log.error('Error reading coverage directory for errors:', err);
  }

  return allServerErrors;
}
