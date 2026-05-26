import type {
  RawOcrResult,
  RawStructureResult,
  TableData,
  Row,
  Cell,
  BBox,
  TableMetadata,
} from '@/types';

const UNCERTAINTY_THRESHOLD = 0.85;

/**
 * 将 OCR 文字识别结果与 SLANet 表格结构结果合并
 * 核心逻辑：根据坐标匹配，将 OCR 识别的文字填入对应的表格单元格
 */
export function mergeResults(
  ocrResult: RawOcrResult,
  structureResult: RawStructureResult,
  sourceImageSize: { width: number; height: number },
): TableData {
  const cells = structureResult.cells;
  const textBlocks = ocrResult.textBlocks;

  // 如果没有结构信息，返回空表格
  if (cells.length === 0) {
    return {
      rows: [],
      colCount: 0,
      rowCount: 0,
      metadata: buildMetadata(ocrResult, structureResult, sourceImageSize),
    };
  }

  // 计算表格维度
  let maxRow = 0;
  let maxCol = 0;
  for (const cell of cells) {
    maxRow = Math.max(maxRow, cell.rowIndex + cell.rowSpan - 1);
    maxCol = Math.max(maxCol, cell.colIndex + cell.colSpan - 1);
  }

  const rowCount = maxRow + 1;
  const colCount = maxCol + 1;

  // 创建单元格网格
  const grid: (Cell | null)[][] = Array.from({ length: rowCount }, () =>
    Array.from({ length: colCount }, () => null),
  );

  // 填充结构信息
  for (const region of cells) {
    const matchedText = matchTextToCell(region.boundingBox, textBlocks);

    const cell: Cell = {
      text: matchedText.text,
      rowSpan: region.rowSpan,
      colSpan: region.colSpan,
      confidence: matchedText.confidence,
      isUncertain: matchedText.confidence < UNCERTAINTY_THRESHOLD,
      boundingBox: region.boundingBox,
    };

    grid[region.rowIndex]![region.colIndex] = cell;
  }

  // 填充空单元格（被合并的格子）
  for (let r = 0; r < rowCount; r++) {
    for (let c = 0; c < colCount; c++) {
      if (grid[r]![c] === null) {
        grid[r]![c] = {
          text: '',
          rowSpan: 0,
          colSpan: 0,
          confidence: 0,
          isUncertain: false,
        };
      }
    }
  }

  // 转换为 TableData
  const rows: Row[] = grid.map((row) => ({
    cells: row as Cell[],
  }));

  return {
    rows,
    colCount,
    rowCount,
    metadata: buildMetadata(ocrResult, structureResult, sourceImageSize),
  };
}

/**
 * 将 OCR 文字块匹配到表格单元格
 * 使用 IoU（交并比）匹配
 */
function matchTextToCell(
  cellBBox: BBox,
  textBlocks: { text: string; confidence: number; boundingBox: BBox }[],
): { text: string; confidence: number } {
  if (textBlocks.length === 0) {
    return { text: '', confidence: 0 };
  }

  const cellArea = cellBBox.width * cellBBox.height;
  if (cellArea === 0) {
    return { text: '', confidence: 0 };
  }

  // 收集所有与单元格有重叠的文字块
  const matchedTexts: { text: string; confidence: number; overlap: number }[] = [];

  for (const block of textBlocks) {
    const iou = calculateIoU(cellBBox, block.boundingBox);
    const overlap = calculateOverlap(cellBBox, block.boundingBox);

    if (iou > 0 || overlap > 0.3) {
      matchedTexts.push({
        text: block.text,
        confidence: block.confidence,
        overlap,
      });
    }
  }

  if (matchedTexts.length === 0) {
    return { text: '', confidence: 0 };
  }

  // 合并文字
  const text = matchedTexts.map((m) => m.text).join(' ');
  const confidence = matchedTexts.reduce((sum, m) => sum + m.confidence, 0) / matchedTexts.length;

  return { text, confidence };
}

/**
 * 计算两个 BBox 的 IoU（交并比）
 */
function calculateIoU(a: BBox, b: BBox): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.width, b.x + b.width);
  const y2 = Math.min(a.y + a.height, b.y + b.height);

  if (x2 <= x1 || y2 <= y1) return 0;

  const intersection = (x2 - x1) * (y2 - y1);
  const areaA = a.width * a.height;
  const areaB = b.width * b.height;
  const union = areaA + areaB - intersection;

  if (union <= 0) return 0;

  return intersection / union;
}

/**
 * 计算文字块在单元格内的覆盖比例
 */
function calculateOverlap(cellBBox: BBox, textBBox: BBox): number {
  const x1 = Math.max(cellBBox.x, textBBox.x);
  const y1 = Math.max(cellBBox.y, textBBox.y);
  const x2 = Math.min(cellBBox.x + cellBBox.width, textBBox.x + textBBox.width);
  const y2 = Math.min(cellBBox.y + cellBBox.height, textBBox.y + textBBox.height);

  if (x2 <= x1 || y2 <= y1) return 0;

  const intersection = (x2 - x1) * (y2 - y1);
  const textArea = textBBox.width * textBBox.height;

  if (textArea <= 0) return 0;

  return intersection / textArea;
}

function buildMetadata(
  ocrResult: RawOcrResult,
  structureResult: RawStructureResult,
  sourceImageSize: { width: number; height: number },
): TableMetadata {
  return {
    sourceImageSize,
    recognizedAt: Date.now(),
    processingTime: ocrResult.processingTime + structureResult.processingTime,
    ocrTime: ocrResult.processingTime,
    structureTime: structureResult.processingTime,
    engineVersion: 'PP-OCRv5 + SLANet',
    language: 'ch',
  };
}

export { UNCERTAINTY_THRESHOLD, calculateIoU, matchTextToCell };
