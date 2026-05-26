import { describe, it, expect } from 'vitest';
import {
  postprocessSLANet,
  parseHTMLToCellGrid,
  rescaleBBox,
  DICT_HTML,
  NUM_CLASSES,
  MAX_TEXT_LENGTH,
} from './tableStructureService';

describe('DICT_HTML', () => {
  it('should have 30 tokens', () => {
    expect(Object.keys(DICT_HTML)).toHaveLength(30);
  });

  it('should contain required HTML tags', () => {
    expect(DICT_HTML[1]).toBe('<html>');
    expect(DICT_HTML[2]).toBe('</html>');
    expect(DICT_HTML[7]).toBe('<table>');
    expect(DICT_HTML[13]).toBe('<tr>');
    expect(DICT_HTML[15]).toBe('<td>');
    expect(DICT_HTML[17]).toBe('<td');
    expect(DICT_HTML[21]).toBe('<th>');
  });
});

describe('postprocessSLANet', () => {
  it('should decode simple table structure', () => {
    // 构造一个简单的 1x2 表格的 struct_probs 和 loc_preds
    // <html><body><table><tbody><tr><td></td><td></td></tr></tbody></table></body></html>
    const tokenSequence = [
      1,
      5,
      7,
      11,
      13,
      15,
      16,
      15,
      16,
      14,
      12,
      8,
      6,
      2, // </html>
    ];

    // 创建 struct_probs: [1, 500, 30]
    const structProbs = new Float32Array(MAX_TEXT_LENGTH * NUM_CLASSES);
    for (let t = 0; t < MAX_TEXT_LENGTH; t++) {
      const tokenIdx = t < tokenSequence.length ? tokenSequence[t]! : 0;
      structProbs[t * NUM_CLASSES + tokenIdx] = 10.0; // 高概率
    }

    // 创建 loc_preds: [1, 500, 4]
    const locPreds = new Float32Array(MAX_TEXT_LENGTH * 4);
    // 第一个 <td> (t=5) 的 bbox
    locPreds[5 * 4] = 0.1;
    locPreds[5 * 4 + 1] = 0.1;
    locPreds[5 * 4 + 2] = 0.4;
    locPreds[5 * 4 + 3] = 0.5;
    // 第二个 <td> (t=7) 的 bbox
    locPreds[7 * 4] = 0.5;
    locPreds[7 * 4 + 1] = 0.1;
    locPreds[7 * 4 + 2] = 0.9;
    locPreds[7 * 4 + 3] = 0.5;

    const result = postprocessSLANet(structProbs, locPreds, 1000, 500, 488, 244);

    expect(result.html).toContain('<html>');
    expect(result.html).toContain('<table>');
    expect(result.html).toContain('<td>');
    expect(result.html).toContain('</html>');
    expect(result.cells).toHaveLength(2);
    expect(result.cells[0]!.rowIndex).toBe(0);
    expect(result.cells[0]!.colIndex).toBe(0);
    expect(result.cells[1]!.rowIndex).toBe(0);
    expect(result.cells[1]!.colIndex).toBe(1);
  });

  it('should handle empty struct_probs', () => {
    const structProbs = new Float32Array(MAX_TEXT_LENGTH * NUM_CLASSES);
    const locPreds = new Float32Array(MAX_TEXT_LENGTH * 4);
    // All zeros - will decode to blank tokens

    const result = postprocessSLANet(structProbs, locPreds, 100, 100, 488, 488);
    // Should produce some output (all blank tokens, no </html> so it goes to max length)
    expect(result.html).toBeDefined();
    expect(result.cells).toBeDefined();
  });
});

describe('parseHTMLToCellGrid', () => {
  it('should parse simple 2x2 table', () => {
    const html =
      '<html><body><table><tbody><tr><td></td><td></td></tr><tr><td></td><td></td></tr></tbody></table></body></html>';
    const bboxes = [
      [0.1, 0.1, 0.4, 0.4],
      [0.5, 0.1, 0.9, 0.4],
      [0.1, 0.5, 0.4, 0.9],
      [0.5, 0.5, 0.9, 0.9],
    ];

    const cells = parseHTMLToCellGrid(html, bboxes, 1000, 1000, 488, 488);

    expect(cells).toHaveLength(4);
    expect(cells[0]!.rowIndex).toBe(0);
    expect(cells[0]!.colIndex).toBe(0);
    expect(cells[1]!.rowIndex).toBe(0);
    expect(cells[1]!.colIndex).toBe(1);
    expect(cells[2]!.rowIndex).toBe(1);
    expect(cells[2]!.colIndex).toBe(0);
    expect(cells[3]!.rowIndex).toBe(1);
    expect(cells[3]!.colIndex).toBe(1);
  });

  it('should parse table with colspan', () => {
    const html =
      '<html><body><table><tbody><tr><td colspan="2"></td></tr><tr><td></td><td></td></tr></tbody></table></body></html>';
    const bboxes = [
      [0.1, 0.1, 0.9, 0.4],
      [0.1, 0.5, 0.4, 0.9],
      [0.5, 0.5, 0.9, 0.9],
    ];

    const cells = parseHTMLToCellGrid(html, bboxes, 1000, 1000, 488, 488);

    expect(cells).toHaveLength(3);
    expect(cells[0]!.colSpan).toBe(2);
    expect(cells[0]!.colIndex).toBe(0);
  });

  it('should parse table with rowspan', () => {
    const html =
      '<html><body><table><tbody><tr><td rowspan="2"></td><td></td></tr><tr><td></td></tr></tbody></table></body></html>';
    const bboxes = [
      [0.1, 0.1, 0.4, 0.9],
      [0.5, 0.1, 0.9, 0.4],
      [0.5, 0.5, 0.9, 0.9],
    ];

    const cells = parseHTMLToCellGrid(html, bboxes, 1000, 1000, 488, 488);

    expect(cells).toHaveLength(3);
    expect(cells[0]!.rowSpan).toBe(2);
    // 第二行的 <td> 应该在 colIndex=1（因为 colIndex=0 被 rowspan 占据）
    expect(cells[2]!.rowIndex).toBe(1);
    expect(cells[2]!.colIndex).toBe(1);
  });

  it('should handle empty HTML', () => {
    const cells = parseHTMLToCellGrid('', [], 100, 100, 488, 488);
    expect(cells).toHaveLength(0);
  });
});

describe('rescaleBBox', () => {
  it('should rescale normalized bbox to original image coordinates', () => {
    const bbox = rescaleBBox([0.1, 0.2, 0.5, 0.6], 1000, 500, 488, 244);

    // x1 = 0.1 * 488 = 48.8, clipped to 48.8, scaled: 48.8 / 488 * 1000 = 100
    // y1 = 0.2 * 488 = 97.6, clipped to 97.6, scaled: 97.6 / 244 * 500 = 200
    // x2 = 0.5 * 488 = 244, clipped to 244, scaled: 244 / 488 * 1000 = 500
    // y2 = 0.6 * 488 = 292.8, clipped to 244, scaled: 244 / 244 * 500 = 500
    expect(bbox.x).toBe(100);
    expect(bbox.y).toBe(200);
    expect(bbox.width).toBe(400);
    expect(bbox.height).toBe(300);
  });

  it('should handle bbox outside content area', () => {
    const bbox = rescaleBBox([0.9, 0.9, 1.0, 1.0], 488, 488, 488, 488);

    // x1 = 0.9 * 488 = 439.2, x2 = 1.0 * 488 = 488
    // For 488x488 image with resize 488x488, no clipping
    expect(bbox.x).toBe(439);
    expect(bbox.width).toBe(49);
  });
});
