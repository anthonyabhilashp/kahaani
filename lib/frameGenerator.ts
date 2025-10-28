/**
 * Frame-by-frame video effect generator using Sharp
 * Pre-renders smooth frames instead of using FFmpeg zoompan filter
 */

import sharp from "sharp";
import path from "path";
import fs from "fs";
import { EffectType } from "./videoEffects";

interface FrameGenerationOptions {
  imagePath: string;
  outputDir: string;
  width: number;
  height: number;
  duration: number;
  effectType: EffectType;
  fps?: number;
}

/**
 * Generate individual frames with effects applied using Sharp
 * Returns the directory containing all frames
 */
export async function generateEffectFrames(
  options: FrameGenerationOptions
): Promise<string> {
  const { imagePath, outputDir, width, height, duration, effectType, fps = 30 } = options;

  // Create output directory with robust error handling
  try {
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    // Verify directory was created
    if (!fs.existsSync(outputDir)) {
      throw new Error(`Failed to create output directory: ${outputDir}`);
    }
  } catch (err: any) {
    throw new Error(`Directory creation failed for ${outputDir}: ${err.message}`);
  }

  const totalFrames = Math.round(duration * fps);

  // Read the source image once and get its metadata
  const imageBuffer = await fs.promises.readFile(imagePath);
  const metadata = await sharp(imageBuffer).metadata();
  const srcWidth = metadata.width || width;
  const srcHeight = metadata.height || height;

  // Create a larger canvas to apply zoom and pan
  // Zoom > 1.0 means we're zoomed in, so we need a larger working area
  const workingWidth = Math.round(width * 1.3); // 30% extra space for pan
  const workingHeight = Math.round(height * 1.3);

  // Resize source image ONCE to the working area dimensions
  // This is the expensive operation, so we only do it once
  const resizedBuffer = await sharp(imageBuffer)
    .resize(workingWidth, workingHeight, {
      fit: "fill", // Force exact dimensions
      kernel: "cubic", // Fast and good quality
    })
    .toBuffer();

  // Generate frames in batches to avoid overwhelming the system
  const batchSize = 50; // Process more frames at once for speed
  for (let batchStart = 0; batchStart < totalFrames; batchStart += batchSize) {
    const batchEnd = Math.min(batchStart + batchSize, totalFrames);
    const batchPromises = [];

    for (let frameNum = batchStart; frameNum < batchEnd; frameNum++) {
      const generateFrame = async () => {
        const progress = frameNum / (totalFrames - 1 || 1); // 0 to 1
        const transform = getFrameTransform(effectType, progress, width, height);

        // Work with the pre-resized buffer
        let frameImage = sharp(resizedBuffer);

    // Calculate the extract region based on zoom and pan
    // Ensure zoom is valid (never less than 1.0)
    const safeZoom = Math.max(1.0, transform.zoom);

    // When zoom = 1.0, we extract the center portion of size width x height
    // When zoom = 1.1, we extract a smaller portion (shows more detail)
    let extractWidth = Math.round(width / safeZoom);
    let extractHeight = Math.round(height / safeZoom);

    // Ensure extract dimensions are positive and don't exceed working area
    extractWidth = Math.max(1, Math.min(extractWidth, workingWidth));
    extractHeight = Math.max(1, Math.min(extractHeight, workingHeight));

    // Center the extract region and apply pan offset
    const centerX = (workingWidth - extractWidth) / 2;
    const centerY = (workingHeight - extractHeight) / 2;

    // Clamp pan values to stay within reasonable bounds
    const maxPanX = (workingWidth - extractWidth) / 2;
    const maxPanY = (workingHeight - extractHeight) / 2;
    const safePanX = Math.max(-maxPanX, Math.min(transform.panX, maxPanX));
    const safePanY = Math.max(-maxPanY, Math.min(transform.panY, maxPanY));

    const extractLeft = Math.round(centerX + safePanX);
    const extractTop = Math.round(centerY + safePanY);

    // Final safety clamps to ensure we never go out of bounds
    const safeLeft = Math.max(0, Math.min(extractLeft, workingWidth - 1));
    const safeTop = Math.max(0, Math.min(extractTop, workingHeight - 1));
    const safeWidth = Math.max(1, Math.min(extractWidth, workingWidth - safeLeft));
    const safeHeight = Math.max(1, Math.min(extractHeight, workingHeight - safeTop));

    // Validate extract parameters before attempting extraction
    if (safeWidth <= 0 || safeHeight <= 0 || safeLeft < 0 || safeTop < 0) {
      throw new Error(
        `Invalid extract parameters for frame ${frameNum}: ` +
        `left=${safeLeft}, top=${safeTop}, width=${safeWidth}, height=${safeHeight}, ` +
        `workingArea=${workingWidth}x${workingHeight}, zoom=${safeZoom}, ` +
        `extractCalc=${extractWidth}x${extractHeight}`
      );
    }

    if (safeLeft + safeWidth > workingWidth || safeTop + safeHeight > workingHeight) {
      throw new Error(
        `Extract region exceeds bounds for frame ${frameNum}: ` +
        `left=${safeLeft}, top=${safeTop}, width=${safeWidth}, height=${safeHeight}, ` +
        `workingArea=${workingWidth}x${workingHeight}`
      );
    }

    // Extract the visible region
    try {
      frameImage = frameImage.extract({
        left: safeLeft,
        top: safeTop,
        width: safeWidth,
        height: safeHeight,
      });

        // Resize to final output dimensions and save as PNG (lossless quality)
        await frameImage
          .resize(width, height, {
            fit: "fill",
            kernel: "cubic"
          })
          .png({
            compressionLevel: 6, // Balance between speed and file size
            adaptiveFiltering: false // Faster encoding
          })
          .toFile(path.join(outputDir, `frame_${String(frameNum).padStart(6, "0")}.png`));
      } catch (err: any) {
        throw new Error(
          `Sharp extract failed for frame ${frameNum}: ${err.message}. ` +
          `Params: left=${safeLeft}, top=${safeTop}, width=${safeWidth}, height=${safeHeight}, ` +
          `workingArea=${workingWidth}x${workingHeight}, effectType=${effectType}`
        );
      }
    };

    batchPromises.push(generateFrame());
  }

  // Wait for all frames in this batch to complete before moving to next batch
  await Promise.all(batchPromises);
}

return outputDir;
}

