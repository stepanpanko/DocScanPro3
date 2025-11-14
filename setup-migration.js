#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

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
    fs.copyFileSync(src, dest);
  }
}

console.log('=== Migration Setup Script ===');

// Copy src directory
console.log('Copying src directory...');
copyRecursive(
  path.join(OLD_APP_DIR, 'src'),
  path.join(NEW_APP_DIR, 'src')
);

// Copy assets if they exist
if (fs.existsSync(path.join(OLD_APP_DIR, 'assets'))) {
  console.log('Copying assets directory...');
  copyRecursive(
    path.join(OLD_APP_DIR, 'assets'),
    path.join(NEW_APP_DIR, 'assets')
  );
}

// Copy .env files
const envFiles = ['.env', '.env.local', '.env.development', '.env.production'];
envFiles.forEach(envFile => {
  const srcEnv = path.join(OLD_APP_DIR, envFile);
  if (fs.existsSync(srcEnv)) {
    console.log(`Copying ${envFile}...`);
    fs.copyFileSync(srcEnv, path.join(NEW_APP_DIR, envFile));
  }
});

console.log('Migration complete!');

