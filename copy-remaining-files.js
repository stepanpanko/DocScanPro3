#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const OLD_APP_DIR = '/Users/stepanpanko/DocScanPro';
const NEW_APP_DIR = '/Users/stepanpanko/DocScanPro3';

function copyRecursive(src, dest) {
  if (!fs.existsSync(src)) {
    console.log(`Source does not exist: ${src}`);
    return;
  }
  const stats = fs.statSync(src);
  if (stats.isDirectory()) {
    if (!fs.existsSync(dest)) {
      fs.mkdirSync(dest, { recursive: true });
    }
    fs.readdirSync(src).forEach(childItemName => {
      copyRecursive(
        path.join(src, childItemName),
        path.join(dest, childItemName)
      );
    });
  } else {
    // Skip if already exists
    if (fs.existsSync(dest)) {
      console.log(`Skipping (already exists): ${dest}`);
      return;
    }
    fs.copyFileSync(src, dest);
    console.log(`Copied: ${src} -> ${dest}`);
  }
}

console.log('=== Copying Remaining Source Files ===');

// Copy components directory
console.log('\nCopying components...');
copyRecursive(
  path.join(OLD_APP_DIR, 'src/components'),
  path.join(NEW_APP_DIR, 'src/components')
);

// Copy screens directory
console.log('\nCopying screens...');
copyRecursive(
  path.join(OLD_APP_DIR, 'src/screens'),
  path.join(NEW_APP_DIR, 'src/screens')
);

console.log('\n=== Copy Complete ===');

