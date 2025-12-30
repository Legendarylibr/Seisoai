import React, { useState, memo, useMemo, useRef, useEffect } from 'react';
import { useImageGenerator } from '../contexts/ImageGeneratorContext';
import { VISUAL_STYLES } from '../utils/styles';
import { Search, ChevronDown, ChevronUp, Palette, X } from 'lucide-react';
import { WIN95 } from '../utils/buttonStyles';

// PERFORMANCE: Pre-compute categories once
const CATEGORIES = ['All', ...new Set(VISUAL_STYLES.map(s => s.category))];

const StyleSelector = memo(() => {
  const { selectedStyle, selectStyle } = useImageGenerator();
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [showStyleOptions, setShowStyleOptions] = useState(false);
  const dropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowStyleOptions(false);
      }
    };
    if (showStyleOptions) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showStyleOptions]);

  // PERFORMANCE: Memoize filtered styles
  const filteredStyles = useMemo(() => VISUAL_STYLES.filter(style => {
    const matchesCategory = selectedCategory === 'All' || style.category === selectedCategory;
    const matchesSearch = style.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         style.description.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  }), [selectedCategory, searchTerm]);

  const win95Btn = {
    background: WIN95.buttonFace,
    border: 'none',
    boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}, inset 2px 2px 0 ${WIN95.bgLight}, inset -2px -2px 0 ${WIN95.bgDark}`,
    color: WIN95.text,
    fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
  };

  const win95BtnActive = {
    background: WIN95.bgDark,
    border: 'none',
    boxShadow: `inset 1px 1px 0 ${WIN95.border.darker}, inset -1px -1px 0 ${WIN95.border.light}`,
    color: WIN95.text,
    fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
  };

  return (
    <div 
      ref={dropdownRef}
      className="w-full relative" 
      style={{ 
        background: WIN95.bg,
        fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
      }}
    >
      {/* Toggle Button - Shows current selection */}
      <button
        onClick={() => setShowStyleOptions(!showStyleOptions)}
        className="w-full flex items-center justify-between gap-2 py-2 px-3 text-[11px]"
        style={showStyleOptions ? win95BtnActive : win95Btn}
      >
        <div className="flex items-center gap-2 min-w-0">
          <Palette className="w-4 h-4 flex-shrink-0" style={{ color: selectedStyle ? '#008080' : WIN95.text }} />
          {selectedStyle ? (
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-base">{selectedStyle.emoji}</span>
              <span className="font-bold truncate">{selectedStyle.name}</span>
              <span className="text-[9px] px-1 py-0.5 rounded" style={{ background: '#e0e0e0', color: '#444' }}>
                {selectedStyle.category}
              </span>
            </div>
          ) : (
            <span className="font-medium">Select Style (Optional)</span>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {selectedStyle && (
            <button
              onClick={(e) => { e.stopPropagation(); selectStyle(null); }}
              className="p-0.5 hover:bg-gray-300 rounded"
              title="Clear style"
            >
              <X className="w-3 h-3" />
            </button>
          )}
          {showStyleOptions ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {/* Dropdown - Opens DOWNWARD on desktop */}
      {showStyleOptions && (
        <div 
          className="absolute left-0 right-0 top-full mt-1 z-50 space-y-2 p-2"
          style={{
            background: WIN95.bg,
            boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}, 0 4px 12px rgba(0,0,0,0.25)`,
            border: `1px solid ${WIN95.border.darker}`
          }}
        >
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-3.5 h-3.5" style={{ color: WIN95.textDisabled }} />
            <input
              type="text"
              placeholder="Search styles..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-7 pr-2 py-1.5 text-[11px]"
              style={{
                background: WIN95.inputBg,
                boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}, inset 2px 2px 0 ${WIN95.border.darker}`,
                border: 'none',
                color: WIN95.text,
                fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
              }}
              autoFocus
            />
          </div>

          {/* Categories */}
          <div className="flex flex-wrap gap-1">
            {CATEGORIES.map(category => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className="px-2 py-1 text-[10px] font-medium"
                style={selectedCategory === category ? win95BtnActive : win95Btn}
              >
                {category}
              </button>
            ))}
          </div>

          {/* Styles Grid */}
          <div className="overflow-y-auto max-h-64">
            <div className="grid grid-cols-3 lg:grid-cols-4 gap-1.5">
              {filteredStyles.map(style => (
                <button
                  key={style.id}
                  onClick={() => { selectStyle(style); setShowStyleOptions(false); }}
                  className="relative p-2 group"
                  style={selectedStyle?.id === style.id ? {
                    ...win95BtnActive,
                    background: '#d0e8d0',
                    boxShadow: `inset 2px 2px 0 ${WIN95.border.darker}, inset -1px -1px 0 ${WIN95.border.light}, 0 0 0 2px #008080`
                  } : win95Btn}
                >
                  <div className="text-center">
                    <div className="text-lg mb-1 group-hover:scale-110 transition-transform">{style.emoji}</div>
                    <div className="text-[10px] font-bold leading-tight" style={{ color: WIN95.text }}>{style.name}</div>
                    <div className="text-[8px] leading-tight mt-0.5" style={{ color: WIN95.textDisabled }}>{style.category}</div>
                  </div>
                  {selectedStyle?.id === style.id && (
                    <div className="absolute top-1 right-1 text-[10px]">✓</div>
                  )}
                </button>
              ))}
            </div>

            {filteredStyles.length === 0 && (
              <div className="text-center py-6">
                <div className="text-2xl mb-2">🔍</div>
                <div className="text-[11px] font-semibold" style={{ color: WIN95.text }}>No styles found</div>
                <div className="text-[10px]" style={{ color: WIN95.textDisabled }}>Try adjusting your search</div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

export default StyleSelector;
