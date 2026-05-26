import { useState, useCallback, useRef } from 'react';
import type { ImageUploaderOutput } from '@/types';

const ALLOWED_FORMATS = ['image/jpeg', 'image/png', 'image/bmp', 'image/webp'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const FORMAT_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/bmp': 'bmp',
  'image/webp': 'webp',
};

export interface UploadError {
  type: 'format' | 'size' | 'damaged';
  message: string;
}

interface UseImageUploadReturn {
  output: ImageUploaderOutput | null;
  error: UploadError | null;
  isLoading: boolean;
  handleFiles: (files: FileList | File[]) => Promise<void>;
  reset: () => void;
}

function validateFormat(file: File): UploadError | null {
  if (!ALLOWED_FORMATS.includes(file.type)) {
    return {
      type: 'format',
      message: `不支持的文件格式：${file.type || '未知'}。仅支持 JPG、PNG、BMP、WebP 格式。`,
    };
  }
  return null;
}

function validateSize(file: File): UploadError | null {
  if (file.size > MAX_FILE_SIZE) {
    const sizeMB = (file.size / 1024 / 1024).toFixed(1);
    return {
      type: 'size',
      message: `文件大小 ${sizeMB}MB 超过限制。最大支持 10MB。`,
    };
  }
  return null;
}

function validateImageIntegrity(file: File): Promise<UploadError | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      if (img.naturalWidth === 0 || img.naturalHeight === 0) {
        resolve({
          type: 'damaged',
          message: '图片文件可能已损坏，无法读取图片尺寸。',
        });
        return;
      }
      resolve(null);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({
        type: 'damaged',
        message: '图片文件已损坏或格式不正确，无法加载。',
      });
    };

    img.src = url;
  });
}

async function processFile(file: File): Promise<ImageUploaderOutput> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      const previewUrl = URL.createObjectURL(file);
      resolve({
        file,
        previewUrl,
        width: img.naturalWidth,
        height: img.naturalHeight,
        fileSize: file.size,
        format: FORMAT_EXTENSIONS[file.type] ?? file.type.split('/')[1] ?? 'unknown',
      });
      URL.revokeObjectURL(url);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };

    img.src = url;
  });
}

export function useImageUpload(): UseImageUploadReturn {
  const [output, setOutput] = useState<ImageUploaderOutput | null>(null);
  const [error, setError] = useState<UploadError | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const prevPreviewUrl = useRef<string | null>(null);

  const cleanup = useCallback(() => {
    if (prevPreviewUrl.current) {
      URL.revokeObjectURL(prevPreviewUrl.current);
      prevPreviewUrl.current = null;
    }
  }, []);

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const file = files[0];
      if (!file) return;

      cleanup();
      setError(null);
      setOutput(null);
      setIsLoading(true);

      try {
        // 1. 格式校验
        const formatError = validateFormat(file);
        if (formatError) {
          setError(formatError);
          return;
        }

        // 2. 大小校验
        const sizeError = validateSize(file);
        if (sizeError) {
          setError(sizeError);
          return;
        }

        // 3. 文件损坏检测
        const damagedError = await validateImageIntegrity(file);
        if (damagedError) {
          setError(damagedError);
          return;
        }

        // 4. 处理文件
        const result = await processFile(file);
        prevPreviewUrl.current = result.previewUrl;
        setOutput(result);
      } catch {
        setError({
          type: 'damaged',
          message: '图片处理失败，请重试。',
        });
      } finally {
        setIsLoading(false);
      }
    },
    [cleanup],
  );

  const reset = useCallback(() => {
    cleanup();
    setOutput(null);
    setError(null);
    setIsLoading(false);
  }, [cleanup]);

  return { output, error, isLoading, handleFiles, reset };
}

export { ALLOWED_FORMATS, MAX_FILE_SIZE, validateFormat, validateSize, validateImageIntegrity };
