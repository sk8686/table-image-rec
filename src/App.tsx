import { useCallback } from 'react';
import ImageUploader from './components/ImageUploader/ImageUploader';
import type { ImageUploaderOutput } from './types';

function App() {
  const handleImageReady = useCallback((_output: ImageUploaderOutput) => {
    // 后续模块会使用此回调
  }, []);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <h1 className="text-xl font-bold text-gray-800">表格截图提取还原</h1>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-8">
        <ImageUploader onImageReady={handleImageReady} />
      </main>
    </div>
  );
}

export default App;
