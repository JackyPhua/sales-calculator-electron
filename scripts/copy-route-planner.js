/**
 * Copy Route Planner portable exe into resources/ before packaging.
 */
const fs = require('fs');
const path = require('path');

const EXE_NAME = 'Route Planner 1.1.11.exe';
const destDir = path.join(__dirname, '..', 'resources', 'route-planner');
const dest = path.join(destDir, EXE_NAME);

if (fs.existsSync(dest)) {
    console.log('Route Planner already bundled:', dest);
    process.exit(0);
}

const candidates = [
    process.argv[2],
    path.join(__dirname, '..', '..', '..', 'Route Planner', 'release', EXE_NAME),
    path.join(__dirname, '..', '..', 'Route Planner', 'release', EXE_NAME)
].filter(Boolean);

let src = null;
for (var i = 0; i < candidates.length; i++) {
    if (fs.existsSync(candidates[i])) {
        src = candidates[i];
        break;
    }
}

if (!src) {
    console.error('Route Planner exe not found. Expected at:', dest);
    console.error('Usage: node scripts/copy-route-planner.js [path-to-exe]');
    process.exit(1);
}

fs.mkdirSync(destDir, { recursive: true });
fs.copyFileSync(src, dest);
console.log('Copied Route Planner to', dest);
