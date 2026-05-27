import type { RecognizerOutput, PreprocessorOutput, ProgressStage, ProgressEvent } from '@/types';
import { getOcrService } from './ocrService';
import { getTableStructureService } from './tableStructureService';
import { mergeResults } from './resultMerger';

export type RecognizerProgressCallback = (event: ProgressEvent) => void;

/**
 * 表格识别服务 - 编排 OCR + SLANet + 结果合并
 */
export class RecognizerService {
  async recognize(
    preprocessedOutput: PreprocessorOutput,
    onProgress?: RecognizerProgressCallback,
  ): Promise<RecognizerOutput> {
    const canvas = preprocessedOutput.canvas;
    const sourceCanvas = preprocessedOutput.sourceCanvas;
    const sourceImageSize = preprocessedOutput.originalSize;

    // 1. OCR 文字识别（使用预处理后的 canvas，提高 OCR 精度）
    onProgress?.({
      stage: 'ocr_detecting',
      progress: 0,
      message: '正在检测文字区域...',
    });

    const ocrService = getOcrService();
    const ocrResult = await ocrService.recognize(canvas, {
      onProgress: (stage: ProgressStage, progress: number, message: string) => {
        onProgress?.({ stage, progress: progress * 0.5, message });
      },
    });

    onProgress?.({
      stage: 'ocr_recognizing',
      progress: 0.5,
      message: '文字识别完成',
    });

    // 2. SLANet 表格结构识别（使用原始尺寸的 sourceCanvas）
    onProgress?.({
      stage: 'table_structure',
      progress: 0.5,
      message: '正在识别表格结构...',
    });

    const structureService = getTableStructureService();
    const structureResult = await structureService.recognize(sourceCanvas, {
      onProgress: (stage: ProgressStage, progress: number, message: string) => {
        onProgress?.({ stage, progress: 0.5 + progress * 0.4, message });
      },
    });

    // 3. 结果合并
    onProgress?.({
      stage: 'result_merging',
      progress: 0.9,
      message: '正在合并识别结果...',
    });

    const tableData = mergeResults(ocrResult, structureResult, sourceImageSize);

    onProgress?.({
      stage: 'completed',
      progress: 1,
      message: '识别完成',
    });

    return {
      tableData,
      rawOcrResult: ocrResult,
      rawStructureResult: structureResult,
    };
  }

  async dispose(): Promise<void> {
    const ocrService = getOcrService();
    const structureService = getTableStructureService();
    await Promise.all([ocrService.dispose(), structureService.dispose()]);
  }
}

let recognizerServiceInstance: RecognizerService | null = null;

export function getRecognizerService(): RecognizerService {
  if (!recognizerServiceInstance) {
    recognizerServiceInstance = new RecognizerService();
  }
  return recognizerServiceInstance;
}
