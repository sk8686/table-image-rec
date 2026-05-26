import type { ProgressEvent, ProgressStage } from '@/types';

interface ProgressTrackerProps {
  progress: ProgressEvent | null;
}

const STAGE_LABELS: Record<ProgressStage, string> = {
  model_download: '下载模型',
  model_loading: '加载模型',
  preprocessing: '预处理图片',
  ocr_detecting: '检测文字区域',
  ocr_recognizing: '识别文字内容',
  table_structure: '识别表格结构',
  result_merging: '合并识别结果',
  completed: '识别完成',
};

const STAGE_ORDER: ProgressStage[] = [
  'model_download',
  'model_loading',
  'preprocessing',
  'ocr_detecting',
  'ocr_recognizing',
  'table_structure',
  'result_merging',
  'completed',
];

export default function ProgressTracker({ progress }: ProgressTrackerProps) {
  if (!progress) return null;

  const currentStageIndex = STAGE_ORDER.indexOf(progress.stage);
  const overallProgress = Math.round(
    ((currentStageIndex + progress.progress) / STAGE_ORDER.length) * 100,
  );

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      {/* 进度条 */}
      <div className="flex items-center gap-3">
        <div className="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              progress.stage === 'completed' ? 'bg-green-500' : 'bg-indigo-500'
            }`}
            style={{ width: `${overallProgress}%` }}
          />
        </div>
        <span className="text-sm text-gray-600 min-w-[3rem] text-right">{overallProgress}%</span>
      </div>

      {/* 当前步骤 */}
      <div className="flex items-center gap-2">
        {progress.stage !== 'completed' ? (
          <svg className="animate-spin h-4 w-4 text-indigo-500" viewBox="0 0 24 24">
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
        ) : (
          <svg className="h-4 w-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
        )}
        <span className="text-sm text-gray-700">
          {STAGE_LABELS[progress.stage]}
          {progress.message && progress.stage !== 'completed' && ` - ${progress.message}`}
        </span>
      </div>

      {/* 步骤列表 */}
      <div className="grid grid-cols-4 gap-1">
        {STAGE_ORDER.map((stage, index) => {
          const isCompleted = index < currentStageIndex;
          const isCurrent = index === currentStageIndex;

          return (
            <div
              key={stage}
              className={`text-xs py-1 px-2 rounded text-center ${
                isCompleted
                  ? 'bg-green-100 text-green-700'
                  : isCurrent
                    ? 'bg-indigo-100 text-indigo-700'
                    : 'bg-gray-100 text-gray-400'
              }`}
            >
              {STAGE_LABELS[stage]}
            </div>
          );
        })}
      </div>
    </div>
  );
}
