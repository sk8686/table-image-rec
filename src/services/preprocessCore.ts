import type { PreprocessParams, PreprocessorOutput, CropRect } from '@/types';

const DEFAULT_PARAMS: PreprocessParams = {
  rotation: 0,
  cropRegion: null,
  contrast: 100,
  brightness: 100,
  autoDeskew: true,
  maxSideLength: 2048,
};

export { DEFAULT_PARAMS };

/**
 * 缩放图片，保持宽高比，最大边不超过 maxSideLength
 */
export function resizeImage(canvas: OffscreenCanvas, maxSideLength: number): OffscreenCanvas {
  const width = canvas.width;
  const height = canvas.height;
  if (width <= maxSideLength && height <= maxSideLength) {
    return canvas;
  }

  const scale = maxSideLength / Math.max(width, height);
  const newWidth = Math.round(width * scale);
  const newHeight = Math.round(height * scale);

  const result = new OffscreenCanvas(newWidth, newHeight);
  const ctx = result.getContext('2d')!;
  ctx.drawImage(canvas, 0, 0, newWidth, newHeight);
  return result;
}

/**
 * 旋转图片
 */
export function rotateImage(canvas: OffscreenCanvas, angleDeg: number): OffscreenCanvas {
  if (angleDeg === 0) return canvas;

  const radians = (angleDeg * Math.PI) / 180;
  const width = canvas.width;
  const height = canvas.height;

  const sin = Math.abs(Math.sin(radians));
  const cos = Math.abs(Math.cos(radians));
  const newWidth = Math.round(width * cos + height * sin);
  const newHeight = Math.round(width * sin + height * cos);

  const result = new OffscreenCanvas(newWidth, newHeight);
  const ctx = result.getContext('2d')!;
  ctx.translate(newWidth / 2, newHeight / 2);
  ctx.rotate(radians);
  ctx.drawImage(canvas, -width / 2, -height / 2);

  return result;
}

/**
 * 裁剪图片
 */
