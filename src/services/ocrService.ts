import type { RawOcrResult, TextBlock, BBox, ProgressStage } from '@/types';

export interface OcrServiceCallbacks {
  onProgress?: (stage: ProgressStage, progress: number, message: string) => void;
}

/**
 * OCR 服务 - 封装 @paddleocr/paddleocr-js
 */
export class OcrService {
  private ocr: PaddleOCRInstance | null = null;
  private initializing: Promise<PaddleOCRInstance> | null = null;

  async initialize(callbacks?: OcrServiceCallbacks): Promise<void> {
    if (this.ocr) return;

    if (this.initializing) {
      await this.initializing;
      return;
    }

    this.initializing = this.doInitialize(callbacks);
    try {
      this.ocr = await this.initializing;
    } finally {
      this.initializing = null;
    }
  }

  private async doInitialize(callbacks?: OcrServiceCallbacks): Promise<PaddleOCRInstance> {
    callbacks?.onProgress?.('model_loading', 0, '正在加载 OCR 模型...');

    const { PaddleOCR } = await import('@paddleocr/paddleocr-js');

    const instance = await PaddleOCR.create({
      lang: 'ch',
      ocrVersion: 'PP-OCRv5',
      worker: false, // 不使用内置 Worker，我们自己管理 Worker
      initialize: true,
    });

    callbacks?.onProgress?.('model_loading', 1, 'OCR 模型加载完成');
    return instance as PaddleOCRInstance;
  }

  async recognize(
    canvas: OffscreenCanvas | HTMLCanvasElement,
    callbacks?: OcrServiceCallbacks,
  ): Promise<RawOcrResult> {
    await this.initialize(callbacks);

    if (!this.ocr) {
      throw new Error('OCR engine not initialized');
    }

    const startTime = performance.now();

    callbacks?.onProgress?.('ocr_detecting', 0, '正在检测文字区域...');

    const results = await this.ocr.predict(canvas);

    callbacks?.onProgress?.('ocr_recognizing', 0.5, '正在识别文字内容...');

    const processingTime = performance.now() - startTime;

    // 转换为项目内部格式
    const textBlocks: TextBlock[] = [];

    if (results && results.length > 0) {
      const result = results[0]!;
      for (const item of result.items) {
        const bbox = polyToBBox(item.poly);
        textBlocks.push({
          text: item.text,
          confidence: item.score,
          boundingBox: bbox,
        });
      }
    }

    callbacks?.onProgress?.('ocr_recognizing', 1, '文字识别完成');

    return {
      textBlocks,
      processingTime,
    };
  }

  async dispose(): Promise<void> {
    if (this.ocr) {
      await this.ocr.dispose();
      this.ocr = null;
    }
  }

  get isInitialized(): boolean {
    return this.ocr !== null;
  }
}

/**
 * 将 PaddleOCR 的多边形坐标转换为 BBox
 * poly: [[x1,y1], [x2,y2], [x3,y3], [x4,y4]] → BBox
 */
function polyToBBox(poly: [number, number][]): BBox {
  if (!poly || poly.length < 2) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  const xs = poly.map((p) => p[0]);
  const ys = poly.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

// 类型定义：@paddleocr/paddleocr-js 的实例类型
interface PaddleOCRInstance {
  predict(
    input: unknown,
    params?: unknown,
  ): Promise<
    Array<{
      items: Array<{
        poly: [number, number][];
        text: string;
        score: number;
      }>;
    }>
  >;
  dispose(): Promise<void>;
}

// 单例
let ocrServiceInstance: OcrService | null = null;

export function getOcrService(): OcrService {
  if (!ocrServiceInstance) {
    ocrServiceInstance = new OcrService();
  }
  return ocrServiceInstance;
}
