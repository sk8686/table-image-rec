import { useCallback } from 'react';
import type { ImageUploaderOutput, PreprocessorOutput } from '@/types';
import { usePreprocess } from './usePreprocess';

interface PreprocessPanelProps {
  image: ImageUploaderOutput;
  onPreprocessComplete: (output: PreprocessorOutput) => void;
}

export default function PreprocessPanel({ image, onPreprocessComplete }: PreprocessPanelProps) {
  const { params, output, isProcessing, error, updateParams, resetParams, preprocess } =
    usePreprocess();

  // 首次挂载时执行预处理
  useCallback(() => {
    preprocess(image);
  }, [image, preprocess]);

  // 通知父组件
  const handlePreprocess = useCallback(async () => {
    await preprocess(image);
  }, [image, preprocess]);

  // 输出变化时通知父组件
  if (output) {
    onPreprocessComplete(output);
  }

  const previewUrl = output
    ? (() => {
        const canvas = document.createElement('canvas');
        canvas.width = output.canvas.width;
        canvas.height = output.canvas.height;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(output.canvas, 0, 0);
        return canvas.toDataURL();
      })()
    : image.previewUrl;

  return (
    <div className="space-y-4">
      {/* 预处理参数面板 */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-medium text-gray-700">预处理参数</h3>
          <div className="flex gap-2">
            <button
              onClick={resetParams}
              className="px-3 py-1 text-xs text-gray-600 bg-gray-100 rounded hover:bg-gray-200 transition-colors"
            >
              重置
            </button>
            <button
              onClick={handlePreprocess}
              disabled={isProcessing}
              className="px-3 py-1 text-xs text-white bg-indigo-600 rounded hover:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              {isProcessing ? '处理中...' : '应用'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <SliderControl
            label="旋转角度"
            value={params.rotation}
            min={-180}
            max={180}
            step={1}
            unit="°"
            onChange={(v) => updateParams({ rotation: v })}
          />
          <SliderControl
            label="对比度"
            value={params.contrast}
            min={0}
            max={200}
            step={1}
            unit="%"
            onChange={(v) => updateParams({ contrast: v })}
          />
          <SliderControl
            label="亮度"
            value={params.brightness}
            min={0}
            max={200}
            step={1}
            unit="%"
            onChange={(v) => updateParams({ brightness: v })}
          />
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-600">自动倾斜校正</label>
            <input
              type="checkbox"
              checked={params.autoDeskew}
              onChange={(e) => updateParams({ autoDeskew: e.target.checked })}
              className="rounded border-gray-300"
            />
          </div>
        </div>
      </div>

      {/* 预览 */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <h3 className="text-sm font-medium text-gray-700 mb-2">
          {output ? '预处理后' : '原图预览'}
        </h3>
        <div className="bg-gray-50 rounded-lg overflow-hidden max-h-96 flex items-center justify-center">
          <img src={previewUrl} alt="预览" className="max-w-full max-h-96 object-contain" />
        </div>
        {output && (
          <p className="text-xs text-gray-500 mt-2">
            {output.processedSize.width} x {output.processedSize.height}
            {output.originalSize.width !== output.processedSize.width &&
              ` (原始: ${output.originalSize.width} x ${output.originalSize.height})`}
          </p>
        )}
      </div>

      {/* 错误提示 */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  );
}

function SliderControl({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs text-gray-600">{label}</label>
        <span className="text-xs text-gray-500">
          {value}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
      />
    </div>
  );
}
