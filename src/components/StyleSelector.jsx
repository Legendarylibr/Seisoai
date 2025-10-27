import React, { useState } from 'react';
import { useImageGenerator } from '../contexts/ImageGeneratorContext';
import { VISUAL_STYLES } from '../utils/styles';
import { Search, ChevronDown, ChevronUp, Palette } from 'lucide-react';

const StyleSelector = () => {
  const { selectedStyle, selectStyle } = useImageGenerator();
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [showStyleOptions, setShowStyleOptions] = useState(false);

  // Get unique categories
  const categories = ['All', ...new Set(VISUAL_STYLES.map(style => style.category))];

  // Filter styles based on category and search
  const filteredStyles = VISUAL_STYLES.filter(style => {
    const matchesCategory = selectedCategory === 'All' || style.category === selectedCategory;
    const matchesSearch = style.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         style.description.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="w-full space-y-3">
      {/* Style Selection Header */}
      <div className="flex items-center gap-3 mb-3">
        <Palette className="w-5 h-5 text-purple-400" />
        <div>
          <h3 className="text-sm font-semibold">Style for Reference Image</h3>
          <p className="text-xs text-gray-400">
            {selectedStyle ? `${selectedStyle.name} applied` : 'Optional - enhance with visual style'}
          </p>
        </div>
      </div>

      {/* Selected Style Display */}
      {selectedStyle && (
        <div className="p-3 bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-lg border border-purple-500/20 mb-3">
          <div className="flex items-center gap-2">
            <div className="text-xl">{selectedStyle.emoji}</div>
            <div className="flex-1">
              <h4 className="font-semibold text-purple-300 text-sm">{selectedStyle.name}</h4>
              <p className="text-xs text-gray-400">{selectedStyle.description}</p>
            </div>
            <button
              onClick={() => selectStyle(null)}
              className="p-1 rounded hover:bg-white/10 transition-colors"
              title="Clear selection"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Style Selection Button */}
    <button
      onClick={() => setShowStyleOptions(!showStyleOptions)}
      aria-label={selectedStyle ? `Change style from ${selectedStyle}` : 'Choose style'}
      aria-expanded={showStyleOptions}
      className="w-full bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/30 text-purple-300 hover:from-purple-500/30 hover:to-pink-500/30 hover:border-purple-400/50 flex items-center justify-center gap-3 py-3 px-4 rounded-lg font-medium transition-all duration-200 hover:scale-105"
    >
        <Palette className="w-5 h-5" />
        <span>{selectedStyle ? 'Change Style' : 'Select Style for Image (Optional)'}</span>
        {showStyleOptions ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      {/* Style Options Dropdown */}
      {showStyleOptions && (
        <div className="space-y-3">
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search styles..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="Search for styles"
              className="w-full pl-10 pr-4 py-2 rounded-lg bg-white/10 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-400 text-sm"
            />
          </div>

          {/* Category Filter */}
          <div className="flex flex-wrap gap-1">
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`
                  px-3 py-1 rounded text-xs font-medium transition-all duration-200
                  ${selectedCategory === category
                    ? 'bg-purple-500 text-white'
                    : 'bg-white/10 text-gray-300 hover:bg-white/20'
                  }
                `}
              >
                {category}
              </button>
            ))}
          </div>

          {/* Styles Grid */}
          <div className="max-h-60 overflow-y-auto">
            <div className="grid grid-cols-3 gap-2">
              {filteredStyles.map((style) => (
                <button
                  key={style.id}
                  onClick={() => {
                    selectStyle(style);
                    setShowStyleOptions(false);
                  }}
                  aria-label={`Select ${style.name} style from ${style.category} category`}
                  className={`
                    relative p-2 rounded-lg transition-all duration-300 transform hover:scale-105 group
                    ${selectedStyle?.id === style.id 
                      ? 'ring-2 ring-purple-400 shadow-lg shadow-purple-500/25' 
                      : 'hover:shadow-lg hover:shadow-purple-500/10'
                    }
                    glass-effect hover:bg-white/20
                  `}
                >
                  <div className="text-center">
                    <div className="text-lg mb-1 group-hover:scale-110 transition-transform duration-200">
                      {style.emoji}
                    </div>
                    <h3 className="font-semibold text-xs mb-1">{style.name}</h3>
                    <div className="text-xs text-purple-400 font-medium">{style.category}</div>
                  </div>
                  {selectedStyle?.id === style.id && (
                    <div className="absolute top-1 right-1 w-2 h-2 bg-purple-400 rounded-full animate-pulse" />
                  )}
                </button>
              ))}
            </div>

            {/* No Results */}
            {filteredStyles.length === 0 && (
              <div className="text-center py-8">
                <div className="text-2xl mb-2">🔍</div>
                <h3 className="text-sm font-semibold text-gray-300 mb-1">No styles found</h3>
                <p className="text-xs text-gray-500">Try adjusting your search or category filter</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Help Section */}
      {!selectedStyle && !showStyleOptions && (
        <div className="p-3 bg-blue-500/10 rounded-lg border border-blue-500/20">
          <div className="flex items-start gap-2">
            <div className="text-blue-400 text-sm">💡</div>
            <div>
              <h4 className="font-semibold text-blue-300 text-xs mb-1">Enhance reference image with style</h4>
              <p className="text-xs text-gray-400">
                Apply a visual style to your reference image. 
                <strong>Photorealistic</strong> for realistic photos, 
                <strong>Artistic</strong> for creative flair, and 
                <strong>Professional</strong> for business use.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StyleSelector;
