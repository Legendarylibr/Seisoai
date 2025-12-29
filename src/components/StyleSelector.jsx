import React, { useState, memo, useMemo } from 'react';
import { useImageGenerator } from '../contexts/ImageGeneratorContext';
import { VISUAL_STYLES } from '../utils/styles';
import { Search, ChevronDown, ChevronUp, Palette } from 'lucide-react';
import { BTN, TEXT, hoverHandlers } from '../utils/buttonStyles';

// PERFORMANCE: Pre-compute categories once
const CATEGORIES = ['All', ...new Set(VISUAL_STYLES.map(s => s.category))];

const StyleSelector = memo(({ openUpward = false }) => {
  const { selectedStyle, selectStyle } = useImageGenerator();
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [showStyleOptions, setShowStyleOptions] = useState(false);

  // PERFORMANCE: Memoize filtered styles
  const filteredStyles = useMemo(() => VISUAL_STYLES.filter(style => {
    const matchesCategory = selectedCategory === 'All' || style.category === selectedCategory;
    const matchesSearch = style.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         style.description.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesCategory && matchesSearch;
  }), [selectedCategory, searchTerm]);

  return (
    <div className={`w-full space-y-2 relative rounded-lg p-2.5 ${openUpward ? 'lg:overflow-visible overflow-hidden' : 'overflow-hidden'}`} style={{ 
      background: 'linear-gradient(135deg, #ffffee 0%, #ffffdd 50%, #ffffc8 100%)',
      border: '2px outset #ffffcc',
      boxShadow: 'inset 2px 2px 0 rgba(255,255,255,0.9), inset -2px -2px 0 rgba(0,0,0,0.15)'
    }}>
      {/* Header */}
      <div className="flex items-center gap-2 mb-2 relative z-10">
        <div className="p-1.5 rounded" style={BTN.small}>
          <Palette className="w-4 h-4" style={{color:'#000'}} />
        </div>
        <div>
          <h3 className="text-xs font-bold" style={{...TEXT.primary, fontFamily:"'IBM Plex Mono', monospace"}}>Style (Optional)</h3>
          <p className="text-[10px]" style={{...TEXT.secondary, fontFamily:"'IBM Plex Mono', monospace"}}>
            {selectedStyle ? `✓ ${selectedStyle.name} applied` : 'Works with all models'}
          </p>
        </div>
      </div>

      {/* Selected Style Display */}
      {selectedStyle && (
        <div className="p-2 rounded mb-2" style={BTN.base}>
          <div className="flex items-center gap-2">
            <div className="text-lg">{selectedStyle.emoji}</div>
            <div className="flex-1">
              <h4 className="font-semibold text-xs" style={TEXT.primary}>{selectedStyle.name}</h4>
              <p className="text-xs" style={TEXT.secondary}>{selectedStyle.description}</p>
            </div>
            <button onClick={() => selectStyle(null)} className="p-1 rounded" style={BTN.small} title="Clear">✕</button>
          </div>
        </div>
      )}

      {/* Toggle Button */}
      <button
        onClick={() => setShowStyleOptions(!showStyleOptions)}
        className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded"
        style={selectedStyle ? BTN.active : BTN.base}
        {...(selectedStyle ? {} : hoverHandlers)}
      >
        <Palette className="w-4 h-4" style={{color:'#000'}} />
        <span className="text-xs font-medium">{selectedStyle ? 'Change Style' : 'Select Style (Optional)'}</span>
        {showStyleOptions ? <ChevronUp className="w-4 h-4" style={{color:'#000'}} /> : <ChevronDown className="w-4 h-4" style={{color:'#000'}} />}
      </button>

      {/* Style Options - Opens upward on desktop when openUpward is true */}
      {showStyleOptions && (
        <div 
          className={`space-y-2 ${openUpward ? 'lg:absolute lg:bottom-full lg:left-0 lg:right-0 lg:mb-1 lg:z-50' : ''}`}
          style={openUpward ? {
            background: 'linear-gradient(135deg, #ffffee 0%, #ffffdd 50%, #ffffc8 100%)',
            border: '2px outset #ffffcc',
            borderRadius: '8px',
            padding: '8px',
            boxShadow: '0 -4px 20px rgba(0,0,0,0.15)'
          } : {}}
        >
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 w-4 h-4" style={{color:'#000'}} />
            <input
              type="text"
              placeholder="Search styles..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-8 pr-3 py-2 rounded text-xs"
              style={{background:'#fff', border:'2px inset #c0c0c0', color:'#000'}}
            />
          </div>

          {/* Categories */}
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map(category => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className="px-2 py-1 rounded text-xs font-medium"
                style={selectedCategory === category ? BTN.active : BTN.base}
                {...(selectedCategory === category ? {} : hoverHandlers)}
              >
                {category}
              </button>
            ))}
          </div>

          {/* Styles Grid */}
          <div className={`overflow-y-auto ${openUpward ? 'max-h-48 lg:max-h-64' : 'max-h-60'}`}>
            <div className="grid grid-cols-3 gap-2">
              {filteredStyles.map(style => (
                <button
                  key={style.id}
                  onClick={() => { selectStyle(style); setShowStyleOptions(false); }}
                  className="relative p-2 rounded group"
                  style={selectedStyle?.id === style.id ? BTN.active : {...BTN.base, background:'linear-gradient(to bottom, #fff, #f5f5f5)'}}
                  {...(selectedStyle?.id === style.id ? {} : hoverHandlers)}
                >
                  <div className="text-center">
                    <div className="text-base mb-1 group-hover:scale-110 transition-transform">{style.emoji}</div>
                    <h3 className="font-bold text-xs mb-0.5" style={TEXT.primary}>{style.name}</h3>
                    <div className="text-xs" style={TEXT.secondary}>{style.category}</div>
                  </div>
                  {selectedStyle?.id === style.id && (
                    <div className="absolute top-1 right-1 w-2.5 h-2.5 rounded-full" style={{background:'linear-gradient(135deg,#00d4ff,#00b8e6)'}} />
                  )}
                </button>
              ))}
            </div>

            {filteredStyles.length === 0 && (
              <div className="text-center py-6">
                <div className="text-xl mb-2">🔍</div>
                <h3 className="text-xs font-semibold mb-1" style={TEXT.primary}>No styles found</h3>
                <p className="text-xs" style={TEXT.secondary}>Try adjusting your search</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});

export default StyleSelector;
