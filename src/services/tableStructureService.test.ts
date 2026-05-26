import { describe, it, expect } from 'vitest';
import {
  postprocessSLANet,
  parseHTMLToCellGrid,
  FULL_VOCAB,
  NUM_CLASSES,
  BEG_STR,
  END_STR,
  DICT_CHARACTER,
} from './tableStructureService';

describe('FULL_VOCAB', () => {
  it('should have 50 tokens (48 chars + sos + eos)', () => {
    expect(FULL_VOCAB).toHaveLength(50);
  });

  it('should start with sos and end with eos', () => {
    expect(FULL_VOCAB[0]).toBe(BEG_STR);
    expect(FULL_VOCAB[FULL_VOCAB.length - 1]).toBe(END_STR);
  });

  it('should contain required HTML tags', () => {
    expect(DICT_CHARACTER).toContain('<thead>');
    expect(DICT_CHARACTER).toContain('</thead>');
    expect(DICT_CHARACTER).toContain('<tbody>');
    expect(DICT_CHARACTER).toContain('</tbody>');
    expect(DICT_CHARACTER).toContain('<tr>');
    expect(DICT_CHARACTER).toContain('</tr>');
    expect(DICT_CHARACTER).toContain('<td');
    expect(DICT_CHARACTER).toContain('>');
    expect(DICT_CHARACTER).toContain('</td>');
    expect(DICT_CHARACTER).toContain('<td></td>');
  });
});

describe('postprocessSLANet', () => {
  it('should decode simple table structure', () => {
    // 构造一个简单的 1x2 表格
    // Token sequence: sos, <tbody>, <tr>, <td, >, </td>, <td, >, </td>, </tr>, </tbody>, eos
    const tokenSequence = [
      0, // sos
      3, // <tbody>
      5, // <tr>
      7, // <td
      8, // >
      9, // </td>
      7, // <td
      8, // >
      9, // </td>
      6, // </tr>
      4, // </tbody>
      49, // eos
    ];

    const seqLen = tokenSequence.length;
    const structProbs = new Float32Array(seqLen * NUM_CLASSES);
    for (let t = 0; t < seqLen; t++) {
      const tokenIdx = tokenSequence[t]!;
      structProbs[t * NUM_CLASSES + tokenIdx] = 10.0;
    }

    const locPreds = new Float32Array(seqLen * 8);
    // First <td (t=3): bbox
    locPreds[3 * 8] = 0.1;
    locPreds[3 * 8 + 1] = 0.1;
    locPreds[3 * 8 + 2] = 0.4;
    locPreds[3 * 8 + 3] = 0.1;
    locPreds[3 * 8 + 4] = 0.4;
    locPreds[3 * 8 + 5] = 0.5;
    locPreds[3 * 8 + 6] = 0.1;
    locPreds[3 * 8 + 7] = 0.5;
    // Second <td (t=6): bbox
    locPreds[6 * 8] = 0.5;
    locPreds[6 * 8 + 1] = 0.1;
    locPreds[6 * 8 + 2] = 0.9;
    locPreds[6 * 8 + 3] = 0.1;
    locPreds[6 * 8 + 4] = 0.9;
    locPreds[6 * 8 + 5] = 0.5;
    locPreds[6 * 8 + 6] = 0.5;
    locPreds[6 * 8 + 7] = 0.5;

    const result = postprocessSLANet(structProbs, locPreds, 1000, 500, 488, 244);

    expect(result.html).toContain('<table>');
    expect(result.html).toContain('<td>');
    expect(result.cells).toHaveLength(2);
    expect(result.cells[0]!.rowIndex).toBe(0);
    expect(result.cells[0]!.colIndex).toBe(0);
    expect(result.cells[1]!.rowIndex).toBe(0);
    expect(result.cells[1]!.colIndex).toBe(1);
  });
});

describe('parseHTMLToCellGrid', () => {
  it('should parse simple 2x2 table', () => {
    const html =
      '<html><body><table><tbody><tr><td></td><td></td></tr><tr><td></td><td></td></tr></tbody></table></body></html>';
    const bboxes = [
      [10, 10, 400, 200],
      [500, 10, 900, 200],
      [10, 250, 400, 450],
      [500, 250, 900, 450],
    ];

    const cells = parseHTMLToCellGrid(html, bboxes, 1000, 500);

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
      [10, 10, 900, 200],
      [10, 250, 400, 450],
      [500, 250, 900, 450],
    ];

    const cells = parseHTMLToCellGrid(html, bboxes, 1000, 500);

    expect(cells).toHaveLength(3);
    expect(cells[0]!.colSpan).toBe(2);
  });

  it('should parse table with rowspan', () => {
    const html =
      '<html><body><table><tbody><tr><td rowspan="2"></td><td></td></tr><tr><td></td></tr></tbody></table></body></html>';
    const bboxes = [
      [10, 10, 400, 450],
      [500, 10, 900, 200],
      [500, 250, 900, 450],
    ];

    const cells = parseHTMLToCellGrid(html, bboxes, 1000, 500);

    expect(cells).toHaveLength(3);
    expect(cells[0]!.rowSpan).toBe(2);
    expect(cells[2]!.rowIndex).toBe(1);
    expect(cells[2]!.colIndex).toBe(1);
  });

  it('should handle empty HTML', () => {
    const cells = parseHTMLToCellGrid('', [], 100, 100);
    expect(cells).toHaveLength(0);
  });
});