interface FrameTransform {
  zoom: number;
  panX: number;
  panY: number;
}

/**
 * Calculate zoom and pan values for a specific frame
 */
function getFrameTransform(
  effectType: EffectType,
  progress: number,
  width: number,
  height: number
): FrameTransform {
  switch (effectType) {
    case "none":
      return { zoom: 1.0, panX: 0, panY: 0 };

    case "floating":
      // Gentle sine wave motion - ensure zoom never goes below 1.0
      const floatAmount = Math.abs(Math.sin(progress * Math.PI * 2)) * 0.02;
      return {
        zoom: 1.0 + floatAmount,
        panX: 0,
        panY: 0,
      };

    case "zoom_in":
      // Linear zoom from 1.0 to 1.08
      return {
        zoom: 1.0 + 0.08 * progress,
        panX: 0,
        panY: 0,
      };

    case "zoom_out":
      // Linear zoom from 1.08 to 1.0
      return {
        zoom: 1.08 - 0.08 * progress,
        panX: 0,
        panY: 0,
      };

    case "pan_left":
      // Pan from right to left with slight zoom
      // Pan range is percentage of the extra working space
      const panLeftAmount = width * 0.1 * (progress - 0.5); // -5% to +5% of width
      return {
        zoom: 1.05,
        panX: panLeftAmount,
        panY: 0,
      };

    case "pan_right":
      // Pan from left to right with slight zoom
      const panRightAmount = width * 0.1 * (progress - 0.5);
      return {
        zoom: 1.05,
        panX: -panRightAmount, // Inverted for right pan
        panY: 0,
      };

    case "zoom_pan":
      // Zoom in while panning right
      const zoomPanAmount = width * 0.08 * (progress - 0.5);
      return {
        zoom: 1.0 + 0.1 * progress,
        panX: -zoomPanAmount,
        panY: 0,
      };

    case "zoom_out_pan":
      // Zoom out while panning left
      const zoomOutPanAmount = width * 0.08 * (progress - 0.5);
      return {
        zoom: 1.1 - 0.1 * progress,
        panX: zoomOutPanAmount,
        panY: 0,
      };

    default:
      return { zoom: 1.0, panX: 0, panY: 0 };
  }
}

/**
 * Clean up generated frames directory
 */
export function cleanupFrames(framesDir: string): void {
  if (fs.existsSync(framesDir)) {
    const files = fs.readdirSync(framesDir);
    for (const file of files) {
      fs.unlinkSync(path.join(framesDir, file));
    }
    fs.rmdirSync(framesDir);
  }
}
