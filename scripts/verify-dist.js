import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const distDir = path.resolve(projectRoot, 'dist');
const indexHtml = path.join(distDir, 'index.html');

if (!fs.existsSync(distDir)) {
  console.error('[CNS] dist directory missing:', distDir);
  process.exit(1);
}

if (!fs.existsSync(indexHtml)) {
  console.error('[CNS] dist/index.html missing:', indexHtml);
  process.exit(1);
}

console.log('[CNS] dist verification passed:', distDir);
