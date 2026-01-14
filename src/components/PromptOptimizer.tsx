import React, { useCallback } from 'react';
import { useImageGenerator } from '../contexts/ImageGeneratorContext';
import { Brain, Wand2, Sparkles } from 'lucide-react';
import { WIN95 } from '../utils/buttonStyles';

interface PromptOptimizerProps {
  /** Current prompt value (controlled) */
  value?: string;
  /** Callback when prompt changes */
  onPromptChange?: (prompt: string) => void;
}

/**
 * PromptOptimizer Component
 * Provides prompt input field and toggle for LLM-based prompt optimization
 */
const PromptOptimizer: React.FC<PromptOptimizerProps> = ({ value = '', onPromptChange }) => {
  const { 
    optimizePrompt, 
    setOptimizePrompt, 
    multiImageModel
  } = useImageGenerator();
  
  // Use controlled value from parent when provided
  const prompt = value;

  const handlePromptChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newPrompt = e.target.value;
    onPromptChange?.(newPrompt);
  }, [onPromptChange]);

  // Don't show for layer extraction mode
  if (multiImageModel === 'qwen-image-layered') {
    return null;
  }

  // Check if using FLUX 2 for enhanced optimization messaging
  const isFlux2 = multiImageModel === 'flux-2';
  const enhanceLabel = isFlux2 ? 'FLUX 2 Optimize' : 'AI Enhance';
  const enhanceTooltip = isFlux2 
    ? 'Optimize prompt for precise FLUX 2 editing with action verbs and specific instructions'
    : 'Enhance your prompt with AI for better results';

  return (
    <div 
      className="relative"
      style={{ 
        background: WIN95.bg,
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
        <Wand2 className="w-3.5 h-3.5" />
        <span 
          className="text-[11px] font-bold" 
          style={{ fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}
        >
          {isFlux2 ? 'Edit Instructions' : 'Describe Your Image'}
        </span>
        <div className="flex-1" />
        <Sparkles className="w-3 h-3 opacity-70" />
      </div>
      
      {/* Content */}
      <div className="p-2 space-y-2">
        {/* Prompt Text Area */}
        <textarea
          value={prompt}
          onChange={handlePromptChange}
          placeholder={isFlux2 
            ? "Change the shirt to a blue flannel pattern, make the background a sunset beach..."
            : "A beautiful sunset over mountains, digital art style, vibrant colors..."
          }
          className="w-full h-24 p-2 resize-none text-[11px] focus:outline-none"
          style={{ 
            background: WIN95.inputBg,
            boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}, inset 2px 2px 0 ${WIN95.bgDark}`,
            border: 'none',
            color: WIN95.text,
            fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
          }}
        />
        
        {/* Character count and AI Enhancement Toggle */}
        <div className="flex justify-between items-center">
          <div 
            className="text-[9px] px-1.5 py-0.5"
            style={{ 
              color: WIN95.textDisabled, 
              fontFamily: 'Tahoma, "MS Sans Serif", sans-serif',
              background: WIN95.bg,
              boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`
            }}
          >
            {prompt.length} chars
          </div>
          
          {/* AI Enhance Checkbox - Win95 style */}
          <label 
            onClick={() => setOptimizePrompt(!optimizePrompt)}
            className="flex items-center gap-1.5 cursor-pointer select-none px-1 py-0.5 hover:bg-[#d0d0d0]"
            style={{ fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}
            title={enhanceTooltip}
          >
            {/* Win95 Checkbox */}
            <div 
              className="w-3.5 h-3.5 flex items-center justify-center"
              style={{
                background: WIN95.inputBg,
                boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}, inset 2px 2px 0 ${WIN95.bgDark}`
              }}
            >
              {optimizePrompt && (
                <span className="text-[10px] font-bold" style={{ color: WIN95.text }}>✓</span>
              )}
            </div>
            <Brain className="w-3 h-3" style={{ 
              color: optimizePrompt ? (isFlux2 ? '#0066cc' : '#800080') : WIN95.textDisabled
            }} />
            <span 
              className="text-[10px]" 
              style={{ color: WIN95.text }}
            >
              {enhanceLabel}
            </span>
          </label>
        </div>
      </div>
    </div>
  );
};

export default PromptOptimizer;

