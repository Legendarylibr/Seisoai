import React, { useState } from 'react';
import { useImageGenerator } from '../contexts/ImageGeneratorContext';
import { Download, Trash2, Eye, Calendar, Palette, Sparkles } from 'lucide-react';

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
      // Fetch the image as a blob to handle CORS issues
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      
      // Create a blob URL
      const blobUrl = window.URL.createObjectURL(blob);
      
      // Create download link
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `ai-generated-${styleName || 'image'}-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      
      // Cleanup
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error('Download failed:', error);
      // Fallback to direct link method
      const link = document.createElement('a');
      link.href = imageUrl;
      link.download = `ai-generated-${styleName || 'image'}-${Date.now()}.png`;
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
      <div className="text-center py-12">
        <div className="w-24 h-24 mx-auto mb-6 opacity-50">
          <svg viewBox="0 0 24 24" fill="none" className="w-full h-full text-gray-400">
            <path
              d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"
              fill="currentColor"
            />
          </svg>
        </div>
        <h3 className="text-xl font-semibold text-gray-300 mb-2">No Images Yet</h3>
        <p className="text-gray-500 mb-6">Start generating images to see them here</p>
        <button
          onClick={() => window.location.href = '#generate'}
          className="btn-primary flex items-center gap-2 mx-auto"
        >
          <Sparkles className="w-4 h-4" />
          Generate Your First Image
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold gradient-text">Your Gallery</h2>
          <p className="text-gray-400">{generationHistory.length} images generated</p>
        </div>
        <button
          onClick={clearAll}
          className="btn-secondary flex items-center gap-2"
        >
          <Trash2 className="w-4 h-4" />
          Clear All
        </button>
      </div>

      {/* Filter */}
      <div className="flex flex-wrap gap-2">
        {categories.map((category) => (
          <button
            key={category}
            onClick={() => setFilterCategory(category)}
            className={`
              px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200
              ${filterCategory === category
                ? 'bg-purple-500 text-white'
                : 'bg-white/10 text-gray-300 hover:bg-white/20'
              }
            `}
          >
            {category}
          </button>
        ))}
      </div>

      {/* Gallery Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {filteredHistory.map((item) => (
          <div
            key={item.id}
            className="glass-effect rounded-xl overflow-hidden group cursor-pointer"
            onClick={() => setSelectedImage(item)}
          >
            <div className="aspect-square relative overflow-hidden">
              <img
                src={item.image}
                alt="Generated image"
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                <Eye className="w-8 h-8 text-white" />
              </div>
            </div>
            <div className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-lg">{item.style?.emoji}</span>
                <h3 className="font-semibold text-sm truncate">{item.style?.name}</h3>
              </div>
              <div className="flex items-center gap-1 text-xs text-gray-400 mb-2">
                <Calendar className="w-3 h-3" />
                {formatDate(item.timestamp)}
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-purple-400 font-medium">
                  {item.style?.category}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDownload(item.image, item.style?.name);
                  }}
                  className="p-1 rounded hover:bg-white/10 transition-colors"
                >
                  <Download className="w-4 h-4 text-gray-400" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* No Results */}
      {filteredHistory.length === 0 && (
        <div className="text-center py-12">
          <div className="text-4xl mb-4">🔍</div>
          <h3 className="text-lg font-semibold text-gray-300 mb-2">No images found</h3>
          <p className="text-gray-500">Try selecting a different category</p>
        </div>
      )}

      {/* Image Modal */}
      {selectedImage && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 rounded-xl max-w-4xl max-h-[90vh] overflow-hidden">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{selectedImage.style?.emoji}</span>
                <div>
                  <h3 className="font-semibold">{selectedImage.style?.name}</h3>
                  <p className="text-sm text-gray-400">{selectedImage.style?.category}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedImage(null)}
                className="p-2 rounded-lg hover:bg-white/10 transition-colors"
              >
                ✕
              </button>
            </div>
            <div className="p-4">
              <img
                src={selectedImage.image}
                alt="Generated image"
                className="max-w-full max-h-[60vh] object-contain mx-auto rounded-lg"
              />
              <div className="mt-4 flex items-center justify-between">
                <div className="text-sm text-gray-400">
                  Generated on {formatDate(selectedImage.timestamp)}
                </div>
                <button
                  onClick={() => handleDownload(selectedImage.image, selectedImage.style?.name)}
                  className="btn-primary flex items-center gap-2"
                >
                  <Download className="w-4 h-4" />
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
