#!/usr/bin/env node

/**
 * Generate Font Installation Commands for nixpacks.toml
 *
 * This script generates the curl commands needed to install fonts in nixpacks.toml.
 * Run this whenever you add new fonts to lib/fonts.ts
 *
 * Usage: node scripts/generate-font-install.js
 */

const fs = require('fs');
const path = require('path');

// Import font config (using require since this is a Node.js script)
const fontsPath = path.join(__dirname, '../lib/fonts.ts');
const fontsContent = fs.readFileSync(fontsPath, 'utf-8');

// Parse the CAPTION_FONTS array from the TypeScript file
// This is a simple regex-based parser - good enough for our structured data
const fontMatches = [...fontsContent.matchAll(/{\s*name:\s*"([^"]+)"[^}]*systemFont:\s*false[^}]*fileName:\s*"([^"]+)"[^}]*fontPath:\s*"([^"]+)"/g)];

if (fontMatches.length === 0) {
  console.error('❌ No fonts found in lib/fonts.ts');
  process.exit(1);
}

console.log('📝 Generating nixpacks.toml font installation commands...\n');
console.log('Copy these commands to nixpacks.toml [phases.install] cmds array:\n');
console.log('="='.repeat(40));

const categorizedFonts = {
  'Sans-Serif': [],
  'Serif': [],
  'Display & Handwriting': [],
  'Monospace': []
};

// Categorize fonts by reading the category from the file
fontMatches.forEach(match => {
  const [, name, fileName, fontPath] = match;

  // Determine category based on font name position in file
  let category = 'Sans-Serif';
  if (name.includes('Play') || name.includes('Merri') || name.includes('Lora') || name.includes('PT Serif')) {
    category = 'Serif';
  } else if (name.includes('Bangers') || name.includes('Pacifico') || name.includes('Righteous') ||
             name.includes('Lobster') || name.includes('Permanent') || name.includes('Dancing')) {
    category = 'Display & Handwriting';
  } else if (name.includes('Mono') || name.includes('Code')) {
    category = 'Monospace';
  }

  categorizedFonts[category].push({ name, fileName, fontPath });
});

// Generate commands
let commands = [];

commands.push('  "npm ci",');
commands.push('  "mkdir -p /root/.fonts",');

Object.entries(categorizedFonts).forEach(([category, fonts]) => {
  if (fonts.length > 0) {
    commands.push(`  # ${category} fonts`);

    fonts.forEach(font => {
      // Most fonts have Regular and Bold variants
      const hasBold = !['BebasNeue', 'Bangers', 'Pacifico', 'Righteous', 'Lobster', 'PermanentMarker'].includes(font.fileName);

      commands.push(`  "curl -L https://github.com/google/fonts/raw/main/${font.fontPath}/${font.fileName}-Regular.ttf -o /root/.fonts/${font.fileName}-Regular.ttf",`);

      if (hasBold) {
        commands.push(`  "curl -L https://github.com/google/fonts/raw/main/${font.fontPath}/${font.fileName}-Bold.ttf -o /root/.fonts/${font.fileName}-Bold.ttf",`);
      }
    });
  }
});

commands.push('  # Refresh font cache so FFmpeg can find them');
commands.push('  "fc-cache -f -v"');

console.log(commands.join('\n'));
console.log('="='.repeat(40));
console.log(`\n✅ Generated ${fontMatches.length} font download commands`);
console.log('\n💡 To update nixpacks.toml:');
console.log('   1. Copy the commands above');
console.log('   2. Replace the [phases.install] cmds array in nixpacks.toml');
console.log('   3. Commit and deploy to Railway\n');
