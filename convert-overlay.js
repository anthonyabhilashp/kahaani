const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs');
const path = require('path');

// Get input file from command line argument
const inputFile = process.argv[2];

if (!inputFile) {
  console.error('❌ Please provide an overlay file path');
  console.log('\nUsage:');
  console.log('  node convert-overlay.js <path-to-overlay.webm>');
  console.log('\nExample:');
  console.log('  node convert-overlay.js ./my-overlay.webm');
  console.log('  node convert-overlay.js ./fixed-overlays/Rain-01.webm');
  process.exit(1);
}

if (!fs.existsSync(inputFile)) {
  console.error(`❌ File not found: ${inputFile}`);
  process.exit(1);
}

const fileName = path.basename(inputFile);
const fileNameWithoutExt = path.parse(fileName).name;
const outputFileName = fileNameWithoutExt + '.webm'; // Always output as WebM

// Create organized output structure: generated-overlays/OverlayName/9-16/
const baseOutputDir = 'generated-overlays';
const overlayOutputDir = path.join(baseOutputDir, fileNameWithoutExt);

// Define all aspect ratios
const aspectRatios = [
  { name: '9:16', folder: '9-16', width: 1080, height: 1920, desc: 'Portrait' },
  { name: '16:9', folder: '16-9', width: 1920, height: 1080, desc: 'Landscape' },
  { name: '1:1', folder: '1-1', width: 1080, height: 1080, desc: 'Square' },
];

// Create output directories: generated-overlays/OverlayName/9-16/
aspectRatios.forEach(ratio => {
  const fullPath = path.join(overlayOutputDir, ratio.folder);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
  }
});

console.log('🎬 Converting overlay to all aspect ratios...\n');
console.log(`📂 Input: ${inputFile}`);
console.log(`📁 Output: ${overlayOutputDir}/`);
console.log(`📊 Formats: ${aspectRatios.map(r => r.name).join(', ')}\n`);

let completed = 0;
const total = aspectRatios.length;

aspectRatios.forEach((ratio, index) => {
  const outputPath = path.join(overlayOutputDir, ratio.folder, outputFileName);

  console.log(`[${index + 1}/${total}] Converting to ${ratio.name} (${ratio.width}x${ratio.height}) - ${ratio.desc}`);

  ffmpeg(inputFile)
    .videoCodec('libvpx-vp9')
    .format('webm')
    .outputOptions([
      '-vf', `scale=${ratio.width}:${ratio.height}:force_original_aspect_ratio=increase,crop=${ratio.width}:${ratio.height}`,
      '-pix_fmt', 'yuv420p',
      '-auto-alt-ref', '0',
      '-b:v', '2M',
      '-crf', '30',
      '-cpu-used', '2',
    ])
    .noAudio()
    .on('start', (cmd) => {
      console.log(`   Processing...`);
    })
    .on('end', () => {
      console.log(`   ✅ Done! → ${outputPath}\n`);
      completed++;

      if (completed === total) {
        console.log('🎉 All formats generated successfully!\n');
        console.log(`📁 Output directory: ${overlayOutputDir}/\n`);
        console.log('📄 Generated files:');
        aspectRatios.forEach(r => {
          const outFile = path.join(overlayOutputDir, r.folder, outputFileName);
          const stats = fs.statSync(outFile);
          const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
          console.log(`   ${r.name}: ${r.folder}/${outputFileName} (${sizeMB} MB)`);
        });
        console.log('\n💡 Next: Upload to Supabase with upload-all-overlays.js');
      }
    })
    .on('error', (err) => {
      console.error(`   ❌ ERROR: ${err.message}\n`);
      completed++;
    })
    .save(outputPath);
});
