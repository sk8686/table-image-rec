import { describe, it, expect } from 'vitest';
import { mergeResults, calculateIoU, UNCERTAINTY_THRESHOLD } from './resultMerger';
import type { RawOcrResult, RawStructureResult, BBox } from '@/types';

describe('calculateIoU', () => {
  it('should return 0 for non-overlapping boxes', () => {
    const a: BBox = { x: 0, y: 0, width: 10, height: 10 };
    const b: BBox = { x: 20, y: 20, width: 10, height: 10 };
    expect(calculateIoU(a, b)).toBe(0);
  });

  it('should return 1 for identical boxes', () => {
    const a: BBox = { x: 0, y: 0, width: 10, height: 10 };
    expect(calculateIoU(a, a)).toBeCloseTo(1);
  });

  it('should calculate partial overlap correctly', () => {
    const a: BBox = { x: 0, y: 0, width: 10, height: 10 };
    const b: BBox = { x: 5, y: 5, width: 10, height: 10 };
    // intersection = 5*5 = 25, union = 100 + 100 - 25 = 175
    expect(calculateIoU(a, b)).toBeCloseTo(25 / 175);
  });

  it('should return 0 for zero-area boxes', () => {
    const a: BBox = { x: 0, y: 0, width: 0, height: 0 };
    const b: BBox = { x: 0, y: 0, width: 10, height: 10 };
    expect(calculateIoU(a, b)).toBe(0);
  });
});

describe('mergeResults', () => {
  it('should merge OCR and structure results into TableData', () => {
    const ocrResult: RawOcrResult = {
      textBlocks: [
        {
          text: '姓名',
          confidence: 0.95,
          boundingBox: { x: 10, y: 10, width: 80, height: 30 },
        },
        {
          text: '年龄',
          confidence: 0.9,
          boundingBox: { x: 110, y: 10, width: 80, height: 30 },
        },
        {
          text: '张三',
          confidence: 0.92,
          boundingBox: { x: 10, y: 50, width: 80, height: 30 },
        },
        {
          text: '25',
          confidence: 0.88,
          boundingBox: { x: 110, y: 50, width: 80, height: 30 },
        },
      ],
      processingTime: 100,
    };

    const structureResult: RawStructureResult = {
      html: '<html><body><table><tbody><tr><td></td><td></td></tr><tr><td></td><td></td></tr></tbody></table></body></html>',
      cells: [
        {
          rowIndex: 0,
          colIndex: 0,
          rowSpan: 1,
          colSpan: 1,
          boundingBox: { x: 5, y: 5, width: 90, height: 40 },
        },
        {
          rowIndex: 0,
          colIndex: 1,
          rowSpan: 1,
          colSpan: 1,
          boundingBox: { x: 105, y: 5, width: 90, height: 40 },
        },
        {
          rowIndex: 1,
          colIndex: 0,
          rowSpan: 1,
          colSpan: 1,
          boundingBox: { x: 5, y: 45, width: 90, height: 40 },
        },
        {
          rowIndex: 1,
          colIndex: 1,
          rowSpan: 1,
          colSpan: 1,
          boundingBox: { x: 105, y: 45, width: 90, height: 40 },
        },
      ],
      processingTime: 200,
    };

    const result = mergeResults(ocrResult, structureResult, { width: 200, height: 100 });

    expect(result.rowCount).toBe(2);
    expect(result.colCount).toBe(2);
    expect(result.rows[0]!.cells[0]!.text).toBe('姓名');
    expect(result.rows[0]!.cells[1]!.text).toBe('年龄');
    expect(result.rows[1]!.cells[0]!.text).toBe('张三');
    expect(result.rows[1]!.cells[1]!.text).toBe('25');
    expect(result.metadata.ocrTime).toBe(100);
    expect(result.metadata.structureTime).toBe(200);
  });

  it('should handle empty structure result', () => {
    const ocrResult: RawOcrResult = {
      textBlocks: [],
      processingTime: 0,
    };

    const structureResult: RawStructureResult = {
      html: '',
      cells: [],
      processingTime: 0,
    };

    const result = mergeResults(ocrResult, structureResult, { width: 100, height: 100 });
    expect(result.rowCount).toBe(0);
    expect(result.colCount).toBe(0);
  });

  it('should mark uncertain cells', () => {
    const ocrResult: RawOcrResult = {
      textBlocks: [
        {
          text: '模糊文字',
          confidence: 0.5,
          boundingBox: { x: 10, y: 10, width: 80, height: 30 },
        },
      ],
      processingTime: 50,
    };

    const structureResult: RawStructureResult = {
      html: '<html><body><table><tbody><tr><td></td></tr></tbody></table></body></html>',
      cells: [
        {
          rowIndex: 0,
          colIndex: 0,
          rowSpan: 1,
          colSpan: 1,
          boundingBox: { x: 5, y: 5, width: 90, height: 40 },
        },
      ],
      processingTime: 50,
    };

    const result = mergeResults(ocrResult, structureResult, { width: 100, height: 50 });
    expect(result.rows[0]!.cells[0]!.isUncertain).toBe(true);
    expect(result.rows[0]!.cells[0]!.confidence).toBeLessThan(UNCERTAINTY_THRESHOLD);
  });
});
