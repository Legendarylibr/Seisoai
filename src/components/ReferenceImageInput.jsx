import React, { useRef, useState } from 'react';
import { useImageGenerator } from '../contexts/ImageGeneratorContext';
import { X } from 'lucide-react';
import logger from '../utils/logger.js';

const ReferenceImageInput = ({ singleImageOnly = false }) => {
  const { controlNetImage, setControlNetImage } = useImageGenerator();
  const fileInputRef = useRef(null);
  const [previewImage, setPreviewImage] = useState(null); // For enlarged view

  const handleImageUpload = (event) => {
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
        img.onload = () => setControlNetImage(e.target.result, { width: img.width, height: img.height });
        img.onerror = () => setControlNetImage(e.target.result, null);
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    } else {
      const imageArray = [];
      let loadedCount = 0, errorCount = 0;
      
      filesToProcess.forEach((file, index) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const img = new Image();
          img.onload = () => {
            imageArray[index] = { url: e.target.result, dimensions: { width: img.width, height: img.height } };
            loadedCount++;
            if (loadedCount + errorCount === filesToProcess.length) {
              const successful = imageArray.filter(i => i);
              if (successful.length > 0) setControlNetImage(successful.map(i => i.url), successful[0].dimensions);
            }
          };
          img.onerror = () => { errorCount++; };
          img.src = e.target.result;
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const handleRemove = () => { setControlNetImage(null); if (fileInputRef.current) fileInputRef.current.value = ''; };
  const handleClick = () => fileInputRef.current?.click();

  return (
    <div className="h-full flex flex-col">
      {!controlNetImage ? (
        <div onClick={handleClick} className="h-full flex items-center justify-center cursor-pointer hover:bg-white/20 transition-colors">
          <button
            onClick={(e) => { e.stopPropagation(); handleClick(); }}
            className="px-2 py-1 rounded text-[10px] font-medium"
            style={{
              background: 'linear-gradient(to bottom, #f0f0f0, #e0e0e0)',
              border: '1px outset #e0e0e0',
              boxShadow: 'inset 1px 1px 0 rgba(255,255,255,0.9)',
              color: '#000'
            }}
          >
            📁 Upload
          </button>
        </div>
      ) : (
        <div className="h-full flex items-center gap-1 p-0.5">
          {Array.isArray(controlNetImage) && controlNetImage.length > 1 ? (
            <div className="flex-1 flex gap-0.5 h-full overflow-x-auto">
              {controlNetImage.slice(0, 4).map((url, i) => (
                <div key={i} className="h-full aspect-square relative flex-shrink-0 cursor-pointer" onClick={() => setPreviewImage(url)} title="Click to enlarge">
                  <img src={url} alt={`Ref ${i+1}`} className="h-full w-full object-cover rounded hover:opacity-80 transition-opacity" />
                </div>
              ))}
              {controlNetImage.length > 4 && <span className="text-[9px] self-center">+{controlNetImage.length - 4}</span>}
            </div>
          ) : (
            <div className="h-full aspect-square relative cursor-pointer" onClick={() => setPreviewImage(Array.isArray(controlNetImage) ? controlNetImage[0] : controlNetImage)} title="Click to enlarge">
              <img src={Array.isArray(controlNetImage) ? controlNetImage[0] : controlNetImage} alt="Ref" className="h-full w-full object-cover rounded hover:opacity-80 transition-opacity" />
            </div>
          )}
          <div className="flex flex-col gap-0.5">
            <button onClick={handleClick} className="px-1 py-0.5 rounded text-[9px]" style={{ background: 'linear-gradient(to bottom,#f0f0f0,#e0e0e0)', border: '1px outset #e0e0e0', color: '#000' }}>Change</button>
            <button onClick={handleRemove} className="px-1 py-0.5 rounded text-[9px]" style={{ background: 'linear-gradient(to bottom,#fecaca,#fca5a5)', border: '1px outset #fca5a5', color: '#7f1d1d' }}>Remove</button>
          </div>
        </div>
      )}
      <input ref={fileInputRef} type="file" accept="image/*" multiple={!singleImageOnly} onChange={handleImageUpload} className="hidden" />
      
      {/* Enlarged image preview modal */}
      {previewImage && (
        <div 
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
          onClick={() => setPreviewImage(null)}
        >
          <div className="relative max-w-[90vw] max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <img 
              src={previewImage} 
              alt="Enlarged reference" 
              className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
            />
            <button
              onClick={() => setPreviewImage(null)}
              className="absolute -top-2 -right-2 p-1.5 rounded-full shadow-lg transition-colors"
              style={{ 
                background: 'linear-gradient(to bottom, #f0f0f0, #e0e0e0)',
                border: '2px outset #f0f0f0'
              }}
              title="Close preview"
            >
              <X className="w-4 h-4" style={{ color: '#000' }} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReferenceImageInput;
