import React, { useRef } from 'react';
import { Upload, X, Video as VideoIcon } from 'lucide-react';

const VideoUpload = ({ onFileSelect, currentFile, currentUrl }) => {
  const fileInputRef = useRef(null);

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('video/')) {
        alert('Please select a video file');
        return;
      }
      
      // Validate file size (max 100MB)
      if (file.size > 100 * 1024 * 1024) {
        alert('Video file must be less than 100MB');
        return;
      }
      
      onFileSelect(file);
    }
  };

  const handleRemove = () => {
    if (currentUrl) {
      URL.revokeObjectURL(currentUrl);
    }
    onFileSelect(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div>
      {currentUrl ? (
        <div className="relative">
          <video
            src={currentUrl}
            controls
            className="w-full max-h-64 rounded border border-[#3d3d3d]"
          />
          <button
            onClick={handleRemove}
            className="absolute top-2 right-2 p-1.5 bg-[#2d2d2d] hover:bg-[#3d3d3d] border border-[#3d3d3d] rounded transition-colors"
            aria-label="Remove video"
          >
            <X className="w-3 h-3 text-gray-300" />
          </button>
          {currentFile && (
            <p className="text-xs text-gray-500 mt-1">{currentFile.name}</p>
          )}
        </div>
      ) : (
        <label className="flex flex-col items-center justify-center border border-dashed border-[#3d3d3d] p-6 text-center cursor-pointer hover:border-[#4a4a4a] hover:bg-[#1a1a1a] transition-all duration-150">
          <VideoIcon className="w-8 h-8 text-gray-500 mb-2" />
          <p className="text-xs text-gray-400 mb-1">Click to upload video</p>
          <p className="text-xs text-gray-500">MP4, MOV up to 100MB</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            onChange={handleFileChange}
            className="hidden"
          />
        </label>
      )}
    </div>
  );
};

export default VideoUpload;

