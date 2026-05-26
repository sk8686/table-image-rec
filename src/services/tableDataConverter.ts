import type { TableData, Cell } from '@/types';

/**
 * TableData → Handsontable 数据格式转换
 */
export function tableDataToHandsontable(tableData: TableData): {
  data: string[][];
  mergeCells: { row: number; col: number; rowspan: number; colspan: number }[];
} {
  const { rows, colCount } = tableData;

  // 创建数据矩阵
  const data: string[][] = [];
  const mergeCells: { row: number; col: number; rowspan: number; colspan: number }[] = [];

  for (const row of rows) {
    const rowData: string[] = [];
    for (const cell of row.cells) {
      rowData.push(cell.text);
      // 只有 rowSpan > 1 或 colSpan > 1 的单元格才需要合并
      if (cell.rowSpan > 1 || cell.colSpan > 1) {
        if (cell.rowSpan > 0 && cell.colSpan > 0) {
          mergeCells.push({
            row: rows.indexOf(row),
            col: row.cells.indexOf(cell),
            rowspan: cell.rowSpan,
            colspan: cell.colSpan,
          });
        }
      }
    }
    // 补齐列数
    while (rowData.length < colCount) {
      rowData.push('');
    }
    data.push(rowData);
  }

  return { data, mergeCells };
}

/**
 * Handsontable → TableData 反向转换
 */
export function handsontableToTableData(
  data: string[][],
  mergeCells: { row: number; col: number; rowspan: number; colspan: number }[] = [],
  originalMetadata?: TableData['metadata'],
): TableData {
  const rowCount = data.length;
  const colCount = rowCount > 0 ? Math.max(...data.map((r) => r.length)) : 0;

  // 创建合并单元格映射
  const mergeMap = new Map<string, { rowspan: number; colspan: number }>();
  for (const merge of mergeCells) {
    mergeMap.set(`${merge.row},${merge.col}`, {
      rowspan: merge.rowspan,
      colspan: merge.colspan,
    });
  }

  const rows: { cells: Cell[] }[] = [];

  for (let r = 0; r < rowCount; r++) {
    const cells: Cell[] = [];
    for (let c = 0; c < colCount; c++) {
      const text = data[r]?.[c] ?? '';
      const merge = mergeMap.get(`${r},${c}`);
      const isMergedSlave = isSlaveCell(r, c, mergeCells);

      cells.push({
        text,
        rowSpan: isMergedSlave ? 0 : (merge?.rowspan ?? 1),
        colSpan: isMergedSlave ? 0 : (merge?.colspan ?? 1),
        confidence: 1,
        isUncertain: false,
      });
    }
    rows.push({ cells });
  }

  return {
    rows,
    colCount,
    rowCount,
    metadata: originalMetadata ?? {
      sourceImageSize: { width: 0, height: 0 },
      recognizedAt: Date.now(),
      processingTime: 0,
      ocrTime: 0,
      structureTime: 0,
      engineVersion: '',
      language: 'ch',
    },
  };
}

/**
 * 判断是否是被合并的从属单元格
 */
function isSlaveCell(
  row: number,
  col: number,
  mergeCells: { row: number; col: number; rowspan: number; colspan: number }[],
): boolean {
  for (const merge of mergeCells) {
    if (
      row >= merge.row &&
      row < merge.row + merge.rowspan &&
      col >= merge.col &&
      col < merge.col + merge.colspan &&
      !(row === merge.row && col === merge.col)
    ) {
      return true;
    }
  }
  return false;
}
