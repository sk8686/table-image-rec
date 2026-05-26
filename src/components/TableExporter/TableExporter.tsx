import { useCallback } from 'react';
import type { TableData } from '@/types';
import { exportToExcel, exportToCsv } from '@/services/exportService';

interface TableExporterProps {
  tableData: TableData;
}

export default function TableExporter({ tableData }: TableExporterProps) {
  const handleExportExcel = useCallback(() => {
    exportToExcel({ tableData, format: 'xlsx' });
  }, [tableData]);

  const handleExportCsv = useCallback(() => {
    exportToCsv({ tableData, format: 'csv' });
  }, [tableData]);

  return (
    <div className="flex gap-3">
      <button
        onClick={handleExportExcel}
        className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors"
      >
        导出 Excel
      </button>
      <button
        onClick={handleExportCsv}
        className="px-4 py-2 text-sm font-medium text-indigo-600 bg-white border border-indigo-300 rounded-lg hover:bg-indigo-50 transition-colors"
      >
        导出 CSV
      </button>
    </div>
  );
}
