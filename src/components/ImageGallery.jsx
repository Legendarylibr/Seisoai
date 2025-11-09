import React, { useState } from 'react';
import { useImageGenerator } from '../contexts/ImageGeneratorContext';
import { Download, Trash2, Eye, Calendar, Palette, Sparkles, X } from 'lucide-react';

const ImageGallery = () => {
  const { generationHistory, clearAll } = useImageGenerator();
  const [selectedImage, setSelectedImage] = useState(null);
  const [filterCategory, setFilterCategory] = useState('All');

  const categories = ['All', 'Photorealistic', 'Artistic', 'Professional', 'Creative'];

  const filteredHistory = generationHistory.filter(item => 
    filterCategory === 'All' || item.style?.category === filterCategory
  );

  const handleDownload = async (imageUrl, styleName) => {
    if (!imageUrl) return;
    
    try {
      const getNextSeisoFilename = () => {
        try {
          const key = 'seiso_download_index';
          const current = parseInt(localStorage.getItem(key) || '0', 10) || 0;
          const next = current + 1;
          localStorage.setItem(key, String(next));
          return `seiso${next}.png`;
        } catch (_) {
          return `seiso${Date.now()}.png`;
        }
      };
      const filename = getNextSeisoFilename();

      // Fetch the image as a blob to handle CORS issues
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      
      // Create a blob URL
      const blobUrl = window.URL.createObjectURL(blob);
      
      // Detect iOS
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
      
      if (isIOS) {
        // iOS Safari requires opening in new tab for download
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = filename;
        // Add to DOM temporarily (required for iOS)
        link.style.display = 'none';
        document.body.appendChild(link);
        
        // Trigger download with click event
        const clickEvent = new MouseEvent('click', {
          view: window,
          bubbles: true,
          cancelable: true
        });
        link.dispatchEvent(clickEvent);
        
        // Cleanup after a delay for iOS
        setTimeout(() => {
          document.body.removeChild(link);
          window.URL.revokeObjectURL(blobUrl);
        }, 100);
      } else {
        // Standard download for other browsers
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);
      }
    } catch (error) {
      console.error('Download failed:', error);
      // Fallback to opening image in new tab
      const link = document.createElement('a');
      link.href = imageUrl;
      try {
        const key = 'seiso_download_index';
        const current = parseInt(localStorage.getItem(key) || '0', 10) || 0;
        const next = current + 1;
        localStorage.setItem(key, String(next));
        link.download = `seiso${next}.png`;
      } catch (_) {
        link.download = `seiso${Date.now()}.png`;
      }
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const formatDate = (timestamp) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  if (generationHistory.length === 0) {
    return (
      <div className="text-center py-16 md:py-24 fade-in">
        <div className="glass-card w-32 h-32 mx-auto mb-8 flex items-center justify-center rounded-2xl">
          <svg viewBox="0 0 24 24" fill="none" className="w-16 h-16 text-gray-400">
            <path
              d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"
              fill="currentColor"
            />
          </svg>
        </div>
        <h3 className="text-2xl md:text-3xl font-semibold gradient-text mb-3">No Images Yet</h3>
        <p className="text-gray-400 text-lg mb-8">Start generating images to see them here</p>
        <button
          onClick={() => window.location.href = '#generate'}
          className="btn-primary flex items-center gap-2 mx-auto slide-up"
        >
          <Sparkles className="w-5 h-5" />
          Generate Your First Image
        </button>
      </div>
    );
  }

  return (
    <div className="section-spacing fade-in">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 mb-6">
        <div className="slide-up">
          <h2 className="text-3xl md:text-4xl font-bold gradient-text mb-2">Your Gallery</h2>
          <p className="text-gray-400 text-base">{generationHistory.length} {generationHistory.length === 1 ? 'image' : 'images'} generated</p>
        </div>
        <button
          onClick={clearAll}
          className="btn-secondary flex items-center gap-2 slide-up"
          style={{ animationDelay: '100ms' }}
        >
          <Trash2 className="w-4 h-4" />
          Clear All
        </button>
      </div>

      {/* Filter */}
      <div className="flex flex-wrap gap-3 mb-6">
        {categories.map((category, index) => (
          <button
            key={category}
            onClick={() => setFilterCategory(category)}
            className={`
              px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-300
              ${filterCategory === category
                ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-lg shadow-purple-500/30 scale-105'
                : 'bg-white/10 text-gray-300 hover:bg-white/20 hover:scale-105'
              }
            `}
            style={{ animationDelay: `${index * 50}ms` }}
          >
            {category}
          </button>
        ))}
      </div>

      {/* Gallery Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
        {filteredHistory.map((item, index) => (
          <div
            key={item.id}
            className="glass-card rounded-2xl overflow-hidden group cursor-pointer slide-up card-hover"
            onClick={() => setSelectedImage(item)}
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <div className="aspect-square relative overflow-hidden">
              <img
                src={item.image}
                alt="Generated image"
                className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                loading="lazy"
                onError={(e) => {
                  console.error('Gallery image failed to load:', item.image);
                  e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="400"%3E%3Crect fill="%23333" width="400" height="400"/%3E%3Ctext fill="%23999" x="50%25" y="50%25" text-anchor="middle" dy=".3em" font-family="sans-serif" font-size="14"%3EImage not available%3C/text%3E%3C/svg%3E';
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                <div className="flex items-center gap-2 text-white">
                  <Eye className="w-6 h-6" />
                  <span className="text-sm font-medium">View</span>
                </div>
              </div>
            </div>
            <div className="p-4 bg-gradient-to-b from-white/5 to-transparent">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xl">{item.style?.emoji}</span>
                <h3 className="font-semibold text-sm truncate text-white">{item.style?.name || 'Untitled'}</h3>
              </div>
              <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-3">
                <Calendar className="w-3.5 h-3.5" />
                {formatDate(item.timestamp)}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-purple-400 font-semibold bg-purple-500/10 px-2 py-1 rounded-md">
                  {item.style?.category || 'Uncategorized'}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDownload(item.image, item.style?.name);
                  }}
                  className="p-2 rounded-lg hover:bg-white/20 transition-all duration-300 hover:scale-110"
                >
                  <Download className="w-4 h-4 text-gray-300 group-hover:text-white transition-colors" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* No Results */}
      {filteredHistory.length === 0 && (
        <div className="text-center py-16 slide-up">
          <div className="glass-card w-20 h-20 mx-auto mb-6 flex items-center justify-center rounded-xl">
            <div className="text-4xl">🔍</div>
          </div>
          <h3 className="text-xl font-semibold text-gray-300 mb-2">No images found</h3>
          <p className="text-gray-500">Try selecting a different category</p>
        </div>
      )}

      {/* Image Modal */}
      {selectedImage && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="glass-card rounded-2xl max-w-4xl max-h-[90vh] overflow-hidden slide-up">
            <div className="p-6 border-b border-white/10 flex items-center justify-between bg-gradient-to-r from-purple-500/10 to-pink-500/10">
              <div className="flex items-center gap-4">
                <div className="p-2 bg-purple-500/20 rounded-lg">
                  <span className="text-3xl">{selectedImage.style?.emoji}</span>
                </div>
                <div>
                  <h3 className="font-semibold text-lg text-white">{selectedImage.style?.name || 'Untitled'}</h3>
                  <p className="text-sm text-gray-400 mt-1">{selectedImage.style?.category || 'Uncategorized'}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedImage(null)}
                className="p-2 rounded-lg hover:bg-white/20 transition-all duration-300 hover:scale-110"
              >
                <X className="w-5 h-5 text-gray-400 hover:text-white" />
              </button>
            </div>
            <div className="p-6">
              <img
                src={selectedImage.image}
                alt="Generated image"
                className="w-full h-auto max-w-full max-h-[60vh] sm:max-h-[70vh] md:max-h-[80vh] object-contain mx-auto rounded-xl shadow-2xl"
                style={{ 
                  maxWidth: '100%', 
                  height: 'auto',
                  display: 'block'
                }}
                loading="lazy"
                onError={(e) => {
                  console.error('Modal image failed to load:', selectedImage.image);
                  e.target.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="800" height="600"%3E%3Crect fill="%23333" width="800" height="600"/%3E%3Ctext fill="%23999" x="50%25" y="50%25" text-anchor="middle" dy=".3em" font-family="sans-serif" font-size="16"%3EImage not available%3C/text%3E%3C/svg%3E';
                }}
              />
              <div className="mt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="text-sm text-gray-400 flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  Generated on {formatDate(selectedImage.timestamp)}
                </div>
                <button
                  onClick={() => handleDownload(selectedImage.image, selectedImage.style?.name)}
                  className="btn-primary flex items-center gap-2"
                >
                  <Download className="w-5 h-5" />
                  Download
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImageGallery;
