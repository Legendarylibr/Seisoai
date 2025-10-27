import React, { useRef } from 'react';
import { useImageGenerator } from '../contexts/ImageGeneratorContext';
import { Upload, X, Image as ImageIcon, Eye } from 'lucide-react';

const ReferenceImageInput = () => {
  const { controlNetImage, setControlNetImage, controlNetImageDimensions } = useImageGenerator();
  const fileInputRef = useRef(null);

  const handleImageUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      // Validate file type
      if (!file.type.startsWith('image/')) {
        alert('Please select a valid image file');
        return;
      }

      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        alert('Image file size must be less than 10MB');
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          setControlNetImage(e.target.result, { 
            width: img.width, 
            height: img.height 
          });
        };
        img.onerror = () => {
          setControlNetImage(e.target.result, null);
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveImage = () => {
    setControlNetImage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClickUpload = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="h-full flex flex-col">
        {!controlNetImage ? (
          <div
            onClick={handleClickUpload}
            className="flex-1 border-2 border-dashed border-white/20 rounded-lg p-8 text-center cursor-pointer hover:border-purple-400/50 hover:bg-white/5 transition-all duration-200 flex flex-col items-center justify-center"
            role="button"
            tabIndex={0}
            aria-label="Upload reference image"
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleClickUpload();
              }
            }}
          >
          <Upload className="w-12 h-12 text-gray-400 mb-4" />
          <p className="text-lg text-gray-300 mb-2">Click to upload reference image</p>
          <p className="text-sm text-gray-500">JPG, PNG, WebP up to 10MB</p>
          <div className="mt-4 text-xs text-gray-600 bg-white/5 px-3 py-2 rounded">
            💡 Upload an image to guide the AI generation
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col">
          <div className="relative flex-1 rounded-lg overflow-hidden bg-white/5">
            <img
              src={controlNetImage}
              alt="Reference"
              className="w-full h-full object-cover"
            />
            <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity duration-200">
              <div className="flex gap-3">
                  <button
                    onClick={handleClickUpload}
                    className="p-3 bg-white/20 rounded-full hover:bg-white/30 transition-colors"
                    title="Change image"
                    aria-label="Change reference image"
                  >
                    <Upload className="w-5 h-5" />
                  </button>
                  <button
                    onClick={handleRemoveImage}
                    className="p-3 bg-red-500/20 rounded-full hover:bg-red-500/30 transition-colors"
                    title="Remove image"
                    aria-label="Remove reference image"
                  >
                    <X className="w-5 h-5" />
                  </button>
              </div>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between text-sm text-gray-400">
            <span>Reference image uploaded</span>
            <button
              onClick={handleClickUpload}
              className="text-purple-400 hover:text-purple-300 transition-colors px-3 py-1 rounded bg-white/5 hover:bg-white/10"
              aria-label="Change reference image"
            >
              Change Image
            </button>
          </div>
          <div className="mt-2 text-xs text-gray-500 bg-white/5 p-3 rounded">
            💡 The AI will use this image as a reference for style, composition, or elements in your generated image.
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageUpload}
        className="hidden"
        id="reference-image-input"
        name="reference-image"
      />
    </div>
  );
};

export default ReferenceImageInput;
