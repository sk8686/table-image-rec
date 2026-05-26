import type { RawStructureResult, CellRegion, BBox, ProgressStage } from '@/types';

export interface TableStructureCallbacks {
  onProgress?: (stage: ProgressStage, progress: number, message: string) => void;
}

// SLANet HTML token 词汇表（30 个 token）
const DICT_HTML: Record<number, string> = {
  0: ' ',
  1: '<html>',
  2: '</html>',
  3: '<head>',
  4: '</head>',
  5: '<body>',
  6: '</body>',
  7: '<table>',
  8: '</table>',
  9: '<thead>',
  10: '</thead>',
  11: '<tbody>',
  12: '</tbody>',
  13: '<tr>',
  14: '</tr>',
  15: '<td>',
  16: '</td>',
  17: '<td',
  18: ' colspan="',
  19: ' rowspan="',
  20: '>',
  21: '<th>',
  22: '</th>',
  23: '<th',
  24: '1',
  25: '2',
  26: '3',
  27: '4',
  28: '5',
  29: '6',
};

const MODEL_INPUT_SIZE = 488;
const IMAGENET_MEAN = [0.485, 0.456, 0.406];
const IMAGENET_STD = [0.229, 0.224, 0.225];
const MAX_TEXT_LENGTH = 500;
const NUM_CLASSES = 30;

/**
 * SLANet 预处理 - 返回 Float32Array 和尺寸信息
 * 不依赖 onnxruntime-web，便于测试
 */
