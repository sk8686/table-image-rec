import type { PreprocessParams, PreprocessorOutput } from '@/types';

interface PreprocessWorkerMessage {
  type: 'preprocess';
  imageData: ImageBitmap;
  params: PreprocessParams;
}

interface PreprocessWorkerResult {
  type: 'result';
  canvas: OffscreenCanvas;
  appliedParams: PreprocessParams;
  originalSize: { width: number; height: number };
  processedSize: { width: number; height: number };
}

interface PreprocessWorkerError {
  type: 'error';
  message: string;
}

type WorkerResponse = PreprocessWorkerResult | PreprocessWorkerError;

let worker: Worker | null = null;

function getWorker(): Worker {
  if (worker) return worker;

  worker = new Worker(new URL('../workers/preprocessWorker.ts', import.meta.url), {
    type: 'module',
  });

  worker.onerror = (e) => {
    console.error('PreprocessWorker error:', e);
  };

  return worker;
}

function resetWorker(): void {
  if (worker) {
    worker.terminate();
    worker = null;
  }
}

/**
 * 在 Worker 中执行预处理
 */
export async function preprocessInWorker(
  imageSource: ImageBitmap | HTMLCanvasElement | OffscreenCanvas,
  params: PreprocessParams,
): Promise<PreprocessorOutput> {
  // 将输入转换为 ImageBitmap
  let bitmap: ImageBitmap;
  if (imageSource instanceof ImageBitmap) {
    bitmap = imageSource;
  } else {
    bitmap = await createImageBitmap(imageSource);
  }

  return new Promise<PreprocessorOutput>((resolve, reject) => {
    const w = getWorker();

    const handleMessage = (e: MessageEvent<WorkerResponse>) => {
      w.removeEventListener('message', handleMessage);
      w.removeEventListener('error', handleError);

      const data = e.data;
      if (data.type === 'error') {
        reject(new Error(data.message));
        return;
      }

      resolve({
        canvas: data.canvas,
        appliedParams: data.appliedParams,
        originalSize: data.originalSize,
        processedSize: data.processedSize,
      });
    };

    const handleError = () => {
      w.removeEventListener('message', handleMessage);
      w.removeEventListener('error', handleError);
      resetWorker();
      reject(new Error('Worker communication failed'));
    };

    w.addEventListener('message', handleMessage);
    w.addEventListener('error', handleError);

    const message: PreprocessWorkerMessage = {
      type: 'preprocess',
      imageData: bitmap,
      params,
    };

    w.postMessage(message, [bitmap]);
  });
}

/**
 * 主线程预处理（用于测试或 Worker 不可用时降级）
 */
export async function preprocessOnMainThread(
  imageSource: HTMLCanvasElement | OffscreenCanvas,
  params: PreprocessParams,
): Promise<PreprocessorOutput> {
  // 动态导入避免循环依赖
  const { preprocess } = await import('./preprocessCore');

  let sourceCanvas: OffscreenCanvas;
  if (imageSource instanceof OffscreenCanvas) {
    sourceCanvas = imageSource;
  } else {
    // HTMLCanvasElement → OffscreenCanvas
    sourceCanvas = new OffscreenCanvas(imageSource.width, imageSource.height);
    const ctx = sourceCanvas.getContext('2d')!;
    ctx.drawImage(imageSource, 0, 0);
  }

  return preprocess(sourceCanvas, params);
}

export { resetWorker };
