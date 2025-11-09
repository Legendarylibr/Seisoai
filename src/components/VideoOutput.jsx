import React from 'react';
import { Video as VideoIcon, Download, RefreshCw, X, Sparkles } from 'lucide-react';
import logger from '../utils/logger.js';

const VideoOutput = ({ 
  videoUrl, 
  isGenerating, 
  progress, 
  error, 
  onGenerate, 
  onClear,
  hasInputs,
  credits,
  isEmailAuth
}) => {
  const handleDownload = () => {
    if (videoUrl) {
      const link = document.createElement('a');
      link.href = videoUrl;
      link.download = `wan-animate-${Date.now()}.mp4`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      logger.info('Video downloaded');
    }
  };

  return (
    <div className="glass-card p-3 h-full">
      <div className="flex items-center gap-2 mb-2">
        <VideoIcon className="w-4 h-4 text-gray-400" />
        <h3 className="text-xs font-medium text-gray-300">Generated Video</h3>
      </div>

      {isGenerating ? (
        <div className="flex flex-col items-center justify-center p-8">
          <div className="w-16 h-16 border-2 border-[#3d3d3d] border-t-gray-400 rounded-full animate-spin mb-4"></div>
          <p className="text-base text-gray-200 mb-1">Generating video...</p>
          <p className="text-xs text-gray-500">This may take a few minutes</p>
          {progress > 0 && (
            <div className="w-full mt-4">
              <div className="w-full bg-[#1a1a1a] border border-[#3d3d3d] h-2 overflow-hidden relative rounded">
                <div 
                  className="h-full bg-[#4a4a4a] transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
                <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-gray-400">
                  {progress}%
                </span>
              </div>
            </div>
          )}
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center p-6">
          <div className="w-16 h-16 bg-[#3d2d1a] border border-[#5a4a2a] rounded-full flex items-center justify-center mb-4">
            <X className="w-8 h-8 text-yellow-400" />
          </div>
          <p className="text-base font-medium text-yellow-400 mb-2">Error</p>
          <p className="text-gray-400 text-sm text-center mb-4">{error}</p>
          <button
            onClick={onClear}
            className="btn-secondary px-4 py-2 text-sm"
          >
            Clear
          </button>
        </div>
      ) : videoUrl ? (
        <div>
          <div className="glass-card overflow-hidden mb-2 p-1">
            <video
              src={videoUrl}
              controls
              className="w-full rounded"
              style={{ maxHeight: '500px' }}
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleDownload}
              className="btn-secondary text-xs px-2.5 py-1.5 flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              Download
            </button>
            <button
              onClick={onClear}
              className="btn-secondary text-xs px-2.5 py-1.5 flex items-center gap-1.5"
            >
              <X className="w-3.5 h-3.5" />
              Clear
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center p-8 min-h-[300px]">
          <VideoIcon className="w-20 h-20 opacity-40 text-gray-500 mb-4" />
          <p className="text-sm text-gray-300 mb-1">No video generated yet</p>
          <p className="text-xs text-gray-500">Upload a video and image to get started</p>
        </div>
      )}

      {/* Generate Button */}
      {!isGenerating && !videoUrl && (
        <div className="mt-4">
          <button
            onClick={onGenerate}
            disabled={!hasInputs || credits < 2}
            className={`
              w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium
              transition-all duration-200 rounded
              ${!hasInputs || credits < 2
                ? 'opacity-40 cursor-not-allowed bg-[#2d2d2d] text-gray-500 border border-[#3d3d3d]'
                : credits < 2
                  ? 'bg-[#3d2d1a] hover:bg-[#4a3d2a] text-yellow-300 border border-[#5a4a2a] hover:border-[#6a5a3a]'
                  : 'bg-[#3d3d3d] hover:bg-[#4a4a4a] text-gray-100 border border-[#4a4a4a] hover:border-[#555555]'
              }
            `}
          >
            <Sparkles className="w-4 h-4" />
            {!hasInputs 
              ? 'Upload Video & Image First' 
              : credits < 2 
                ? `Need ${2 - credits} More Credits (2/sec)` 
                : 'Generate Video (2 credits/sec)'
            }
          </button>
        </div>
      )}
    </div>
  );
};

export default VideoOutput;

