// @vitest-environment node
import { describe, it, expect, beforeAll } from 'vitest';
import { Canvas } from 'canvas';
import {
  resizeImage,
  rotateImage,
  cropImage,
  adjustContrastBrightness,
  grayscaleImage,
  detectSkewAngle,
  preprocess,
  DEFAULT_PARAMS,
} from './preprocessCore';
import type { PreprocessParams, CropRect } from '@/types';

// Polyfill OffscreenCanvas by extending node-canvas Canvas
// This way node-canvas's drawImage will accept our OffscreenCanvas instances
class NodeOffscreenCanvas extends Canvas {
  constructor(width: number, height: number) {
    super(width, height, 'image');
  }
}

beforeAll(() => {
  if (typeof OffscreenCanvas === 'undefined') {
    (globalThis as Record<string, unknown>).OffscreenCanvas = NodeOffscreenCanvas;
  }
});

function createTestCanvas(width: number, height: number, color = '#000000'): OffscreenCanvas {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
  return canvas;
}

function createCheckerCanvas(width: number, height: number): OffscreenCanvas {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d')!;
  const size = 10;
  for (let y = 0; y < height; y += size) {
    for (let x = 0; x < width; x += size) {
      ctx.fillStyle = (Math.floor(x / size) + Math.floor(y / size)) % 2 === 0 ? '#000' : '#fff';
      ctx.fillRect(x, y, size, size);
    }
  }
  return canvas;
}

describe('resizeImage', () => {
  it('should not resize small images', () => {
    const canvas = createTestCanvas(100, 100);
    const result = resizeImage(canvas, 2048);
    expect(result.width).toBe(100);
    expect(result.height).toBe(100);
  });

  it('should resize large images proportionally', () => {
    const canvas = createTestCanvas(4000, 3000);
    const result = resizeImage(canvas, 2048);
    expect(Math.max(result.width, result.height)).toBe(2048);
    const originalRatio = 4000 / 3000;
    const resultRatio = result.width / result.height;
    expect(Math.abs(originalRatio - resultRatio)).toBeLessThan(0.01);
  });

  it('should resize wide images correctly', () => {
    const canvas = createTestCanvas(5000, 1000);
    const result = resizeImage(canvas, 2048);
    expect(result.width).toBe(2048);
  });

  it('should resize tall images correctly', () => {
    const canvas = createTestCanvas(1000, 5000);
    const result = resizeImage(canvas, 2048);
    expect(result.height).toBe(2048);
  });
});

describe('rotateImage', () => {
  it('should return same canvas for 0 degrees', () => {
    const canvas = createTestCanvas(100, 50);
    const result = rotateImage(canvas, 0);
    expect(result.width).toBe(100);
    expect(result.height).toBe(50);
  });

  it('should rotate 90 degrees correctly', () => {
    const canvas = createTestCanvas(100, 50);
    const result = rotateImage(canvas, 90);
    expect(result.width).toBe(50);
    expect(result.height).toBe(100);
  });

  it('should rotate 180 degrees correctly', () => {
    const canvas = createTestCanvas(100, 50);
    const result = rotateImage(canvas, 180);
    expect(result.width).toBe(100);
    expect(result.height).toBe(50);
  });

  it('should rotate 270 degrees correctly', () => {
    const canvas = createTestCanvas(100, 50);
    const result = rotateImage(canvas, 270);
    expect(result.width).toBe(50);
    expect(result.height).toBe(100);
  });
});

describe('cropImage', () => {
  it('should crop to specified region', () => {
    const canvas = createTestCanvas(200, 200);
    const region: CropRect = { x: 50, y: 50, width: 100, height: 100 };
    const result = cropImage(canvas, region);
    expect(result.width).toBe(100);
    expect(result.height).toBe(100);
  });

  it('should clamp crop region that exceeds canvas bounds', () => {
    const canvas = createTestCanvas(200, 200);
    const region: CropRect = { x: 150, y: 150, width: 100, height: 100 };
    const result = cropImage(canvas, region);
    expect(result.width).toBe(50);
    expect(result.height).toBe(50);
  });

  it('should clamp negative crop coordinates', () => {
    const canvas = createTestCanvas(200, 200);
    const region: CropRect = { x: -10, y: -10, width: 100, height: 100 };
    const result = cropImage(canvas, region);
    expect(result.width).toBe(90);
    expect(result.height).toBe(90);
  });
});

