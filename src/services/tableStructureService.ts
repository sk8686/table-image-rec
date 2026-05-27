import type { RawStructureResult, CellRegion, BBox, ProgressStage } from '@/types';

export interface TableStructureCallbacks {
  onProgress?: (stage: ProgressStage, progress: number, message: string) => void;
}

// SLANet-plus HTML token 词汇表（48 个字符 + sos + eos = 50 个 token）
// 从 ONNX 模型 metadata 中提取
const DICT_CHARACTER: string[] = [
  '<thead>',
  '</thead>',
  '<tbody>',
  '</tbody>',
  '<tr>',
  '</tr>',
  '<td',
  '>',
  '</td>',
  ' colspan="2"',
  ' colspan="3"',
  ' colspan="4"',
  ' colspan="5"',
  ' colspan="6"',
  ' colspan="7"',
  ' colspan="8"',
  ' colspan="9"',
  ' colspan="10"',
  ' colspan="11"',
  ' colspan="12"',
  ' colspan="13"',
  ' colspan="14"',
  ' colspan="15"',
  ' colspan="16"',
  ' colspan="17"',
  ' colspan="18"',
  ' colspan="19"',
  ' colspan="20"',
  ' rowspan="2"',
  ' rowspan="3"',
  ' rowspan="4"',
  ' rowspan="5"',
  ' rowspan="6"',
  ' rowspan="7"',
  ' rowspan="8"',
  ' rowspan="9"',
  ' rowspan="10"',
  ' rowspan="11"',
  ' rowspan="12"',
  ' rowspan="13"',
  ' rowspan="14"',
  ' rowspan="15"',
  ' rowspan="16"',
  ' rowspan="17"',
  ' rowspan="18"',
  ' rowspan="19"',
  ' rowspan="20"',
  '<td></td>',
];

// 添加特殊 token: sos (start) 和 eos (end)
const BEG_STR = 'sos';
const END_STR = 'eos';
const FULL_VOCAB: string[] = [BEG_STR, ...DICT_CHARACTER, END_STR];

const MODEL_INPUT_SIZE = 488;
const IMAGENET_MEAN = [0.485, 0.456, 0.406];
const IMAGENET_STD = [0.229, 0.224, 0.225];
const NUM_CLASSES = FULL_VOCAB.length; // 50
const BBOX_VALUES = 8; // 4 个点 × 2 坐标 = 8 个值

// Cell token 标识
const TD_TOKENS = ['<td', '<td></td>'];

/**
 * SLANet 预处理 - 返回 Float32Array 和尺寸信息
 */
