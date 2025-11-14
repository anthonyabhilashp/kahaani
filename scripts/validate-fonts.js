#!/usr/bin/env node

/**
 * Font Installation Validator
 *
 * Validates that all fonts in lib/fonts.ts are properly configured
 * for installation in nixpacks.toml
 *
 * Usage: node scripts/validate-fonts.js
 * Returns exit code 0 if valid, 1 if issues found
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Validating font configuration...\n');

// Read lib/fonts.ts
const fontsPath = path.join(__dirname, '../lib/fonts.ts');
const fontsContent = fs.readFileSync(fontsPath, 'utf-8');

// Read nixpacks.toml
const nixpacksPath = path.join(__dirname, '../nixpacks.toml');
const nixpacksContent = fs.readFileSync(nixpacksPath, 'utf-8');

// Extract downloadable fonts from fonts.ts
const fontMatches = [...fontsContent.matchAll(/{\s*name:\s*"([^"]+)"[^}]*systemFont:\s*false[^}]*fileName:\s*"([^"]+)"/g)];

if (fontMatches.length === 0) {
  console.error('❌ No downloadable fonts found in lib/fonts.ts');
  process.exit(1);
}

const configuredFonts = fontMatches.map(match => ({
  name: match[1],
  fileName: match[2]
}));

console.log(`📋 Found ${configuredFonts.length} downloadable fonts in lib/fonts.ts`);

// Check if each font is in nixpacks.toml
let allValid = true;
const missingFonts = [];

configuredFonts.forEach(font => {
  const isInstalled = nixpacksContent.includes(`${font.fileName}-Regular.ttf`);

  if (!isInstalled) {
    missingFonts.push(font.name);
    allValid = false;
  }
});

if (!allValid) {
  console.error('\n❌ VALIDATION FAILED!\n');
  console.error('The following fonts are configured but not installed in nixpacks.toml:');
  missingFonts.forEach(name => console.error(`   - ${name}`));
  console.error('\n💡 To fix this:');
  console.error('   1. Run: node scripts/generate-font-install.js');
  console.error('   2. Copy the output to nixpacks.toml [phases.install] cmds');
  console.error('   3. Run this validation again\n');
  process.exit(1);
}

console.log('\n✅ All fonts are properly configured for installation!');
console.log(`   - ${configuredFonts.length} fonts will be downloaded during Railway build`);
console.log(`   - Font cache will be refreshed with fc-cache\n`);
process.exit(0);
