import React, { useRef } from 'react';
import { useImageGenerator } from '../contexts/ImageGeneratorContext';
import { Upload, X, Image as ImageIcon, Eye } from 'lucide-react';

const ReferenceImageInput = ({ singleImageOnly = false }) => {
  const { controlNetImage, setControlNetImage, controlNetImageDimensions } = useImageGenerator();
  const fileInputRef = useRef(null);

  const handleImageUpload = (event) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;
    
    // If single image only mode, take first file only
    const filesToProcess = singleImageOnly ? [files[0]] : files;
    
    // Validate all files
    for (const file of filesToProcess) {
      if (!file.type.startsWith('image/')) {
        alert('Please select only valid image files');
        return;
      }
      if (file.size > 10 * 1024 * 1024) {
        alert(`Image "${file.name}" is too large (max 10MB)`);
        return;
      }
    }

    // If single file or single image only mode, process as single image
    if (filesToProcess.length === 1 || singleImageOnly) {
      const file = filesToProcess[0];
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
    } else {
      // Multiple files - process all (only if not single image mode)
      console.log(`📸 Processing ${filesToProcess.length} images for multi-image generation`);
      const imageArray = [];
      let loadedCount = 0;
      
      filesToProcess.forEach((file, index) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = new Image();
          img.onload = () => {
            imageArray[index] = {
              url: e.target.result,
              dimensions: { width: img.width, height: img.height }
            };
            loadedCount++;
            
            // When all images are loaded, store as multi-image
            if (loadedCount === filesToProcess.length) {
              setControlNetImage(imageArray.map(img => img.url), imageArray[0].dimensions);
              console.log(`✅ Loaded ${imageArray.length} images for multi-image mode`);
            }
          };
          img.onerror = () => {
            setControlNetImage(null, null);
          };
          img.src = e.target.result;
        };
        reader.readAsDataURL(file);
      });
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
          <p className="text-lg text-gray-300 mb-2">
            Click to upload {singleImageOnly ? 'reference image' : 'reference image(s)'}
          </p>
          <p className="text-sm text-gray-500">JPG, PNG, WebP up to 10MB each</p>
          {!singleImageOnly && (
            <p className="text-xs text-purple-400 mt-1">Hold Ctrl/Cmd for multiple</p>
          )}
          <div className="mt-4 text-xs text-gray-600 bg-white/5 px-3 py-2 rounded">
            💡 Upload {singleImageOnly ? 'an image' : '1+ images'} to guide the AI generation
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col">
          {/* Display images - grid if multiple, single if one */}
          {Array.isArray(controlNetImage) ? (
            <div className="grid grid-cols-2 gap-2 flex-1 rounded-lg overflow-hidden">
              {controlNetImage.map((imageUrl, index) => (
                <div key={index} className="relative rounded-lg overflow-hidden bg-white/5">
                  <img
                    src={imageUrl}
                    alt={`Reference ${index + 1}`}
                    className="w-full h-full object-cover min-h-[100px]"
                  />
                  <button
                    onClick={handleRemoveImage}
                    className="absolute top-1 right-1 p-1 bg-red-500/80 hover:bg-red-500 rounded-full transition-colors"
                    title={`Remove image ${index + 1}`}
                    aria-label={`Remove image ${index + 1}`}
                  >
                    <X className="w-3 h-3 text-white" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="relative flex-1 rounded-lg overflow-hidden bg-white/5 min-h-[200px] md:min-h-[300px]">
              <img
                src={controlNetImage}
                alt="Reference"
                className="w-full h-full object-contain"
              />
              <div className="absolute inset-0 bg-black/20 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity duration-200">
                <div className="flex gap-2 md:gap-3">
                    <button
                      onClick={handleClickUpload}
                      className="p-2 md:p-3 bg-white/20 rounded-full hover:bg-white/30 transition-colors"
                      title="Change image"
                      aria-label="Change reference image"
                    >
                      <Upload className="w-4 h-4 md:w-5 md:h-5" />
                    </button>
                    <button
                      onClick={handleRemoveImage}
                      className="p-2 md:p-3 bg-red-500/20 rounded-full hover:bg-red-500/30 transition-colors"
                      title="Remove image"
                      aria-label="Remove reference image"
                    >
                      <X className="w-4 h-4 md:w-5 md:h-5" />
                    </button>
                </div>
              </div>
            </div>
          )}
          
          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs text-gray-400">
              {Array.isArray(controlNetImage) 
                ? `${controlNetImage.length} images uploaded` 
                : 'Reference image uploaded'}
            </span>
            <button
              onClick={handleClickUpload}
              className="btn-secondary text-xs px-3 py-1.5"
              aria-label="Change reference image"
            >
              Change Image(s)
            </button>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple={!singleImageOnly}
        onChange={handleImageUpload}
        className="hidden"
        id="reference-image-input"
        name="reference-image"
      />
    </div>
  );
};

export default ReferenceImageInput;
