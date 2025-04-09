#!/usr/bin/env node

/**
 * This is a simple script to fix import paths in ES modules
 * by adding .js extensions to relative imports.
 * 
 * Usage: node fix-imports.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get the build directory
const buildDir = path.resolve(__dirname, 'build');

// Function to process files recursively
function processDirectory(dir) {
  const files = fs.readdirSync(dir, { withFileTypes: true });
  
  for (const file of files) {
    const fullPath = path.join(dir, file.name);
    
    if (file.isDirectory()) {
      processDirectory(fullPath);
    } else if (file.name.endsWith('.js')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      const originalContent = content;
      
      // Fix import paths
      content = content.replace(
        /from\s+(['"])(\..*?)\1(?:;|\s|$)/g,
        (match, quote, importPath) => {
          // Skip if it already has an extension
          if (importPath.match(/\.(js|ts|jsx|tsx|json|node)$/)) {
            return match;
          }
          return `from ${quote}${importPath}.js${quote}`;
        }
      );
      
      // Fix export paths
      content = content.replace(
        /export\s+.*?\s+from\s+(['"])(\..*?)\1(?:;|\s|$)/g,
        (match, quote, importPath) => {
          // Skip if it already has an extension
          if (importPath.match(/\.(js|ts|jsx|tsx|json|node)$/)) {
            return match;
          }
          return match.replace(/(['"])(\..*?)\1/, `${quote}${importPath}.js${quote}`);
        }
      );
      
      // Fix duplicate .js.js extensions
      content = content.replace(/\.js\.js/g, '.js');
      
      // Only write if content changed
      if (content !== originalContent) {
        console.log(`Fixed imports in: ${fullPath}`);
        fs.writeFileSync(fullPath, content);
      }
    }
  }
}

console.log('Fixing import paths in build directory...');
try {
  processDirectory(buildDir);
  console.log('Done!');
} catch (err) {
  console.error('Error:', err);
  process.exit(1);
} 