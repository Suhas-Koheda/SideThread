import { execSync } from 'child_process';
import fs from 'fs';

console.log('Cleaning dist directory...');
if (fs.existsSync('dist')) {
  fs.rmSync('dist', { recursive: true, force: true });
}

console.log('Building Side Panel React App...');
execSync('npx vite build', { stdio: 'inherit' });

console.log('Building Content Script...');
execSync('npx vite build --config vite.content.config.ts', { stdio: 'inherit' });

console.log('Building Background Service Worker...');
execSync('npx vite build --config vite.background.config.ts', { stdio: 'inherit' });

console.log('Build completed successfully!');
