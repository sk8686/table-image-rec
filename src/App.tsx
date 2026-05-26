import { useCallback, useEffect } from 'react';
import { AppProvider, useAppState } from './store/appContext';
import ImageUploader from './components/ImageUploader/ImageUploader';
import PreprocessPanel from './components/ImagePreprocessor/PreprocessPanel';
import TableEditor from './components/TableEditor/TableEditor';
import TableExporter from './components/TableExporter/TableExporter';
import ProgressTracker from './components/ProgressTracker/ProgressTracker';
import type { ImageUploaderOutput, PreprocessorOutput, ProgressEvent, TableData } from './types';
import { getRecognizerService } from './services/recognizerService';
import { preprocessOnMainThread } from './services/preprocessService';
import { DEFAULT_PARAMS } from './services/preprocessCore';

function AppContent() {
  const { state, dispatch } = useAppState();

  const handleImageReady = useCallback(
    (output: ImageUploaderOutput) => {
      dispatch({ type: 'SET_IMAGE', payload: output });
    },
    [dispatch],
  );

  const handlePreprocessComplete = useCallback(
    (output: PreprocessorOutput) => {
      dispatch({ type: 'SET_PREPROCESS_OUTPUT', payload: output });
    },
    [dispatch],
  );

  const handleDataChange = useCallback(
    (data: TableData) => {
      dispatch({ type: 'SET_TABLE_DATA', payload: data });
    },
    [dispatch],
  );

  // 自动执行识别
  useEffect(() => {
    if (state.step !== 'recognize' || !state.preprocessOutput) return;

    const recognize = async () => {
      try {
        const service = getRecognizerService();
        const result = await service.recognize(state.preprocessOutput!, (event: ProgressEvent) => {
          dispatch({ type: 'SET_PROGRESS', payload: event });
        });
        dispatch({ type: 'SET_TABLE_DATA', payload: result.tableData });
      } catch (err) {
        dispatch({
          type: 'SET_ERROR',
          payload: err instanceof Error ? err.message : '识别失败',
        });
      }
    };

    recognize();
  }, [state.step, state.preprocessOutput, dispatch]);

  // 自动执行预处理
  useEffect(() => {
    if (state.step !== 'preprocess' || !state.imageOutput) return;

    const preprocess = async () => {
      try {
        dispatch({
          type: 'SET_PROGRESS',
          payload: { stage: 'preprocessing', progress: 0, message: '正在预处理图片...' },
        });

        const img = new Image();
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = () => reject(new Error('Failed to load image'));
          img.src = state.imageOutput!.previewUrl;
        });

        const sourceCanvas = new OffscreenCanvas(img.naturalWidth, img.naturalHeight);
        const ctx = sourceCanvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0);

        const result = await preprocessOnMainThread(sourceCanvas, { ...DEFAULT_PARAMS });
        dispatch({ type: 'SET_PREPROCESS_OUTPUT', payload: result });
      } catch (err) {
        dispatch({
          type: 'SET_ERROR',
          payload: err instanceof Error ? err.message : '预处理失败',
        });
      }
    };

    preprocess();
  }, [state.step, state.imageOutput, dispatch]);

  const handleReset = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, [dispatch]);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-800">表格截图提取还原</h1>
          {state.step !== 'upload' && (
            <button
              onClick={handleReset}
              className="px-3 py-1.5 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              重新开始
            </button>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* 错误提示 */}
        {state.error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-sm text-red-700">{state.error}</p>
            <button
              onClick={() => dispatch({ type: 'SET_ERROR', payload: null })}
              className="mt-2 text-xs text-red-500 underline"
            >
              关闭
            </button>
          </div>
        )}

        {/* 进度 */}
        {state.progress && state.step === 'recognize' && (
          <div className="mb-6">
            <ProgressTracker progress={state.progress} />
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 左栏：上传/预处理 */}
          <div>
            <div className="mb-4">
              <h2 className="text-sm font-medium text-gray-500 mb-2">
                {state.step === 'upload' ? '1. 上传图片' : '图片预览'}
              </h2>
              {state.step === 'upload' && <ImageUploader onImageReady={handleImageReady} />}
              {state.imageOutput && state.step !== 'upload' && (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <img
                    src={state.imageOutput.previewUrl}
                    alt="上传的图片"
                    className="w-full object-contain max-h-80"
                  />
                </div>
              )}
            </div>
          </div>

          {/* 右栏：编辑/导出 */}
          <div>
            {state.step === 'edit' && state.tableData && (
              <>
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-sm font-medium text-gray-500">识别结果</h2>
                  <TableExporter tableData={state.tableData} />
                </div>
                <div className="bg-white rounded-xl border border-gray-200 p-2 overflow-auto max-h-[600px]">
                  <TableEditor tableData={state.tableData} onDataChange={handleDataChange} />
                </div>
                {state.tableData.metadata && (
                  <div className="mt-2 text-xs text-gray-400">
                    识别耗时: {Math.round(state.tableData.metadata.processingTime)}ms |{' '}
                    {state.tableData.rowCount} 行 x {state.tableData.colCount} 列
                  </div>
                )}
              </>
            )}

            {state.step === 'recognize' && !state.tableData && (
              <div className="flex items-center justify-center h-64 bg-white rounded-xl border border-gray-200">
                <div className="text-center text-gray-400">
                  <svg
                    className="animate-spin h-8 w-8 mx-auto mb-3 text-indigo-500"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  <p>正在识别表格...</p>
                </div>
              </div>
            )}

            {(state.step === 'upload' || state.step === 'preprocess') && (
              <div className="flex items-center justify-center h-64 bg-white rounded-xl border border-gray-200">
                <div className="text-center text-gray-400">
                  <svg
                    className="w-12 h-12 mx-auto mb-3"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1}
                      d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2"
                    />
                  </svg>
                  <p>上传图片后，识别结果将在此显示</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}

export default App;