export function preprocessImageData(canvas: OffscreenCanvas | HTMLCanvasElement): {
  floatData: Float32Array;
  resizeWidth: number;
  resizeHeight: number;
} {
  const srcWidth = canvas.width;
  const srcHeight = canvas.height;

  // resize 最长边到 488
  const ratio = MODEL_INPUT_SIZE / Math.max(srcWidth, srcHeight);
  const resizeWidth = Math.round(srcWidth * ratio);
  const resizeHeight = Math.round(srcHeight * ratio);

  // 创建 488x488 的画布并绘制缩放后的图像
  const paddedCanvas = new OffscreenCanvas(MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
  const paddedCtx = paddedCanvas.getContext('2d')!;
  paddedCtx.fillStyle = '#000000';
  paddedCtx.fillRect(0, 0, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
  paddedCtx.drawImage(canvas, 0, 0, resizeWidth, resizeHeight);

  const paddedData = paddedCtx.getImageData(0, 0, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
  const paddedPixels = paddedData.data;

  // 标准化 + HWC → CHW (BGR 格式)
  const floatData = new Float32Array(3 * MODEL_INPUT_SIZE * MODEL_INPUT_SIZE);
  const channelSize = MODEL_INPUT_SIZE * MODEL_INPUT_SIZE;

  for (let i = 0; i < channelSize; i++) {
    const r = paddedPixels[i * 4]! / 255;
    const g = paddedPixels[i * 4 + 1]! / 255;
    const b = paddedPixels[i * 4 + 2]! / 255;

    floatData[i] = (b - IMAGENET_MEAN[2]) / IMAGENET_STD[2];
    floatData[channelSize + i] = (g - IMAGENET_MEAN[1]) / IMAGENET_STD[1];
    floatData[2 * channelSize + i] = (r - IMAGENET_MEAN[0]) / IMAGENET_STD[0];
  }

  return { floatData, resizeWidth, resizeHeight };
}

/**
 * SLANet 后处理
 */
export function postprocessSLANet(
  structProbsData: Float32Array,
  locPredsData: Float32Array,
  srcWidth: number,
  srcHeight: number,
  resizeWidth: number,
  resizeHeight: number,
): { html: string; cells: CellRegion[] } {
  const htmlTokens: string[] = [];
  const cellBboxes: number[][] = [];

  for (let t = 0; t < MAX_TEXT_LENGTH; t++) {
    let maxIdx = 0;
    let maxVal = -Infinity;
    for (let c = 0; c < NUM_CLASSES; c++) {
      const prob = structProbsData[t * NUM_CLASSES + c]!;
      if (prob > maxVal) {
        maxVal = prob;
        maxIdx = c;
      }
    }

    const tokenStr = DICT_HTML[maxIdx] ?? ' ';

    if (tokenStr === '</html>') {
      htmlTokens.push(tokenStr);
      break;
    }

    htmlTokens.push(tokenStr);

    if (tokenStr === '<td>' || tokenStr === '<td' || tokenStr === '<th>' || tokenStr === '<th') {
      const x1 = locPredsData[t * 4]!;
      const y1 = locPredsData[t * 4 + 1]!;
      const x2 = locPredsData[t * 4 + 2]!;
      const y2 = locPredsData[t * 4 + 3]!;
      cellBboxes.push([x1, y1, x2, y2]);
    }
  }

  const html = htmlTokens.join('');
  const cells = parseHTMLToCellGrid(
    html,
    cellBboxes,
    srcWidth,
    srcHeight,
    resizeWidth,
    resizeHeight,
  );

  return { html, cells };
}

/**
 * 解析 HTML 获取单元格网格信息
 */
export function parseHTMLToCellGrid(
  html: string,
  bboxes: number[][],
  srcWidth: number,
  srcHeight: number,
  resizeWidth: number,
  resizeHeight: number,
): CellRegion[] {
  const cells: CellRegion[] = [];
  let currentRow = -1;
  let currentCol = -1;
  let bboxIdx = 0;
  const rowSpanMap: Record<number, number> = {};

  const tagRegex = /<\/?[\w=" ]+>/g;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(html)) !== null) {
    const tag = match[0]!;

    if (tag === '<tr>') {
      // 递减上一行遗留的 rowspan 计数
      // 注意：值为 0 表示当前行仍被占据（是 rowspan 的最后一行）
      for (const col of Object.keys(rowSpanMap)) {
        rowSpanMap[Number(col)] -= 1;
        // 不删除值为 0 的项，因为当前行仍被占据
      }
      currentRow += 1;
      currentCol = -1;
    } else if (tag === '</tr>') {
      // 行结束后清理值为 0 的项（当前行已处理完毕）
      for (const col of Object.keys(rowSpanMap)) {
        if (rowSpanMap[Number(col)] < 0) {
          delete rowSpanMap[Number(col)];
        }
      }
    } else if (tag.startsWith('<td') || tag.startsWith('<th')) {
      currentCol += 1;
      // 跳过被 rowspan 占据的列（值 >= 0 表示被占据）
      while (rowSpanMap[currentCol] !== undefined && rowSpanMap[currentCol]! >= 0) {
        currentCol += 1;
      }

      let colSpan = 1;
      let rowSpan = 1;

      const colspanMatch = tag.match(/colspan="(\d+)"/);
      if (colspanMatch) {
        colSpan = parseInt(colspanMatch[1]!, 10);
      }

      const rowspanMatch = tag.match(/rowspan="(\d+)"/);
      if (rowspanMatch) {
        rowSpan = parseInt(rowspanMatch[1]!, 10);
      }

      const rawBbox = bboxIdx < bboxes.length ? bboxes[bboxIdx]! : [0, 0, 0, 0];
      bboxIdx += 1;

      const bbox = rescaleBBox(rawBbox, srcWidth, srcHeight, resizeWidth, resizeHeight);

      cells.push({
        rowIndex: currentRow,
        colIndex: currentCol,
        rowSpan,
        colSpan,
        boundingBox: bbox,
      });

      for (let c = 1; c < colSpan; c++) {
        rowSpanMap[currentCol + c] = 0;
      }

      if (rowSpan > 1) {
        for (let c = 0; c < colSpan; c++) {
          rowSpanMap[currentCol + c] = rowSpan - 1;
        }
      }
    }
  }

  return cells;
}

/**
 * 将 bbox 从 488x488 归一化坐标转换回原始图像坐标
 */
export function rescaleBBox(
  rawBbox: number[],
  srcWidth: number,
  srcHeight: number,
  resizeWidth: number,
  resizeHeight: number,
): BBox {
  let [x1, y1, x2, y2] = rawBbox;

  x1 = x1 * MODEL_INPUT_SIZE;
  y1 = y1 * MODEL_INPUT_SIZE;
  x2 = x2 * MODEL_INPUT_SIZE;
  y2 = y2 * MODEL_INPUT_SIZE;

  x1 = Math.max(0, Math.min(x1, resizeWidth));
  y1 = Math.max(0, Math.min(y1, resizeHeight));
  x2 = Math.max(0, Math.min(x2, resizeWidth));
  y2 = Math.max(0, Math.min(y2, resizeHeight));

  const scaleX = srcWidth / resizeWidth;
  const scaleY = srcHeight / resizeHeight;

  x1 = x1 * scaleX;
  y1 = y1 * scaleY;
  x2 = x2 * scaleX;
  y2 = y2 * scaleY;

  return {
    x: Math.round(x1),
    y: Math.round(y1),
    width: Math.round(x2 - x1),
    height: Math.round(y2 - y1),
  };
}

export { DICT_HTML, MODEL_INPUT_SIZE, IMAGENET_MEAN, IMAGENET_STD, NUM_CLASSES, MAX_TEXT_LENGTH };

/**
 * SLANet 表格结构识别服务
 */
export class TableStructureService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private session: any = null;
  private initializing: Promise<void> | null = null;
  private modelUrl: string;

  constructor(modelUrl = '/models/table_structure/slanet-plus.onnx') {
    this.modelUrl = modelUrl;
  }

  async initialize(callbacks?: TableStructureCallbacks): Promise<void> {
    if (this.session) return;
    if (this.initializing) {
      await this.initializing;
      return;
    }

    this.initializing = this.doInitialize(callbacks);
    try {
      await this.initializing;
    } finally {
      this.initializing = null;
    }
  }

  private async doInitialize(callbacks?: TableStructureCallbacks): Promise<void> {
    callbacks?.onProgress?.('model_download', 0, '正在下载表格结构识别模型...');

    const ort = await import('onnxruntime-web');
    // 使用 CDN 加载 WASM 文件，避免本地路径问题
    ort.env.wasm.wasmPaths =
      'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/';

    callbacks?.onProgress?.('model_loading', 0.3, '正在初始化推理引擎...');

    try {
      this.session = await ort.InferenceSession.create(this.modelUrl, {
        executionProviders: ['wasm'],
      });
    } catch (err) {
      throw new Error(
        `表格结构识别模型加载失败: ${err instanceof Error ? err.message : '未知错误'}`,
        { cause: err },
      );
    }

    callbacks?.onProgress?.('model_loading', 1, '表格结构识别模型加载完成');
  }

  async recognize(
    canvas: OffscreenCanvas | HTMLCanvasElement,
    callbacks?: TableStructureCallbacks,
  ): Promise<RawStructureResult> {
    await this.initialize(callbacks);

    if (!this.session) {
      throw new Error('Table structure model not initialized');
    }

    const startTime = performance.now();
    callbacks?.onProgress?.('table_structure', 0, '正在识别表格结构...');

    const srcWidth = canvas.width;
    const srcHeight = canvas.height;

    // 预处理
    const { floatData, resizeWidth, resizeHeight } = preprocessImageData(canvas);

    // 创建 Tensor 并推理
    const ort = await import('onnxruntime-web');
    const inputTensor = new ort.Tensor('float32', floatData, [
      1,
      3,
      MODEL_INPUT_SIZE,
      MODEL_INPUT_SIZE,
    ]);
    const inputName = this.session.inputNames[0] as string;
    const feeds = { [inputName]: inputTensor };

    const outputs = await this.session.run(feeds);

    const structProbs = outputs[this.session.outputNames[0] as string];
    const locPreds = outputs[this.session.outputNames[1] as string];

    if (!structProbs || !locPreds) {
      throw new Error('模型输出格式异常');
    }

    // 后处理
    const { html, cells } = postprocessSLANet(
      structProbs.data as Float32Array,
      locPreds.data as Float32Array,
      srcWidth,
      srcHeight,
      resizeWidth,
      resizeHeight,
    );

    const processingTime = performance.now() - startTime;
    callbacks?.onProgress?.('table_structure', 1, '表格结构识别完成');

    return { html, cells, processingTime };
  }

  async dispose(): Promise<void> {
    if (this.session) {
      this.session.release();
      this.session = null;
    }
  }

  get isInitialized(): boolean {
    return this.session !== null;
  }
}

let tableStructureServiceInstance: TableStructureService | null = null;

export function getTableStructureService(): TableStructureService {
  if (!tableStructureServiceInstance) {
    tableStructureServiceInstance = new TableStructureService();
  }
  return tableStructureServiceInstance;
}