export function cropImage(canvas: OffscreenCanvas, region: CropRect): OffscreenCanvas {
  // 修正越界
  const x = Math.max(0, Math.min(region.x, canvas.width));
  const y = Math.max(0, Math.min(region.y, canvas.height));
  const maxX = Math.min(region.x + region.width, canvas.width);
  const maxY = Math.min(region.y + region.height, canvas.height);
  const cropWidth = Math.max(1, Math.round(maxX - x));
  const cropHeight = Math.max(1, Math.round(maxY - y));

  const result = new OffscreenCanvas(cropWidth, cropHeight);
  const ctx = result.getContext('2d')!;
  ctx.drawImage(canvas, x, y, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
  return result;
}

/**
 * 调整对比度和亮度
 */
export function adjustContrastBrightness(
  canvas: OffscreenCanvas,
  contrast: number,
  brightness: number,
): OffscreenCanvas {
  if (contrast === 100 && brightness === 100) return canvas;

  const result = new OffscreenCanvas(canvas.width, canvas.height);
  const ctx = result.getContext('2d')!;

  // 使用 Canvas filter（性能好，浏览器原生支持）
  const filters: string[] = [];
  if (contrast !== 100) {
    filters.push(`contrast(${contrast}%)`);
  }
  if (brightness !== 100) {
    filters.push(`brightness(${brightness}%)`);
  }
  ctx.filter = filters.join(' ');
  ctx.drawImage(canvas, 0, 0);

  return result;
}

/**
 * 灰度化
 */
export function grayscaleImage(canvas: OffscreenCanvas): OffscreenCanvas {
  const result = new OffscreenCanvas(canvas.width, canvas.height);
  const ctx = result.getContext('2d')!;
  ctx.filter = 'grayscale(100%)';
  ctx.drawImage(canvas, 0, 0);
  return result;
}

/**
 * 检测倾斜角度（基于水平投影法）
 * 返回角度（度），如果检测失败返回 0
 */
export function detectSkewAngle(canvas: OffscreenCanvas): number {
  try {
    // 先转灰度
    const gray = grayscaleImage(canvas);
    const ctx = gray.getContext('2d')!;
    const imageData = ctx.getImageData(0, 0, gray.width, gray.height);
    const data = imageData.data;

    const width = gray.width;
    const height = gray.height;

    // 检查图片对比度：如果几乎纯色，跳过倾斜检测
    const histogram = new Array(256).fill(0);
    for (let i = 0; i < data.length; i += 4) {
      histogram[data[i]!]!++;
    }

    // 计算非零像素的最小和最大灰度值
    let minGray = 255;
    let maxGray = 0;
    for (let i = 0; i < 256; i++) {
      if (histogram[i]! > 0) {
        minGray = Math.min(minGray, i);
        maxGray = Math.max(maxGray, i);
      }
    }
    // 对比度太低（灰度范围 < 30），无法可靠检测倾斜
    if (maxGray - minGray < 30) {
      return 0;
    }

    let total = width * height;
    let sum = 0;
    for (let i = 0; i < 256; i++) {
      sum += i * histogram[i]!;
    }
    let sumB = 0;
    let wB = 0;
    let maxVariance = 0;
    let threshold = 128;

    for (let t = 0; t < 256; t++) {
      wB += histogram[t]!;
      if (wB === 0) continue;
      const wF = total - wB;
      if (wF === 0) break;
      sumB += t * histogram[t]!;
      const mB = sumB / wB;
      const mF = (sum - sumB) / wF;
      const variance = wB * wF * (mB - mF) * (mB - mF);
      if (variance > maxVariance) {
        maxVariance = variance;
        threshold = t;
      }
    }

    // 创建二值图（0=白, 1=黑）
    const binary = new Uint8Array(width * height);
    for (let i = 0; i < width * height; i++) {
      binary[i] = data[i * 4]! < threshold ? 1 : 0;
    }

    // 水平投影法检测倾斜
    // 在不同角度下投影，找到使投影方差最大的角度
    const angleRange = 15; // 检测 -15° 到 15°
    const angleStep = 0.5;
    let bestAngle = 0;
    let bestScore = -Infinity;

    // 采样行数（避免全图计算太慢）
    const sampleRows = Math.min(height, 50);
    const rowStep = Math.max(1, Math.floor(height / sampleRows));

    for (let angle = -angleRange; angle <= angleRange; angle += angleStep) {
      const radians = (angle * Math.PI) / 180;
      let score = 0;

      for (let row = 0; row < height; row += rowStep) {
        let rowSum = 0;
        let rowCount = 0;
        for (let col = 0; col < width; col += 2) {
          // 计算旋转后的坐标
          const srcRow = Math.round(row - col * Math.tan(radians));
          if (srcRow >= 0 && srcRow < height) {
            const idx = srcRow * width + col;
            rowSum += binary[idx]!;
            rowCount++;
          }
        }
        if (rowCount > 0) {
          // 行均值与0或1的偏差越大，说明行更"整齐"
          const avg = rowSum / rowCount;
          score += avg * (1 - avg);
        }
      }

      if (score > bestScore) {
        bestScore = score;
        bestAngle = angle;
      }
    }

    // 只在角度足够大时才校正（避免微小角度抖动）
    if (Math.abs(bestAngle) < 0.5) return 0;
    return bestAngle;
  } catch {
    return 0;
  }
}

/**
 * 完整预处理流程
 */
export function preprocess(
  sourceCanvas: OffscreenCanvas,
  params: PreprocessParams,
): PreprocessorOutput {
  const originalSize = { width: sourceCanvas.width, height: sourceCanvas.height };
  let canvas = sourceCanvas;

  // 1. 裁剪（先裁剪，减少后续处理量）
  if (params.cropRegion) {
    canvas = cropImage(canvas, params.cropRegion);
  }

  // 2. 自动倾斜校正
  if (params.autoDeskew) {
    const angle = detectSkewAngle(canvas);
    if (angle !== 0) {
      canvas = rotateImage(canvas, angle);
    }
  }

  // 3. 手动旋转
  if (params.rotation !== 0) {
    canvas = rotateImage(canvas, params.rotation);
  }

  // 4. 对比度/亮度调整
  canvas = adjustContrastBrightness(canvas, params.contrast, params.brightness);

  // 5. 缩放
  canvas = resizeImage(canvas, params.maxSideLength);

  return {
    canvas,
    appliedParams: params,
    originalSize,
    processedSize: { width: canvas.width, height: canvas.height },
  };
}