export function preprocessImageData(canvas: OffscreenCanvas | HTMLCanvasElement): {
  floatData: Float32Array;
  resizeWidth: number;
  resizeHeight: number;
} {
  const srcWidth = canvas.width;
  const srcHeight = canvas.height;

  const ratio = MODEL_INPUT_SIZE / Math.max(srcWidth, srcHeight);
  const resizeWidth = Math.round(srcWidth * ratio);
  const resizeHeight = Math.round(srcHeight * ratio);

  const paddedCanvas = new OffscreenCanvas(MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
  const paddedCtx = paddedCanvas.getContext('2d')!;
  paddedCtx.fillStyle = '#000000';
  paddedCtx.fillRect(0, 0, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
  paddedCtx.drawImage(canvas, 0, 0, resizeWidth, resizeHeight);

  const paddedData = paddedCtx.getImageData(0, 0, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
  const paddedPixels = paddedData.data;

  const floatData = new Float32Array(3 * MODEL_INPUT_SIZE * MODEL_INPUT_SIZE);
  const channelSize = MODEL_INPUT_SIZE * MODEL_INPUT_SIZE;

  const IMAGENET_MEAN_R = IMAGENET_MEAN[0]!;
  const IMAGENET_MEAN_G = IMAGENET_MEAN[1]!;
  const IMAGENET_MEAN_B = IMAGENET_MEAN[2]!;
  const IMAGENET_STD_R = IMAGENET_STD[0]!;
  const IMAGENET_STD_G = IMAGENET_STD[1]!;
  const IMAGENET_STD_B = IMAGENET_STD[2]!;

  for (let i = 0; i < channelSize; i++) {
    const r = paddedPixels[i * 4]! / 255;
    const g = paddedPixels[i * 4 + 1]! / 255;
    const b = paddedPixels[i * 4 + 2]! / 255;

    floatData[i] = (b - IMAGENET_MEAN_B) / IMAGENET_STD_B;
    floatData[channelSize + i] = (g - IMAGENET_MEAN_G) / IMAGENET_STD_G;
    floatData[2 * channelSize + i] = (r - IMAGENET_MEAN_R) / IMAGENET_STD_R;
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
  const seqLen = structProbsData.length / NUM_CLASSES;
  const endIdx = FULL_VOCAB.indexOf(END_STR);

  const htmlTokens: string[] = [];
  const cellBboxes: number[][] = [];
  const scores: number[] = [];

  for (let t = 0; t < seqLen; t++) {
    let maxIdx = 0;
    let maxVal = -Infinity;
    for (let c = 0; c < NUM_CLASSES; c++) {
      const prob = structProbsData[t * NUM_CLASSES + c]!;
      if (prob > maxVal) {
        maxVal = prob;
        maxIdx = c;
      }
    }

    // 跳过 sos token
    if (t === 0 && maxIdx === 0) continue;

    // 遇到 eos 停止
    if (maxIdx === endIdx) break;

    // 跳过 sos 和 eos
    if (maxIdx === 0 || maxIdx === endIdx) continue;

    const tokenStr = FULL_VOCAB[maxIdx] ?? '';
    htmlTokens.push(tokenStr);
    scores.push(maxVal);

    // 提取 cell token 的 bbox
    if (TD_TOKENS.includes(tokenStr)) {
      const bbox: number[] = [];
      for (let b = 0; b < BBOX_VALUES; b++) {
        bbox.push(locPredsData[t * BBOX_VALUES + b]!);
      }
      cellBboxes.push(bbox);
    }
  }

  // 包裹 HTML 结构
  const html = wrapWithHtmlStruct(htmlTokens);

  // 解码 bbox 并过滤全零的
  const decodedBboxes = decodeBboxes(cellBboxes, srcWidth, srcHeight, resizeWidth, resizeHeight);

  const cells = parseHTMLToCellGrid(html, decodedBboxes, srcWidth, srcHeight);

  return { html, cells };
}

/**
 * 包裹 HTML 结构
 */
function wrapWithHtmlStruct(tokens: string[]): string {
  return `<html><body><table>${tokens.join('')}</table></body></html>`;
}

/**
 * 解码 bbox：8 个值 → 4 个角点坐标 → 转换为原始图像坐标
 * 8 个值: [x1, y1, x2, y2, x3, y3, x4, y4]（4 个角点）
 * 转换为 [x_min, y_min, x_max, y_max]
 */
function decodeBboxes(
  rawBboxes: number[][],
  srcWidth: number,
  srcHeight: number,
  resizeWidth: number,
  resizeHeight: number,
): number[][] {
  const result: number[][] = [];

  for (const raw of rawBboxes) {
    // 过滤全零 bbox
    if (raw.every((v) => v === 0)) continue;

    // 8 个值 → 4 对坐标
    // 先乘以 488 得到像素坐标
    const xs: number[] = [];
    const ys: number[] = [];
    for (let i = 0; i < 4; i++) {
      xs.push(raw[i * 2]! * MODEL_INPUT_SIZE);
      ys.push(raw[i * 2 + 1]! * MODEL_INPUT_SIZE);
    }

    // SLANetPlus 需要额外缩放 padding ratio
    const wRatio = MODEL_INPUT_SIZE / resizeWidth;
    const hRatio = MODEL_INPUT_SIZE / resizeHeight;

    const scaledXs = xs.map((x) => x / wRatio);
    const scaledYs = ys.map((y) => y / hRatio);

    // 转换为 [x_min, y_min, x_max, y_max]
    const xMin = Math.min(...scaledXs);
    const yMin = Math.min(...scaledYs);
    const xMax = Math.max(...scaledXs);
    const yMax = Math.max(...scaledYs);

    // 缩放回原始图像坐标
    const scaleX = srcWidth / resizeWidth;
    const scaleY = srcHeight / resizeHeight;

    result.push([xMin * scaleX, yMin * scaleY, xMax * scaleX, yMax * scaleY]);
  }

  return result;
}

/**
 * 解析 HTML 获取单元格网格信息
 */
export function parseHTMLToCellGrid(
  html: string,
  bboxes: number[][],
  _srcWidth: number,
  _srcHeight: number,
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
      for (const col of Object.keys(rowSpanMap)) {
        const val = rowSpanMap[Number(col)];
        if (val !== undefined) rowSpanMap[Number(col)] = val - 1;
      }
      currentRow += 1;
      currentCol = -1;
    } else if (tag === '</tr>') {
      for (const col of Object.keys(rowSpanMap)) {
        const val = rowSpanMap[Number(col)];
        if (val !== undefined && val < 0) {
          delete rowSpanMap[Number(col)];
        }
      }
    } else if (tag.startsWith('<td') || tag.startsWith('<th')) {
      currentCol += 1;
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

      const bbox: BBox = {
        x: Math.round(rawBbox[0]!),
        y: Math.round(rawBbox[1]!),
        width: Math.round(rawBbox[2]! - rawBbox[0]!),
        height: Math.round(rawBbox[3]! - rawBbox[1]!),
      };

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

export {
  DICT_CHARACTER,
  FULL_VOCAB,
  MODEL_INPUT_SIZE,
  IMAGENET_MEAN,
  IMAGENET_STD,
  NUM_CLASSES,
  BBOX_VALUES,
  BEG_STR,
  END_STR,
};

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
    ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.22.0/dist/';

    callbacks?.onProgress?.('model_loading', 0.3, '正在初始化推理引擎...');

    try {
      this.session = await ort.InferenceSession.create(this.modelUrl, {
        executionProviders: ['wasm'],
      });
    } catch (err) {
      throw new Error(
        `表格结构识别模型加载失败: ${err instanceof Error ? err.message : '未知错误'}`,
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

    const { floatData, resizeWidth, resizeHeight } = preprocessImageData(canvas);

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

    const structProbs = outputs[this.session.outputNames[1] as string];
    const locPreds = outputs[this.session.outputNames[0] as string];

    if (!structProbs || !locPreds) {
      throw new Error('模型输出格式异常');
    }

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
