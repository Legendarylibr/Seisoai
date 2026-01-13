import { useRef, useState, ChangeEvent } from 'react';
import { useImageGenerator } from '../contexts/ImageGeneratorContext';
import { X, Upload, Image as ImageIcon } from 'lucide-react';
import { WIN95, BTN } from '../utils/buttonStyles';

interface ReferenceImageInputProps {
  singleImageOnly?: boolean;
}

interface ImageDimensions {
  width: number;
  height: number;
}

interface ImageWithDimensions {
  url: string;
  dimensions: ImageDimensions;
}

const ReferenceImageInput: React.FC<ReferenceImageInputProps> = ({ singleImageOnly = false }) => {
  const { controlNetImage, setControlNetImage } = useImageGenerator();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewImage, setPreviewImage] = useState<string | null>(null); // For enlarged view

  const handleImageUpload = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (files.length === 0) return;
    
    const filesToProcess = singleImageOnly ? [files[0]] : files;
    
    for (const file of filesToProcess) {
      if (!file.type.startsWith('image/')) { alert('Please select valid image files'); return; }
      if (file.size > 10 * 1024 * 1024) { alert(`Image "${file.name}" too large (max 10MB)`); return; }
    }

    if (filesToProcess.length === 1 || singleImageOnly) {
      const file = filesToProcess[0];
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
      const imageArray: (ImageWithDimensions | null)[] = [];
      let loadedCount = 0, errorCount = 0;
      
      filesToProcess.forEach((file, index) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = new Image();
          img.onload = () => {
            const result = e.target?.result as string;
            imageArray[index] = { url: result, dimensions: { width: img.width, height: img.height } };
            loadedCount++;
            if (loadedCount + errorCount === filesToProcess.length) {
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
  };

  const handleRemove = () => { 
    setControlNetImage(null); 
    if (fileInputRef.current) fileInputRef.current.value = ''; 
  };
  const handleClick = () => fileInputRef.current?.click();

  const getImageUrl = (): string | null => {
    if (!controlNetImage) return null;
    if (Array.isArray(controlNetImage)) {
      return controlNetImage[0] || null;
    }
    return controlNetImage;
  };

  const imageUrl = getImageUrl();
  const isMultiple = Array.isArray(controlNetImage) && controlNetImage.length > 1;

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
          Reference Image
        </span>
        {isMultiple && (
          <span className="text-[9px] opacity-80">({(controlNetImage as string[]).length})</span>
        )}
      </div>
      
      {!controlNetImage ? (
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
            <span>Upload Image</span>
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 p-1 flex-1">
          {isMultiple ? (
            <div className="flex gap-1 h-full overflow-x-auto flex-1" style={{ maxWidth: 'calc(100% - 70px)' }}>
              {Array.isArray(controlNetImage) && controlNetImage.slice(0, 3).map((url: string, i: number) => (
                <div 
                  key={i} 
                  className="flex-shrink-0 cursor-pointer" 
                  style={{ 
                    width: '44px', 
                    height: '44px',
                    boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`
                  }} 
                  onClick={() => setPreviewImage(url)} 
                  title="Click to enlarge"
                >
                  <img src={url} alt={`Ref ${i+1}`} className="w-full h-full object-cover hover:opacity-80 transition-opacity" />
                </div>
              ))}
              {Array.isArray(controlNetImage) && controlNetImage.length > 3 && (
                <span className="text-[9px] self-center flex-shrink-0 px-1 font-bold" style={{ color: WIN95.text }}>+{controlNetImage.length - 3}</span>
              )}
            </div>
          ) : (
            <div 
              className="flex-shrink-0 cursor-pointer" 
              style={{ 
                width: '44px', 
                height: '44px',
                boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`
              }} 
              onClick={() => setPreviewImage(imageUrl || null)} 
              title="Click to enlarge"
            >
              {imageUrl && (
                <img src={imageUrl} alt="Ref" className="w-full h-full object-cover hover:opacity-80 transition-opacity" />
              )}
            </div>
          )}
          <div className="flex gap-1 flex-shrink-0 ml-auto">
            <button 
              onClick={handleClick} 
              className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold" 
              style={BTN.base} 
              title="Change image"
            >
              ✏️ Edit
            </button>
            <button 
              onClick={handleRemove} 
              className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold" 
              style={{
                ...BTN.base,
                background: '#c0c0c0'
              }} 
              title="Remove image"
            >
              <X className="w-3 h-3" />
            </button>
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

