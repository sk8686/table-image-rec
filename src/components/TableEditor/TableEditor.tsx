import { useEffect, useRef, useCallback } from 'react';
import Handsontable from 'handsontable';
import type { TableData } from '@/types';
import { tableDataToHandsontable, handsontableToTableData } from '@/services/tableDataConverter';
import 'handsontable/dist/handsontable.full.min.css';

interface TableEditorProps {
  tableData: TableData;
  onDataChange?: (data: TableData) => void;
}

export default function TableEditor({ tableData, onDataChange }: TableEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const hotRef = useRef<Handsontable | null>(null);

  const { data, mergeCells } = tableDataToHandsontable(tableData);

  const initHot = useCallback(() => {
    if (!containerRef.current) return;

    // 销毁旧实例
    if (hotRef.current) {
      hotRef.current.destroy();
      hotRef.current = null;
    }

    const hot = new Handsontable(containerRef.current, {
      data,
      mergeCells: mergeCells.length > 0 ? mergeCells : true,
      rowHeaders: true,
      colHeaders: true,
      contextMenu: true,
      manualRowResize: true,
      manualColumnResize: true,
      stretchH: 'all',
      className: 'htCenter',
      licenseKey: 'non-commercial-and-evaluation',
      afterChange: (changes) => {
        if (!changes || !onDataChange) return;

        const hotInstance = hotRef.current;
        if (!hotInstance) return;

        const currentData = hotInstance.getData() as string[][];
        const currentMerges = hotInstance.getPlugin('mergeCells').mergedCellsCollection
          ? Array.from(hotInstance.getPlugin('mergeCells').mergedCellsCollection.mergedCells).map(
              (m: { row: number; col: number; rowspan: number; colspan: number }) => ({
                row: m.row,
                col: m.col,
                rowspan: m.rowspan,
                colspan: m.colspan,
              }),
            )
          : [];

        const newTableData = handsontableToTableData(
          currentData,
          currentMerges,
          tableData.metadata,
        );
        onDataChange(newTableData);
      },
    });

    hotRef.current = hot;
  }, [data, mergeCells, onDataChange, tableData.metadata]);

  useEffect(() => {
    initHot();

    return () => {
      if (hotRef.current) {
        hotRef.current.destroy();
        hotRef.current = null;
      }
    };
  }, [initHot]);

  // 不确定内容高亮
  useEffect(() => {
    const hot = hotRef.current;
    if (!hot) return;

    const uncertainCells: { row: number; col: number }[] = [];

    for (let r = 0; r < tableData.rowCount; r++) {
      for (let c = 0; c < tableData.colCount; c++) {
        const cell = tableData.rows[r]?.cells[c];
        if (cell?.isUncertain) {
          uncertainCells.push({ row: r, col: c });
        }
      }
    }

    if (uncertainCells.length > 0) {
      const cellMeta: Record<string, { className: string }> = {};
      for (const { row, col } of uncertainCells) {
        cellMeta[`${row},${col}`] = { className: 'uncertain-cell' };
      }

      hot.updateSettings({
        cells: (row, col) => {
          const meta = cellMeta[`${row},${col}`];
          if (meta) {
            return { className: meta.className };
          }
          return {};
        },
      });
    }
  }, [tableData]);

  return (
    <div className="w-full">
      <style>{`
        .uncertain-cell {
          background-color: #fef3c7 !important;
        }
      `}</style>
      <div ref={containerRef} className="w-full overflow-auto" />
    </div>
  );
}
