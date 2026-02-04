import { useRef, useState, ChangeEvent, useCallback } from 'react';
import { useImageGenerator } from '../contexts/ImageGeneratorContext';
import { X, Upload, Image as ImageIcon, Plus } from 'lucide-react';
import { WIN95, BTN } from '../utils/buttonStyles';

interface ReferenceImageInputProps {
  singleImageOnly?: boolean;
  maxImages?: number;
}

interface ImageDimensions {
  width: number;
  height: number;
}

interface ImageWithDimensions {
  url: string;
  dimensions: ImageDimensions;
}

const MAX_IMAGES_DEFAULT = 4;

const ReferenceImageInput: React.FC<ReferenceImageInputProps> = ({ 
  singleImageOnly = false,
  maxImages = MAX_IMAGES_DEFAULT
}) => {
  const { controlNetImage, setControlNetImage } = useImageGenerator();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null); // For enlarged view

  // Get current images as array
  const getCurrentImages = useCallback((): string[] => {
    if (!controlNetImage) return [];
    if (Array.isArray(controlNetImage)) return controlNetImage;
    return [controlNetImage];
  }, [controlNetImage]);

  const currentImages = getCurrentImages();
  const canAddMore = !singleImageOnly && currentImages.length < maxImages;

  const handleImageUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;
    
    // Calculate how many more images we can add
    const remainingSlots = singleImageOnly ? 1 : maxImages - currentImages.length;
    if (remainingSlots <= 0) return;
    
    const filesToProcess = files.slice(0, remainingSlots);
    
    // Validate files
    const validFiles = filesToProcess.filter(file => {
      if (!file.type.startsWith('image/')) { 
        alert('Please select valid image files'); 
        return false; 
      }
      if (file.size > 10 * 1024 * 1024) { 
        alert(`Image "${file.name}" too large (max 10MB)`); 
        return false; 
      }
      return true;
    });

    if (validFiles.length === 0) return;

    // For single image mode or when replacing all
    if (singleImageOnly || currentImages.length === 0) {
      if (validFiles.length === 1) {
        const file = validFiles[0];
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = new Image();
          img.onload = () => {
            const result = e.target?.result as string;
            setControlNetImage(result, { width: img.width, height: img.height });
          };
          img.onerror = () => {
            const result = e.target?.result as string;
            setControlNetImage(result, null);
          };
          img.src = e.target?.result as string;
        };
        reader.readAsDataURL(file);
      } else {
        // Multiple new files
        const imageArray: (ImageWithDimensions | null)[] = [];
        let loadedCount = 0, errorCount = 0;
        
        validFiles.forEach((file, index) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
              const result = e.target?.result as string;
              imageArray[index] = { url: result, dimensions: { width: img.width, height: img.height } };
              loadedCount++;
              if (loadedCount + errorCount === validFiles.length) {
                const successful = imageArray.filter((i): i is ImageWithDimensions => i !== null);
                if (successful.length > 0) {
                  const urls = successful.map(i => i.url);
                  setControlNetImage(urls.length === 1 ? urls[0] : urls, successful[0].dimensions);
                }
              }
            };
            img.onerror = () => { errorCount++; };
            img.src = e.target?.result as string;
          };
          reader.readAsDataURL(file);
        });
      }
    } else {
      // Adding to existing images
      const newImages: string[] = [];
      let loadedCount = 0;
      
      validFiles.forEach((file) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const result = e.target?.result as string;
          if (result) {
            newImages.push(result);
          }
          loadedCount++;
          if (loadedCount === validFiles.length) {
            const allImages = [...currentImages, ...newImages];
            // Get dimensions from first image if needed
            const img = new Image();
            img.onload = () => {
              setControlNetImage(
                allImages.length === 1 ? allImages[0] : allImages,
                { width: img.width, height: img.height }
              );
            };
            img.onerror = () => {
              setControlNetImage(
                allImages.length === 1 ? allImages[0] : allImages,
                null
              );
            };
            img.src = allImages[0];
          }
        };
        reader.readAsDataURL(file);
      });
    }
    
    // Reset the input so the same file can be selected again
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Remove all images
  const handleRemoveAll = () => { 
    setControlNetImage(null); 
    if (fileInputRef.current) fileInputRef.current.value = ''; 
  };
  
  // Remove a specific image by index
  const handleRemoveImage = (indexToRemove: number) => {
    const newImages = currentImages.filter((_, i) => i !== indexToRemove);
    if (newImages.length === 0) {
      setControlNetImage(null);
    } else if (newImages.length === 1) {
      setControlNetImage(newImages[0], null);
    } else {
      setControlNetImage(newImages, null);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };
  
  const handleClick = () => fileInputRef.current?.click();

  const isMultiple = currentImages.length > 1;

  return (
    <div 
      className="flex flex-col" 
      style={{ 
        minHeight: '72px',
        background: WIN95.bg,
        boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}, inset 2px 2px 0 ${WIN95.bgLight}, inset -2px -2px 0 ${WIN95.bgDark}`
      }}
    >
      {/* Title bar */}
      <div 
        className="flex items-center gap-1.5 px-2 py-1"
        style={{ 
          background: 'linear-gradient(90deg, #000080 0%, #1084d0 100%)',
          color: '#ffffff'
        }}
      >
        <ImageIcon className="w-3 h-3" />
        <span className="text-[10px] font-bold" style={{ fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
          {singleImageOnly ? 'Reference Image' : 'Reference Images'}
        </span>
        {currentImages.length > 0 && (
          <span className="text-[9px] opacity-80">
            ({currentImages.length}{!singleImageOnly && `/${maxImages}`})
          </span>
        )}
        {isMultiple && (
          <span className="text-[8px] opacity-70 ml-auto" title="First image is the base, others are element sources">
            Base + refs
          </span>
        )}
      </div>
      
      {currentImages.length === 0 ? (
        <div 
          onClick={handleClick} 
          className="flex-1 flex items-center justify-center cursor-pointer p-2"
          style={{ 
            background: WIN95.inputBg,
            margin: '4px',
            boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}, inset 2px 2px 0 ${WIN95.bgDark}`
          }}
        >
          <button
            onClick={(e) => { e.stopPropagation(); handleClick(); }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-bold"
            style={BTN.base}
          >
            <Upload className="w-3 h-3" />
            <span>{singleImageOnly ? 'Upload Image' : 'Upload Images'}</span>
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 p-1 flex-1">
          {/* Image thumbnails with labels and individual remove buttons */}
          <div className="flex gap-1 h-full overflow-x-auto flex-1" style={{ maxWidth: 'calc(100% - 80px)' }}>
            {currentImages.slice(0, 4).map((url: string, i: number) => (
              <div 
                key={i} 
                className="flex-shrink-0 relative group" 
                style={{ 
                  width: '44px', 
                  height: '44px',
                  boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`
                }}
              >
                <img 
                  src={url} 
                  alt={`Ref ${i+1}`} 
                  className="w-full h-full object-cover hover:opacity-80 transition-opacity cursor-pointer" 
                  onClick={() => setPreviewImage(url)}
                  title="Click to enlarge"
                />
                {/* Remove button for individual image */}
                <button
                  onClick={(e) => { e.stopPropagation(); handleRemoveImage(i); }}
                  className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ 
                    background: '#ef4444',
                    color: '#fff',
                    boxShadow: '0 1px 2px rgba(0,0,0,0.3)'
                  }}
                  title="Remove this image"
                >
                  <X className="w-2 h-2" />
                </button>
                {/* Image label for multi-image editing */}
                {isMultiple && (
                  <div 
                    className="absolute -bottom-0.5 left-1/2 -translate-x-1/2 px-1 rounded text-[7px] font-bold"
                    style={{ 
                      background: i === 0 ? '#22c55e' : '#3b82f6',
                      color: '#fff'
                    }}
                  >
                    {i === 0 ? 'Base' : `+${i}`}
                  </div>
                )}
              </div>
            ))}
            {/* Add more button */}
            {canAddMore && (
              <button
                onClick={handleClick}
                className="flex-shrink-0 flex items-center justify-center cursor-pointer hover:opacity-80 transition-opacity"
                style={{ 
                  width: '44px', 
                  height: '44px',
                  background: WIN95.inputBg,
                  boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`,
                  border: `1px dashed ${WIN95.border.dark}`
                }}
                title={`Add more images (${maxImages - currentImages.length} remaining)`}
              >
                <Plus className="w-4 h-4" style={{ color: WIN95.textDisabled }} />
              </button>
            )}
          </div>
          <div className="flex flex-col gap-1 flex-shrink-0 ml-auto">
            {isMultiple && (
              <button 
                onClick={handleRemoveAll} 
                className="flex items-center gap-1 px-2 py-1 text-[8px] font-bold" 
                style={{
                  ...BTN.base,
                  background: '#c0c0c0'
                }} 
                title="Remove all images"
              >
                Clear all
              </button>
            )}
            {!isMultiple && (
              <button 
                onClick={handleRemoveAll} 
                className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold" 
                style={{
                  ...BTN.base,
                  background: '#c0c0c0'
                }} 
                title="Remove image"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      )}
      <input ref={fileInputRef} type="file" accept="image/*" multiple={!singleImageOnly} onChange={handleImageUpload} className="hidden" />
      
      {/* Enlarged image preview modal - Win95 style */}
      {previewImage && (
        <div 
          className="fixed inset-0 flex items-center justify-center z-[9999] p-4"
          style={{ background: 'rgba(0, 128, 128, 0.9)' }}
          onClick={() => setPreviewImage(null)}
        >
          <div 
            className="relative max-w-[90vw] max-h-[90vh]" 
            onClick={(e) => e.stopPropagation()}
            style={{
              background: WIN95.bg,
              boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}, inset 2px 2px 0 ${WIN95.bgLight}, inset -2px -2px 0 ${WIN95.bgDark}, 4px 4px 0 rgba(0,0,0,0.4)`
            }}
          >
            {/* Title bar */}
            <div 
              className="flex items-center gap-1.5 px-2 py-1"
              style={{ 
                background: 'linear-gradient(90deg, #000080 0%, #1084d0 100%)',
                color: '#ffffff'
              }}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span className="text-[11px] font-bold" style={{ fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
                Image Preview
              </span>
              <div className="flex-1" />
              <button
                onClick={() => setPreviewImage(null)}
                className="w-4 h-3.5 flex items-center justify-center text-[9px] font-bold"
                style={{
                  background: WIN95.buttonFace,
                  boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}`,
                  color: WIN95.text
                }}
                title="Close preview"
              >
                ✕
              </button>
            </div>
            {/* Image content */}
            <div className="p-1">
              <img 
                src={previewImage} 
                alt="Enlarged reference" 
                className="max-w-full max-h-[80vh] object-contain"
                style={{
                  boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReferenceImageInput;