describe('adjustContrastBrightness', () => {
  it('should return same canvas for default values', () => {
    const canvas = createTestCanvas(100, 100);
    const result = adjustContrastBrightness(canvas, 100, 100);
    expect(result.width).toBe(100);
    expect(result.height).toBe(100);
  });

  it('should produce output for increased contrast', () => {
    const canvas = createCheckerCanvas(100, 100);
    const result = adjustContrastBrightness(canvas, 150, 100);
    expect(result.width).toBe(100);
    expect(result.height).toBe(100);
  });

  it('should produce output for increased brightness', () => {
    const canvas = createTestCanvas(100, 100);
    const result = adjustContrastBrightness(canvas, 100, 150);
    expect(result.width).toBe(100);
    expect(result.height).toBe(100);
  });
});

describe('grayscaleImage', () => {
  it('should produce grayscale output', () => {
    const canvas = createTestCanvas(100, 100);
    const result = grayscaleImage(canvas);
    expect(result.width).toBe(100);
    expect(result.height).toBe(100);
  });
});

describe('detectSkewAngle', () => {
  it('should return 0 for non-skewed image', () => {
    const canvas = createTestCanvas(200, 200, '#000');
    const angle = detectSkewAngle(canvas);
    expect(typeof angle).toBe('number');
    expect(Math.abs(angle)).toBeLessThan(5);
  });

  it('should return 0 on error without throwing', () => {
    const canvas = new OffscreenCanvas(0, 0);
    const angle = detectSkewAngle(canvas);
    expect(angle).toBe(0);
  });
});

describe('preprocess', () => {
  it('should return correct output structure', () => {
    const canvas = createTestCanvas(100, 100);
    const result = preprocess(canvas, { ...DEFAULT_PARAMS });
    expect(result.canvas).toBeDefined();
    expect(result.appliedParams).toEqual(DEFAULT_PARAMS);
    expect(result.originalSize).toEqual({ width: 100, height: 100 });
    expect(result.processedSize.width).toBeGreaterThan(0);
    expect(result.processedSize.height).toBeGreaterThan(0);
  });

  it('should apply crop when specified', () => {
    const canvas = createTestCanvas(200, 200);
    const params: PreprocessParams = {
      ...DEFAULT_PARAMS,
      cropRegion: { x: 50, y: 50, width: 100, height: 100 },
    };
    const result = preprocess(canvas, params);
    expect(result.processedSize.width).toBe(100);
    expect(result.processedSize.height).toBe(100);
  });

  it('should resize large images', () => {
    const canvas = createTestCanvas(4000, 3000);
    const result = preprocess(canvas, { ...DEFAULT_PARAMS, maxSideLength: 2048 });
    expect(Math.max(result.processedSize.width, result.processedSize.height)).toBe(2048);
  });

  it('should apply rotation', () => {
    const canvas = createTestCanvas(100, 50);
    const result = preprocess(canvas, { ...DEFAULT_PARAMS, rotation: 90 });
    expect(result.processedSize.width).toBe(50);
    expect(result.processedSize.height).toBe(100);
  });
});

describe('DEFAULT_PARAMS', () => {
  it('should have correct default values', () => {
    expect(DEFAULT_PARAMS.rotation).toBe(0);
    expect(DEFAULT_PARAMS.contrast).toBe(100);
    expect(DEFAULT_PARAMS.brightness).toBe(100);
    expect(DEFAULT_PARAMS.autoDeskew).toBe(true);
    expect(DEFAULT_PARAMS.maxSideLength).toBe(2048);
    expect(DEFAULT_PARAMS.cropRegion).toBeNull();
  });
});
