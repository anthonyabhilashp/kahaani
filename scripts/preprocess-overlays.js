/**
 * Pre-process overlay effects to RGB format for faster video generation
 *
 * This script:
 * 1. Finds all overlay WebM files in generated-overlays/
 * 2. Converts each to 1080p at 24fps in gbrp (RGB) format
 * 3. Uses H.264 compression for small file size (~5-15MB per overlay)
 * 4. Saves processed versions for reuse during video generation
 *
 * Benefits:
 * - Eliminates gbrp conversion during video generation (saves ~10-15s per scene)
 * - Small file size due to H.264 compression (NOT ProRes)
 * - Reusable across all stories
 * - Total storage: ~150-300MB for all overlays
 */

const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');

const overlaysDir = path.join(process.cwd(), 'generated-overlays');
const outputDir = path.join(process.cwd(), 'public', 'processed-overlays');

// 2K dimensions for each aspect ratio (good balance between size and quality)
// Scaling from 2K to 4K during generation is much faster than original to 4K
const dimensions = {
  '9-16': { width: 1080, height: 1920 },  // 2K portrait
  '16-9': { width: 1920, height: 1080 },  // 2K landscape
  '1-1': { width: 1920, height: 1920 }    // 2K square
};

// Create output directory
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

async function processOverlay(overlayPath, aspectRatio, overlayName) {
  const dims = dimensions[aspectRatio];
  // Use canonical naming (lowercase, underscores) for consistency
  const canonicalName = overlayName.trim().toLowerCase().replace(/\s+/g, '_');
  const outputFileName = `${canonicalName}-${aspectRatio}-processed.mp4`;
  const outputPath = path.join(outputDir, outputFileName);

  console.log(`\n🎬 Processing: ${overlayName} (${aspectRatio})`);
  console.log(`   Input: ${overlayPath}`);
  console.log(`   Output: ${outputPath}`);
  console.log(`   Resolution: ${dims.width}x${dims.height}`);

  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    ffmpeg(overlayPath)
      .videoFilters([
        `scale=${dims.width}:${dims.height}:flags=lanczos`,
        `fps=24`,
        `format=gbrp` // Pre-convert to RGB format (eliminates conversion during video gen)
      ])
      .videoCodec('libx264')
      .outputOptions([
        '-pix_fmt gbrp', // H.264 with RGB pixel format (small file size)
        '-preset slow', // Slower preset for better compression (preprocessing is one-time)
        '-crf 30', // Good quality, reasonable file size
        '-movflags +faststart'
      ])
      .noAudio()
      .save(outputPath)
      .on('start', (cmdLine) => {
        console.log(`   ⚙️  FFmpeg: ${cmdLine.substring(0, 100)}...`);
      })
      .on('progress', (progress) => {
        if (progress.percent) {
          process.stdout.write(`\r   📊 Progress: ${progress.percent.toFixed(1)}%`);
        }
      })
      .on('end', () => {
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        const size = (fs.statSync(outputPath).size / 1024 / 1024).toFixed(2);
        console.log(`\n   ✅ Complete in ${duration}s (${size}MB)`);
        resolve();
      })
      .on('error', (err) => {
        console.error(`\n   ❌ Error: ${err.message}`);
        reject(err);
      });
  });
}

async function findAndProcessOverlays() {
  console.log('🚀 Starting overlay pre-processing...\n');
  console.log(`📂 Source: ${overlaysDir}`);
  console.log(`📂 Output: ${outputDir}\n`);

  const overlayFolders = fs.readdirSync(overlaysDir).filter(f => {
    return fs.statSync(path.join(overlaysDir, f)).isDirectory();
  });

  console.log(`Found ${overlayFolders.length} overlay types: ${overlayFolders.join(', ')}\n`);

  let processed = 0;
  let failed = 0;

  for (const overlayName of overlayFolders) {
    const overlayPath = path.join(overlaysDir, overlayName);

    // Process each aspect ratio
    for (const aspectRatio of ['9-16', '16-9', '1-1']) {
      const aspectPath = path.join(overlayPath, aspectRatio);

      if (!fs.existsSync(aspectPath)) {
        console.log(`⚠️  Skipping ${overlayName}/${aspectRatio} (not found)`);
        continue;
      }

      // Find WebM file in this folder
      const files = fs.readdirSync(aspectPath).filter(f => f.endsWith('.webm'));

      if (files.length === 0) {
        console.log(`⚠️  No WebM found in ${overlayName}/${aspectRatio}`);
        continue;
      }

      const webmPath = path.join(aspectPath, files[0]);

      try {
        await processOverlay(webmPath, aspectRatio, overlayName);
        processed++;
      } catch (err) {
        console.error(`❌ Failed to process ${overlayName}/${aspectRatio}: ${err.message}`);
        failed++;
      }
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log(`✅ Processing complete!`);
  console.log(`   Processed: ${processed} overlays`);
  console.log(`   Failed: ${failed} overlays`);
  console.log(`   Output directory: ${outputDir}`);
  console.log('='.repeat(60) + '\n');

  console.log('📋 Next steps:');
  console.log('1. Test video generation with these processed overlays');
  console.log('2. If successful, upload to Supabase storage');
  console.log('3. Modify video generation to use processed versions\n');
}

// Run the script
findAndProcessOverlays().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
