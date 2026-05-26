import type { ExporterInput, ExporterOutput } from '@/types';
import * as XLSX from 'xlsx';

/**
 * 导出为 Excel (xlsx) 格式
 */
export function exportToExcel(input: ExporterInput): ExporterOutput {
  try {
    const { tableData, filename } = input;
    const wb = XLSX.utils.book_new();

    // 创建工作表数据
    const wsData: (string | null)[][] = [];
    const merges: XLSX.Range[] = [];

    for (let r = 0; r < tableData.rowCount; r++) {
      const row: (string | null)[] = [];
      for (let c = 0; c < tableData.colCount; c++) {
        const cell = tableData.rows[r]?.cells[c];
        if (cell && cell.rowSpan > 0 && cell.colSpan > 0) {
          row.push(cell.text);

          if (cell.rowSpan > 1 || cell.colSpan > 1) {
            merges.push({
              s: { r, c },
              e: { r: r + cell.rowSpan - 1, c: c + cell.colSpan - 1 },
            });
          }
        } else {
          row.push(null);
        }
      }
      wsData.push(row);
    }

    const ws = XLSX.utils.aoa_to_sheet(wsData);

    // 设置合并单元格
    if (merges.length > 0) {
      ws['!merges'] = merges;
    }

    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');

    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([wbout], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });

    const finalFilename = filename ?? `table_${formatTimestamp()}.xlsx`;
    downloadBlob(blob, finalFilename);

    return {
      success: true,
      filename: finalFilename,
      fileSize: blob.size,
    };
  } catch (err) {
    return {
      success: false,
      filename: filename ?? '',
      fileSize: 0,
      error: err instanceof Error ? err.message : '导出失败',
    };
  }
}

/**
 * 导出为 CSV 格式
 */
export function exportToCsv(input: ExporterInput): ExporterOutput {
  try {
    const { tableData, filename } = input;
    const lines: string[] = [];

    for (let r = 0; r < tableData.rowCount; r++) {
      const cells: string[] = [];
      for (let c = 0; c < tableData.colCount; c++) {
        const cell = tableData.rows[r]?.cells[c];
        if (cell && cell.rowSpan > 0 && cell.colSpan > 0) {
          cells.push(csvEscape(cell.text));
        } else {
          cells.push('');
        }
      }
      lines.push(cells.join(','));
    }

    const csvContent = lines.join('\n');
    const bom = '\uFEFF'; // UTF-8 BOM for Excel compatibility
    const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8' });

    const finalFilename =
      (filename ?? `table_${formatTimestamp()}`).replace(/\.xlsx?$/, '') + '.csv';
    downloadBlob(blob, finalFilename);

    return {
      success: true,
      filename: finalFilename,
      fileSize: blob.size,
    };
  } catch (err) {
    return {
      success: false,
      filename: filename ?? '',
      fileSize: 0,
      error: err instanceof Error ? err.message : '导出失败',
    };
  }
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function formatTimestamp(): string {
  const now = new Date();
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
