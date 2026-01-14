import React, { useState, memo, useMemo, useRef, useEffect } from 'react';
import { useImageGenerator } from '../contexts/ImageGeneratorContext';
import { VISUAL_STYLES } from '../utils/styles';
import { Search, ChevronDown, ChevronUp, Palette, X, Brush } from 'lucide-react';
import { WIN95, BTN } from '../utils/buttonStyles';

// PERFORMANCE: Pre-compute categories once
const CATEGORIES = ['All', ...new Set(VISUAL_STYLES.map(s => s.category))];

const StyleSelector = memo(() => {
  const { selectedStyle, selectStyle } = useImageGenerator();
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [showStyleOptions, setShowStyleOptions] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
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

  const win95Btn: React.CSSProperties = {
    background: WIN95.buttonFace,
    border: 'none',
    boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}, inset 2px 2px 0 ${WIN95.bgLight}, inset -2px -2px 0 ${WIN95.bgDark}`,
    color: WIN95.text,
    fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
  };

  const win95BtnActive: React.CSSProperties = {
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
        fontFamily: 'Tahoma, "MS Sans Serif", sans-serif',
        boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}, inset 2px 2px 0 ${WIN95.bgLight}, inset -2px -2px 0 ${WIN95.bgDark}, 2px 2px 0 rgba(0,0,0,0.15)`
      }}
    >
      {/* Title bar */}
      <div 
        className="flex items-center gap-1.5 px-2 py-1"
        style={{ 
          background: WIN95.activeTitle,
          color: '#ffffff'
        }}
      >
        <Brush className="w-3.5 h-3.5" />
        <span className="text-[11px] font-bold">Visual Style</span>
        {selectedStyle && (
          <span className="text-[9px] opacity-80 ml-1">— {selectedStyle.name}</span>
        )}
      </div>
      
      {/* Toggle Button - Shows current selection */}
      <button
        onClick={() => setShowStyleOptions(!showStyleOptions)}
        className="w-full flex items-center justify-between gap-2 py-2 px-3 text-[11px]"
        style={{
          background: WIN95.inputBg,
          boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}, inset 2px 2px 0 ${WIN95.bgDark}`,
          color: WIN95.text,
          margin: '4px',
          width: 'calc(100% - 8px)'
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          {selectedStyle ? (
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-base">{selectedStyle.emoji}</span>
              <span className="font-bold truncate">{selectedStyle.name}</span>
              <span 
                className="text-[9px] px-1.5 py-0.5" 
                style={{ 
                  background: WIN95.bg, 
                  color: WIN95.text,
                  boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`
                }}
              >
                {selectedStyle.category}
              </span>
            </div>
          ) : (
            <span style={{ color: WIN95.textDisabled }}>Click to select a style (optional)</span>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {selectedStyle && (
            <button
              onClick={(e) => { e.stopPropagation(); selectStyle(null); }}
              className="p-1"
              style={BTN.base}
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
          className="absolute left-0 right-0 top-full mt-1 z-50"
          style={{
            background: WIN95.bg,
            boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}, inset 2px 2px 0 ${WIN95.bgLight}, inset -2px -2px 0 ${WIN95.bgDark}, 4px 4px 0 rgba(0,0,0,0.3)`,
          }}
        >
          {/* Dropdown title bar */}
          <div 
            className="flex items-center gap-1.5 px-2 py-1"
            style={{ 
              background: WIN95.activeTitle,
              color: '#ffffff'
            }}
          >
            <Palette className="w-3 h-3" />
            <span className="text-[10px] font-bold">Select Visual Style</span>
            <div className="flex-1" />
            <button 
              onClick={() => setShowStyleOptions(false)}
              className="w-4 h-3.5 flex items-center justify-center text-[9px] font-bold"
              style={{
                background: WIN95.buttonFace,
                boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}`,
                color: WIN95.text
              }}
            >
              ✕
            </button>
          </div>
          
          <div className="p-2 space-y-2">
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
                  boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}, inset 2px 2px 0 ${WIN95.bgDark}`,
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
                  className="px-2 py-1 text-[10px] font-bold"
                  style={selectedCategory === category ? {
                    ...win95BtnActive,
                    background: WIN95.highlight,
                    color: WIN95.highlightText
                  } : win95Btn}
                >
                  {category}
                </button>
              ))}
            </div>

            {/* Styles Grid */}
            <div 
              className="overflow-y-auto max-h-64 p-1"
              style={{
                background: WIN95.inputBg,
                boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}, inset 2px 2px 0 ${WIN95.bgDark}`
              }}
            >
              <div className="grid grid-cols-3 lg:grid-cols-4 gap-1">
                {filteredStyles.map(style => (
                  <button
                    key={style.id}
                    onClick={() => { selectStyle(style); setShowStyleOptions(false); }}
                    className="relative p-2 group"
                    style={selectedStyle?.id === style.id ? {
                      background: WIN95.highlight,
                      color: WIN95.highlightText,
                      boxShadow: 'none'
                    } : {
                      background: WIN95.inputBg,
                      color: WIN95.text
                    }}
                    onMouseEnter={(e) => {
                      if (selectedStyle?.id !== style.id) {
                        e.currentTarget.style.background = WIN95.highlight;
                        e.currentTarget.style.color = WIN95.highlightText;
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (selectedStyle?.id !== style.id) {
                        e.currentTarget.style.background = WIN95.inputBg;
                        e.currentTarget.style.color = WIN95.text;
                      }
                    }}
                  >
                    <div className="text-center">
                      <div className="text-lg mb-0.5">{style.emoji}</div>
                      <div className="text-[10px] font-bold leading-tight truncate">{style.name}</div>
                      <div className="text-[8px] leading-tight mt-0.5 opacity-70">{style.category}</div>
                    </div>
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
          
          {/* Status bar */}
          <div 
            className="px-2 py-1 text-[9px]"
            style={{ 
              background: WIN95.bg,
              borderTop: `1px solid ${WIN95.border.light}`,
              color: WIN95.textDisabled
            }}
          >
            {filteredStyles.length} styles available
          </div>
        </div>
      )}
    </div>
  );
});

export default StyleSelector;

