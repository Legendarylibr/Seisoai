import React, { useRef } from 'react';
import { useImageGenerator } from '../contexts/ImageGeneratorContext';
import { Upload, X, Image as ImageIcon, Eye } from 'lucide-react';
import logger from '../utils/logger.js';

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
      logger.debug('Processing images for multi-image generation', { count: filesToProcess.length });
      const imageArray = [];
      let loadedCount = 0;
      let errorCount = 0;
      
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
            
            // When all images are processed (loaded or errored), store successful ones
            if (loadedCount + errorCount === filesToProcess.length) {
              // Filter out any failed images (undefined entries)
              const successfulImages = imageArray.filter(img => img !== undefined);
              
              if (successfulImages.length > 0) {
                const imageUrls = successfulImages.map(img => img.url);
                logger.debug('Setting control net images', { 
                  count: imageUrls.length,
                  isArray: Array.isArray(imageUrls),
                  firstImagePreview: imageUrls[0]?.substring(0, 50) + '...'
                });
                setControlNetImage(imageUrls, successfulImages[0].dimensions);
                logger.debug('Loaded images for multi-image mode', { 
                  count: successfulImages.length,
                  total: filesToProcess.length
                });
                
                if (errorCount > 0) {
                  logger.warn('Some images failed to load', { 
                    failed: errorCount,
                    successful: successfulImages.length
                  });
                }
              } else {
                // All images failed
                logger.error('All images failed to load');
                alert('Failed to load images. Please try again with valid image files.');
                setControlNetImage(null, null);
              }
            }
          };
          img.onerror = () => {
            logger.warn('Image failed to load', { index, fileName: file.name });
            errorCount++;
            
            // When all images are processed, check if we have any successful ones
            if (loadedCount + errorCount === filesToProcess.length) {
              const successfulImages = imageArray.filter(img => img !== undefined);
              
              if (successfulImages.length > 0) {
                setControlNetImage(
                  successfulImages.map(img => img.url), 
                  successfulImages[0].dimensions
                );
                logger.debug('Loaded images for multi-image mode (with some failures)', { 
                  count: successfulImages.length,
                  total: filesToProcess.length,
                  failed: errorCount
                });
              } else {
                logger.error('All images failed to load');
                alert('Failed to load images. Please try again with valid image files.');
                setControlNetImage(null, null);
              }
            }
          };
          img.src = e.target.result;
        };
        reader.onerror = () => {
          logger.warn('FileReader failed to read file', { index, fileName: file.name });
          errorCount++;
          
          // When all images are processed, check if we have any successful ones
          if (loadedCount + errorCount === filesToProcess.length) {
            const successfulImages = imageArray.filter(img => img !== undefined);
            
            if (successfulImages.length > 0) {
              const imageUrls = successfulImages.map(img => img.url);
              setControlNetImage(imageUrls, successfulImages[0].dimensions);
              logger.debug('Loaded images for multi-image mode (with some failures)', { 
                count: successfulImages.length,
                total: filesToProcess.length,
                failed: errorCount
              });
            } else {
              logger.error('All images failed to load');
              alert('Failed to load images. Please try again with valid image files.');
              setControlNetImage(null, null);
            }
          }
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
            className="flex-1 border-2 border-dashed border-white/20 rounded-lg p-4 text-center cursor-pointer hover:border-purple-400/50 hover:bg-white/5 transition-all duration-200 flex flex-col items-center justify-center"
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
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleClickUpload();
            }}
            className="px-3 py-1.5 rounded transition-all duration-200 mb-2"
            style={{
              background: 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)',
              border: '2px outset #f0f0f0',
              boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)',
              color: '#000000',
              textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)',
              fontSize: '11px',
              fontWeight: 'semibold'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'linear-gradient(to bottom, #f8f8f8, #e8e8e8, #e0e0e0)';
              e.currentTarget.style.border = '2px outset #f8f8f8';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)';
              e.currentTarget.style.border = '2px outset #f0f0f0';
            }}
            onMouseDown={(e) => {
              e.currentTarget.style.border = '2px inset #c0c0c0';
              e.currentTarget.style.boxShadow = 'inset 3px 3px 0 rgba(0, 0, 0, 0.25), inset -1px -1px 0 rgba(255, 255, 255, 0.5)';
            }}
            onMouseUp={(e) => {
              e.currentTarget.style.border = '2px outset #f0f0f0';
              e.currentTarget.style.boxShadow = 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)';
            }}
          >
            Upload image
          </button>
          <p className="text-xs text-gray-500">JPG, PNG, WebP up to 10MB</p>
          {!singleImageOnly && (
            <p className="text-xs text-purple-400 mt-1">Ctrl/Cmd for multiple</p>
          )}
        </div>
      ) : (
        <div className="flex-1 flex flex-col">
          {/* Display images - grid if multiple, single if one */}
          {Array.isArray(controlNetImage) && controlNetImage.length > 1 ? (
            <div className="flex-1 rounded-lg overflow-auto bg-black/10 p-2">
              <div className={`grid gap-2 ${
                controlNetImage.length === 2 ? 'grid-cols-2' :
                controlNetImage.length === 3 ? 'grid-cols-2' :
                controlNetImage.length === 4 ? 'grid-cols-2' :
                'grid-cols-3'
              }`}>
                {controlNetImage.map((imageUrl, index) => {
                  if (!imageUrl) return null;
                  return (
                    <div key={index} className="relative rounded-lg overflow-hidden bg-white/5 min-h-[120px] aspect-square border border-white/10">
                      <img
                        src={imageUrl}
                        alt={`Reference ${index + 1}`}
                        className="w-full h-full object-cover"
                        onError={(e) => {
                          logger.warn('Failed to display image', { index, imageUrl: imageUrl.substring(0, 50) });
                          e.target.style.display = 'none';
                        }}
                      />
                      <button
                        onClick={handleRemoveImage}
                        className="absolute top-1 right-1 p-1.5 bg-red-500/80 hover:bg-red-500 rounded-full transition-colors z-10 shadow-lg"
                        title={`Remove image ${index + 1}`}
                        aria-label={`Remove image ${index + 1}`}
                      >
                        <X className="w-3.5 h-3.5 text-white" />
                      </button>
                      <div className="absolute bottom-1 left-1 px-1.5 py-0.5 bg-black/70 rounded text-xs text-white font-medium">
                        {index + 1}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="relative flex-1 rounded-lg overflow-hidden bg-white/5 min-h-[150px] md:min-h-[180px]">
              <img
                src={Array.isArray(controlNetImage) ? controlNetImage[0] : controlNetImage}
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
          
          <div className="mt-2 flex items-center justify-between">
            <span className="text-xs text-gray-400">
              {Array.isArray(controlNetImage) 
                ? `${controlNetImage.length} image${controlNetImage.length > 1 ? 's' : ''}` 
                : '1 image'}
            </span>
            <button
              onClick={handleClickUpload}
              className="btn-secondary text-xs px-2 py-1"
              aria-label="Change reference image"
            >
              Change
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
