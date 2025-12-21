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
    <div className="w-full space-y-2">
      {/* Style Selection Header */}
      <div className="flex items-center gap-2 mb-2">
        <div className="p-1 rounded" style={{ 
          background: 'linear-gradient(to bottom, #e0e0e0, #d0d0d0)',
          border: '2px outset #e0e0e0',
          boxShadow: 'inset 1px 1px 0 rgba(255, 255, 255, 0.9), inset -1px -1px 0 rgba(0, 0, 0, 0.3)'
        }}>
          <Palette className="w-3 h-3" style={{ color: '#000000' }} />
        </div>
        <div>
          <h3 className="text-xs font-semibold" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>Style (Optional)</h3>
          <p className="text-xs" style={{ color: '#1a1a1a', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.6)' }}>
            {selectedStyle ? `${selectedStyle.name} applied` : 'Works with Flux & Nano Banana Pro'}
          </p>
        </div>
      </div>

      {/* Selected Style Display */}
      {selectedStyle && (
        <div className="p-2 rounded mb-2" style={{ 
          background: 'linear-gradient(to bottom, #f5f5f5, #eeeeee)',
          border: '2px outset #e8e8e8',
          boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.25)'
        }}>
          <div className="flex items-center gap-2">
            <div className="text-lg">{selectedStyle.emoji}</div>
            <div className="flex-1">
              <h4 className="font-semibold text-xs" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>{selectedStyle.name}</h4>
              <p className="text-xs" style={{ color: '#1a1a1a', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.6)' }}>{selectedStyle.description}</p>
            </div>
            <button
              onClick={() => selectStyle(null)}
              className="p-1 rounded transition-all"
              style={{
                background: 'linear-gradient(to bottom, #f0f0f0, #e0e0e0)',
                border: '2px outset #f0f0f0',
                boxShadow: 'inset 1px 1px 0 rgba(255, 255, 255, 0.9), inset -1px -1px 0 rgba(0, 0, 0, 0.3)',
                color: '#000000'
              }}
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
      className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded transition-all duration-200"
      style={selectedStyle ? {
        background: 'linear-gradient(to bottom, #d0d0d0, #c0c0c0, #b0b0b0)',
        border: '2px inset #c0c0c0',
        boxShadow: 'inset 3px 3px 0 rgba(0, 0, 0, 0.25), inset -1px -1px 0 rgba(255, 255, 255, 0.5)',
        color: '#000000',
        textShadow: '1px 1px 0 rgba(255, 255, 255, 0.6)'
      } : {
        background: 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)',
        border: '2px outset #f0f0f0',
        boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)',
        color: '#000000',
        textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)'
      }}
      onMouseEnter={(e) => {
        if (!selectedStyle) {
          e.currentTarget.style.background = 'linear-gradient(to bottom, #f8f8f8, #e8e8e8, #e0e0e0)';
          e.currentTarget.style.border = '2px outset #f8f8f8';
        }
      }}
      onMouseLeave={(e) => {
        if (!selectedStyle) {
          e.currentTarget.style.background = 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)';
          e.currentTarget.style.border = '2px outset #f0f0f0';
        }
      }}
    >
        <Palette className="w-4 h-4" style={{ color: '#000000' }} />
        <span className="text-xs font-medium">{selectedStyle ? 'Change Style' : 'Select Style (Optional)'}</span>
        {showStyleOptions ? <ChevronUp className="w-3 h-3" style={{ color: '#000000' }} /> : <ChevronDown className="w-3 h-3" style={{ color: '#000000' }} />}
      </button>

      {/* Style Options Dropdown */}
      {showStyleOptions && (
        <div className="space-y-3">
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3 h-3" style={{ color: '#000000' }} />
            <input
              type="text"
              placeholder="Search styles..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="Search for styles"
              className="w-full pl-8 pr-3 py-1.5 rounded text-xs transition-all duration-300"
              style={{
                background: '#ffffff',
                border: '2px inset #c0c0c0',
                color: '#000000',
                boxShadow: 'inset 3px 3px 0 rgba(0, 0, 0, 0.15), inset -1px -1px 0 rgba(255, 255, 255, 0.5)'
              }}
              onFocus={(e) => {
                e.target.style.border = '2px inset #808080';
                e.target.style.boxShadow = 'inset 3px 3px 0 rgba(0, 0, 0, 0.25), inset -1px -1px 0 rgba(255, 255, 255, 0.3)';
                e.target.style.background = '#fffffe';
              }}
              onBlur={(e) => {
                e.target.style.border = '2px inset #c0c0c0';
                e.target.style.boxShadow = 'inset 3px 3px 0 rgba(0, 0, 0, 0.15), inset -1px -1px 0 rgba(255, 255, 255, 0.5)';
                e.target.style.background = '#ffffff';
              }}
            />
          </div>

          {/* Category Filter */}
          <div className="flex flex-wrap gap-1">
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className="px-2 py-1 rounded text-xs font-medium transition-all duration-200"
                style={selectedCategory === category ? {
                  background: 'linear-gradient(to bottom, #d0d0d0, #c0c0c0, #b0b0b0)',
                  border: '2px inset #c0c0c0',
                  boxShadow: 'inset 3px 3px 0 rgba(0, 0, 0, 0.25), inset -1px -1px 0 rgba(255, 255, 255, 0.5)',
                  color: '#000000',
                  textShadow: '1px 1px 0 rgba(255, 255, 255, 0.6)'
                } : {
                  background: 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)',
                  border: '2px outset #f0f0f0',
                  boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.2)',
                  color: '#000000',
                  textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)'
                }}
                onMouseEnter={(e) => {
                  if (selectedCategory !== category) {
                    e.currentTarget.style.background = 'linear-gradient(to bottom, #f8f8f8, #e8e8e8, #e0e0e0)';
                    e.currentTarget.style.border = '2px outset #f8f8f8';
                  }
                }}
                onMouseLeave={(e) => {
                  if (selectedCategory !== category) {
                    e.currentTarget.style.background = 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)';
                    e.currentTarget.style.border = '2px outset #f0f0f0';
                  }
                }}
              >
                {category}
              </button>
            ))}
          </div>

          {/* Styles Grid */}
          <div className="max-h-60 overflow-y-auto">
            <div className="grid grid-cols-3 gap-1.5">
              {filteredStyles.map((style) => (
                <button
                  key={style.id}
                  onClick={() => {
                    selectStyle(style);
                    setShowStyleOptions(false);
                  }}
                  aria-label={`Select ${style.name} style from ${style.category} category`}
                  className="relative p-2 rounded transition-all duration-300 group"
                  style={selectedStyle?.id === style.id ? {
                    background: 'linear-gradient(to bottom, #d0d0d0, #c0c0c0, #b0b0b0)',
                    border: '2px inset #c0c0c0',
                    boxShadow: 'inset 3px 3px 0 rgba(0, 0, 0, 0.25), inset -1px -1px 0 rgba(255, 255, 255, 0.5), 0 2px 4px rgba(0, 0, 0, 0.2)'
                  } : {
                    background: 'linear-gradient(to bottom, #ffffff, #f5f5f5)',
                    border: '2px outset #e8e8e8',
                    boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.25), 0 2px 4px rgba(0, 0, 0, 0.15)'
                  }}
                  onMouseEnter={(e) => {
                    if (selectedStyle?.id !== style.id) {
                      e.currentTarget.style.background = 'linear-gradient(to bottom, #f8f8f8, #f0f0f0)';
                      e.currentTarget.style.border = '2px outset #f0f0f0';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (selectedStyle?.id !== style.id) {
                      e.currentTarget.style.background = 'linear-gradient(to bottom, #ffffff, #f5f5f5)';
                      e.currentTarget.style.border = '2px outset #e8e8e8';
                    }
                  }}
                >
                  <div className="text-center">
                    <div className="text-base mb-1 group-hover:scale-110 transition-transform duration-200">
                      {style.emoji}
                    </div>
                    <h3 className="font-bold text-xs mb-0.5" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>{style.name}</h3>
                    <div className="text-xs font-medium" style={{ color: '#1a1a1a', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.6)' }}>{style.category}</div>
                  </div>
                  {selectedStyle?.id === style.id && (
                    <div className="absolute top-1 right-1 w-2 h-2 rounded-full" style={{ 
                      background: '#000000',
                      boxShadow: '0 0 2px rgba(255, 255, 255, 0.8)'
                    }} />
                  )}
                </button>
              ))}
            </div>

            {/* No Results */}
            {filteredStyles.length === 0 && (
              <div className="text-center py-6">
                <div className="text-xl mb-2">🔍</div>
                <h3 className="text-xs font-semibold mb-1" style={{ color: '#000000', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' }}>No styles found</h3>
                <p className="text-xs" style={{ color: '#1a1a1a', textShadow: '1px 1px 0 rgba(255, 255, 255, 0.6)' }}>Try adjusting your search or category filter</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Help Section - REMOVED */}
    </div>
  );
};

export default StyleSelector;
