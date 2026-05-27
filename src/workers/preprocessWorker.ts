import { preprocess } from '../services/preprocessCore';
import type { PreprocessParams } from '../types';

interface PreprocessRequest {
  type: 'preprocess';
  imageData: ImageBitmap;
  params: PreprocessParams;
}

interface PreprocessResponse {
  type: 'result';
  canvas: OffscreenCanvas;
  appliedParams: PreprocessParams;
  originalSize: { width: number; height: number };
  processedSize: { width: number; height: number };
}

interface PreprocessErrorResponse {
  type: 'error';
  message: string;
}

self.onmessage = async (e: MessageEvent<PreprocessRequest>) => {
  const { imageData, params } = e.data;

  try {
    // 将 ImageBitmap 绘制到 OffscreenCanvas
    const sourceCanvas = new OffscreenCanvas(imageData.width, imageData.height);
    const ctx = sourceCanvas.getContext('2d')!;
    ctx.drawImage(imageData, 0, 0);

    const result = preprocess(sourceCanvas, params);

    const response: PreprocessResponse = {
      type: 'result',
      canvas: result.canvas,
      appliedParams: result.appliedParams,
      originalSize: result.originalSize,
      processedSize: result.processedSize,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (self as any).postMessage(response, [result.canvas]);
  } catch (err) {
    const response: PreprocessErrorResponse = {
      type: 'error',
      message: err instanceof Error ? err.message : 'Unknown error',
    };
    self.postMessage(response);
  } finally {
    imageData.close();
  }
};
