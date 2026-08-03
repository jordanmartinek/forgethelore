/**
 * Icon Setup Helper
 * 
 * Usage:
 *   1. Save your icon image as "icon.png" in this folder
 *   2. Run: node setup-icon.js
 *   
 * This copies icon.png to the correct locations for the PWA manifest.
 * If you don't have image processing tools, just manually copy/resize.
 */

const fs = require('fs');
const path = require('path');

const source = path.join(__dirname, 'icon.png');
const dest512 = path.join(__dirname, 'public', 'icons', 'icon-512.png');
const dest192 = path.join(__dirname, 'public', 'icons', 'icon-192.png');

if (!fs.existsSync(source)) {
  console.log('');
  console.log('  ❌ No icon.png found in the project root.');
  console.log('');
  console.log('  To set up your desktop icon:');
  console.log('  1. Save your image as "icon.png" in this folder');
  console.log('  2. Run this script again: node setup-icon.js');
  console.log('');
  console.log('  Or manually copy your image to:');
  console.log('    public/icons/icon-512.png  (512x512)');
  console.log('    public/icons/icon-192.png  (192x192)');
  console.log('');
  process.exit(1);
}

// Copy as 512 (assume source is already high-res)
fs.copyFileSync(source, dest512);
// Copy as 192 (browsers will scale down — not ideal but works)
fs.copyFileSync(source, dest192);

console.log('');
console.log('  ✅ Icon set up successfully!');
console.log('');
console.log('  Files created:');
console.log('    → public/icons/icon-512.png');
console.log('    → public/icons/icon-192.png');
console.log('');
console.log('  Next steps:');
console.log('    1. Run: node server.js');
console.log('    2. Open http://localhost:3000 in Chrome/Edge');
console.log('    3. Click the install icon (⊕) in the address bar');
console.log('    4. Your app will install with the custom icon!');
console.log('');
