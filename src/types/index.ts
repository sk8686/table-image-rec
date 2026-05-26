// ===== 图片上传 =====
export interface ImageUploaderOutput {
  file: File;
  previewUrl: string;
  width: number;
  height: number;
  fileSize: number;
  format: string;
}

// ===== 图片预处理 =====
export interface PreprocessParams {
  rotation: number;
  cropRegion: CropRect | null;
  contrast: number;
  brightness: number;
  autoDeskew: boolean;
  maxSideLength: number;
}

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PreprocessorOutput {
  canvas: OffscreenCanvas;
  appliedParams: PreprocessParams;
  originalSize: { width: number; height: number };
  processedSize: { width: number; height: number };
}

// ===== 表格数据（核心） =====
export interface TableData {
  rows: Row[];
  colCount: number;
  rowCount: number;
  metadata: TableMetadata;
}

export interface Row {
  cells: Cell[];
}

export interface Cell {
  text: string;
  rowSpan: number;
  colSpan: number;
  confidence: number;
  isUncertain: boolean;
  boundingBox?: BBox;
}

export interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TableMetadata {
  sourceImageSize: { width: number; height: number };
  recognizedAt: number;
  processingTime: number;
  ocrTime: number;
  structureTime: number;
  engineVersion: string;
  language: string;
}

// ===== 识别结果 =====
export interface RecognizerOutput {
  tableData: TableData;
  rawOcrResult: RawOcrResult;
  rawStructureResult: RawStructureResult;
}

export interface RawOcrResult {
  textBlocks: TextBlock[];
  processingTime: number;
}

export interface TextBlock {
  text: string;
  confidence: number;
  boundingBox: BBox;
}

export interface RawStructureResult {
  html: string;
  cells: CellRegion[];
  processingTime: number;
}

export interface CellRegion {
  rowIndex: number;
  colIndex: number;
  rowSpan: number;
  colSpan: number;
  boundingBox: BBox;
}

// ===== 进度追踪 =====
export type ProgressStage =
  | 'model_download'
  | 'model_loading'
  | 'preprocessing'
  | 'ocr_detecting'
  | 'ocr_recognizing'
  | 'table_structure'
  | 'result_merging'
  | 'completed';

export interface ProgressEvent {
  stage: ProgressStage;
  progress: number;
  message: string;
  estimatedTimeRemaining?: number;
}

// ===== 导出 =====
export interface ExporterInput {
  tableData: TableData;
  format: 'xlsx' | 'csv';
  filename?: string;
}

export interface ExporterOutput {
  success: boolean;
  filename: string;
  fileSize: number;
  error?: string;
}
