import { useState, useCallback, useRef, useEffect } from 'react';
import type { PreprocessParams, PreprocessorOutput, ImageUploaderOutput } from '@/types';
import { DEFAULT_PARAMS } from '@/services/preprocessCore';
import { preprocessOnMainThread } from '@/services/preprocessService';

interface UsePreprocessReturn {
  params: PreprocessParams;
  output: PreprocessorOutput | null;
  isProcessing: boolean;
  error: string | null;
  updateParams: (partial: Partial<PreprocessParams>) => void;
  resetParams: () => void;
  preprocess: (image: ImageUploaderOutput) => Promise<void>;
}

export function usePreprocess(): UsePreprocessReturn {
  const [params, setParams] = useState<PreprocessParams>({ ...DEFAULT_PARAMS });
  const [output, setOutput] = useState<PreprocessorOutput | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const imageRef = useRef<ImageUploaderOutput | null>(null);

  const doPreprocess = useCallback(
    async (image: ImageUploaderOutput, currentParams: PreprocessParams) => {
      setIsProcessing(true);
      setError(null);

      try {
        // 从原图创建 OffscreenCanvas
        const img = new Image();
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('Failed to load image'));
          img.src = image.previewUrl;
        });

        const sourceCanvas = new OffscreenCanvas(img.naturalWidth, img.naturalHeight);
        const ctx = sourceCanvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);

        const result = await preprocessOnMainThread(sourceCanvas, currentParams);
        setOutput(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : '预处理失败');
      } finally {
        setIsProcessing(false);
      }
    },
    [],
  );

  const preprocess = useCallback(
    async (image: ImageUploaderOutput) => {
      imageRef.current = image;
      await doPreprocess(image, params);
    },
    [params, doPreprocess],
  );

  const updateParams = useCallback(
    (partial: Partial<PreprocessParams>) => {
      setParams((prev) => {
        const next = { ...prev, ...partial };
        // 参数变更时自动重新处理
        if (imageRef.current) {
          doPreprocess(imageRef.current, next);
        }
        return next;
      });
    },
    [doPreprocess],
  );

  const resetParams = useCallback(() => {
    setParams({ ...DEFAULT_PARAMS });
    if (imageRef.current) {
      doPreprocess(imageRef.current, { ...DEFAULT_PARAMS });
    }
  }, [doPreprocess]);

  // 清理预览 URL
  useEffect(() => {
    return () => {
      imageRef.current = null;
    };
  }, []);

  return { params, output, isProcessing, error, updateParams, resetParams, preprocess };
}
