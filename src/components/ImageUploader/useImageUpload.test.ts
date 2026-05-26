import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  validateFormat,
  validateSize,
  validateImageIntegrity,
  ALLOWED_FORMATS,
  MAX_FILE_SIZE,
} from './useImageUpload';

// Mock Image constructor for jsdom environment
// URL.createObjectURL in jsdom returns something like "blob:http://localhost/xxx"
// We track corrupted files by storing their blob URLs
const corruptedUrls = new Set<string>();
const originalCreateObjectURL = URL.createObjectURL;

beforeEach(() => {
  corruptedUrls.clear();

  vi.spyOn(URL, 'createObjectURL').mockImplementation((obj: Blob | MediaSource) => {
    const url = originalCreateObjectURL(obj);
    // Mark URLs from files with "corrupted" in the name
    if (obj instanceof File && obj.name.includes('corrupted')) {
      corruptedUrls.add(url);
    }
    return url;
  });

  vi.stubGlobal(
    'Image',
    class MockImage {
      src = '';
      onload: ((ev: Event) => void) | null = null;
      onerror: ((ev: Event) => void) | null = null;
      naturalWidth = 0;
      naturalHeight = 0;

      constructor() {
        // defer to allow src assignment
        setTimeout(() => {
          if (corruptedUrls.has(this.src)) {
            this.onerror?.(new Event('error'));
          } else {
            this.naturalWidth = 100;
            this.naturalHeight = 100;
            this.onload?.(new Event('load'));
          }
        }, 0);
      }
    },
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('validateFormat', () => {
  it('should accept JPG format', () => {
    const file = new File([''], 'test.jpg', { type: 'image/jpeg' });
    expect(validateFormat(file)).toBeNull();
  });

  it('should accept PNG format', () => {
    const file = new File([''], 'test.png', { type: 'image/png' });
    expect(validateFormat(file)).toBeNull();
  });

  it('should accept BMP format', () => {
    const file = new File([''], 'test.bmp', { type: 'image/bmp' });
    expect(validateFormat(file)).toBeNull();
  });

  it('should accept WebP format', () => {
    const file = new File([''], 'test.webp', { type: 'image/webp' });
    expect(validateFormat(file)).toBeNull();
  });

  it('should reject GIF format', () => {
    const file = new File([''], 'test.gif', { type: 'image/gif' });
    const error = validateFormat(file);
    expect(error).not.toBeNull();
    expect(error?.type).toBe('format');
  });

  it('should reject SVG format', () => {
    const file = new File([''], 'test.svg', { type: 'image/svg+xml' });
    const error = validateFormat(file);
    expect(error).not.toBeNull();
    expect(error?.type).toBe('format');
  });

  it('should reject PDF file', () => {
    const file = new File([''], 'test.pdf', { type: 'application/pdf' });
    const error = validateFormat(file);
    expect(error).not.toBeNull();
    expect(error?.type).toBe('format');
  });

  it('should reject file with empty type', () => {
    const file = new File([''], 'test', { type: '' });
    const error = validateFormat(file);
    expect(error).not.toBeNull();
    expect(error?.type).toBe('format');
  });
});

describe('validateSize', () => {
  it('should accept file under 10MB', () => {
    const file = new File(['x'.repeat(1024)], 'test.jpg', { type: 'image/jpeg' });
    expect(validateSize(file)).toBeNull();
  });

  it('should accept file exactly 10MB', () => {
    const file = new File(['x'], 'test.jpg', { type: 'image/jpeg' });
    Object.defineProperty(file, 'size', { value: MAX_FILE_SIZE });
    expect(validateSize(file)).toBeNull();
  });

  it('should reject file over 10MB', () => {
    const file = new File(['x'], 'test.jpg', { type: 'image/jpeg' });
    Object.defineProperty(file, 'size', { value: MAX_FILE_SIZE + 1 });
    const error = validateSize(file);
    expect(error).not.toBeNull();
    expect(error?.type).toBe('size');
  });

  it('should reject very large file', () => {
    const file = new File(['x'], 'test.jpg', { type: 'image/jpeg' });
    Object.defineProperty(file, 'size', { value: 100 * 1024 * 1024 }); // 100MB
    const error = validateSize(file);
    expect(error).not.toBeNull();
    expect(error?.type).toBe('size');
    expect(error?.message).toContain('100.0MB');
  });
});

describe('validateImageIntegrity', () => {
  it('should detect corrupted image', async () => {
    const file = new File(['not an image'], 'corrupted.jpg', { type: 'image/jpeg' });
    const error = await validateImageIntegrity(file);
    expect(error).not.toBeNull();
    expect(error?.type).toBe('damaged');
  });

  it('should accept valid image', async () => {
    const file = new File(['valid image data'], 'valid.jpg', { type: 'image/jpeg' });
    const error = await validateImageIntegrity(file);
    expect(error).toBeNull();
  });
});

describe('ALLOWED_FORMATS', () => {
  it('should contain exactly 4 formats', () => {
    expect(ALLOWED_FORMATS).toHaveLength(4);
  });

  it('should include JPEG, PNG, BMP, WebP', () => {
    expect(ALLOWED_FORMATS).toContain('image/jpeg');
    expect(ALLOWED_FORMATS).toContain('image/png');
    expect(ALLOWED_FORMATS).toContain('image/bmp');
    expect(ALLOWED_FORMATS).toContain('image/webp');
  });
});

describe('MAX_FILE_SIZE', () => {
  it('should be 10MB', () => {
    expect(MAX_FILE_SIZE).toBe(10 * 1024 * 1024);
  });
});
