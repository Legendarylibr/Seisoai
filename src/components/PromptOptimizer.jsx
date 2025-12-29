import React, { useState } from 'react';
import { useImageGenerator } from '../contexts/ImageGeneratorContext';
import { Brain, Sparkles, ChevronDown, ChevronUp, Lightbulb } from 'lucide-react';

/**
 * PromptOptimizer Component
 * Displays a toggle to enable/disable LLM-based prompt optimization
 * and shows the optimization result (original vs optimized prompt + reasoning)
 */
const PromptOptimizer = () => {
  const { 
    optimizePrompt, 
    setOptimizePrompt, 
    promptOptimizationResult,
    multiImageModel
  } = useImageGenerator();
  
  const [showDetails, setShowDetails] = useState(false);

  // Don't show for layer extraction mode
  if (multiImageModel === 'qwen-image-layered') {
    return null;
  }

  const hasOptimizationResult = promptOptimizationResult && promptOptimizationResult.optimizedPrompt;

  return (
    <div className="space-y-2 p-2 rounded" style={{ 
      background: 'linear-gradient(to bottom, #ffffff, #f5f5f5)',
      border: '2px outset #e8e8e8',
      boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.25), 0 4px 8px rgba(0, 0, 0, 0.2)'
    }}>
      {/* Toggle Header */}
      <label className="flex items-center justify-between cursor-pointer group">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4" style={{ 
            color: optimizePrompt ? '#8b5cf6' : '#000000', 
            filter: 'drop-shadow(1px 1px 1px rgba(0, 0, 0, 0.2))',
            transition: 'color 0.2s'
          }} />
          <span className="text-xs font-semibold" style={{ 
            color: '#000000', 
            textShadow: '1px 1px 0 rgba(255, 255, 255, 0.8)' 
          }}>
            AI Prompt Reasoning
          </span>
          <span className="text-[10px] px-1.5 py-0.5 rounded" style={{
            background: optimizePrompt 
              ? 'linear-gradient(to bottom, #8b5cf6, #7c3aed)' 
              : 'linear-gradient(to bottom, #d0d0d0, #b0b0b0)',
            color: optimizePrompt ? '#ffffff' : '#4a4a4a',
            border: '1px solid',
            borderColor: optimizePrompt ? '#6d28d9' : '#a0a0a0',
            transition: 'all 0.2s'
          }}>
            {optimizePrompt ? 'ON' : 'OFF'}
          </span>
        </div>
        
        {/* Toggle Switch */}
        <div 
          onClick={() => setOptimizePrompt(!optimizePrompt)}
          className="relative w-10 h-5 rounded-full transition-all duration-200 cursor-pointer"
          style={{
            background: optimizePrompt 
              ? 'linear-gradient(to bottom, #8b5cf6, #7c3aed)'
              : 'linear-gradient(to bottom, #d0d0d0, #b0b0b0)',
            border: '2px inset',
            borderColor: optimizePrompt ? '#6d28d9' : '#a0a0a0',
            boxShadow: 'inset 2px 2px 0 rgba(0, 0, 0, 0.2)'
          }}
        >
          <div 
            className="absolute w-4 h-4 rounded-full top-0.5 transition-all duration-200"
            style={{
              left: optimizePrompt ? 'calc(100% - 18px)' : '2px',
              background: 'linear-gradient(to bottom, #ffffff, #e0e0e0)',
              border: '1px outset #f0f0f0',
              boxShadow: '1px 1px 2px rgba(0, 0, 0, 0.3)'
            }}
          />
        </div>
      </label>

      {/* Description */}
      <p className="text-[10px] leading-relaxed" style={{ 
        color: '#4a4a4a', 
        textShadow: '1px 1px 0 rgba(255, 255, 255, 0.6)' 
      }}>
        {optimizePrompt 
          ? '✨ AI intelligently enhances your prompt: adds helpful details when needed, clarifies vague prompts, and optimizes for better image quality'
          : '⚡ Using your prompt as-is without AI enhancement'}
      </p>

      {/* Optimization Result Display */}
      {hasOptimizationResult && optimizePrompt && (
        <div className="pt-2 border-t" style={{ borderColor: '#d0d0d0' }}>
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="w-full flex items-center justify-between text-xs font-medium transition-colors hover:bg-white/50 rounded p-1"
            style={{ color: '#000000' }}
          >
            <div className="flex items-center gap-1.5">
              <Lightbulb className="w-3.5 h-3.5" style={{ color: '#f59e0b' }} />
              <span>View Prompt Enhancement</span>
            </div>
            {showDetails ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>

          {showDetails && (
            <div className="mt-2 space-y-2 animate-in slide-in-from-top duration-200">
              {/* Original Prompt */}
              <div className="p-2 rounded" style={{ 
                background: 'linear-gradient(to bottom, #f0f0f0, #e0e0e0)',
                border: '1px inset #d0d0d0'
              }}>
                <p className="text-[10px] font-medium mb-1" style={{ color: '#666' }}>
                  Original Prompt:
                </p>
                <p className="text-xs" style={{ color: '#333' }}>
                  "{promptOptimizationResult.originalPrompt}"
                </p>
              </div>

              {/* Optimized Prompt */}
              <div className="p-2 rounded" style={{ 
                background: 'linear-gradient(to bottom, #ede9fe, #ddd6fe)',
                border: '1px solid #c4b5fd'
              }}>
                <p className="text-[10px] font-medium mb-1" style={{ color: '#6d28d9' }}>
                  <Sparkles className="w-3 h-3 inline mr-1" />
                  AI-Enhanced Prompt:
                </p>
                <p className="text-xs" style={{ color: '#4c1d95' }}>
                  "{promptOptimizationResult.optimizedPrompt}"
                </p>
              </div>

              {/* Reasoning */}
              {promptOptimizationResult.reasoning && (
                <div className="p-2 rounded" style={{ 
                  background: 'linear-gradient(to bottom, #fef3c7, #fde68a)',
                  border: '1px solid #fbbf24'
                }}>
                  <p className="text-[10px] font-medium mb-1" style={{ color: '#92400e' }}>
                    <Brain className="w-3 h-3 inline mr-1" />
                    AI Reasoning:
                  </p>
                  <p className="text-xs italic" style={{ color: '#78350f' }}>
                    {promptOptimizationResult.reasoning}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PromptOptimizer;


