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
    <div className="p-1 rounded" style={{ 
      background: 'linear-gradient(to bottom, #ffffff, #f5f5f5)',
      border: '2px outset #e8e8e8',
      boxShadow: 'inset 2px 2px 0 rgba(255, 255, 255, 1), inset -2px -2px 0 rgba(0, 0, 0, 0.25)'
    }}>
      {/* Toggle Header */}
      <label 
        onClick={() => setOptimizePrompt(!optimizePrompt)}
        className="flex items-center gap-2 cursor-pointer"
      >
        <Brain className="w-4 h-4 flex-shrink-0" style={{ 
          color: optimizePrompt ? '#8b5cf6' : '#000000'
        }} />
        <div className="flex flex-col flex-1 min-w-0">
          <span className="text-[10px] font-bold" style={{ color: '#000000' }}>
            AI Prompts Optimization {optimizePrompt && '✨'}
          </span>
          <span className="text-[8px]" style={{ color: '#666666' }}>
            Enhance your prompts with AI
          </span>
        </div>
        {/* Toggle Switch */}
        <div 
          className="relative w-8 h-4 rounded-full transition-all cursor-pointer flex-shrink-0"
          style={{
            background: optimizePrompt ? '#8b5cf6' : '#d0d0d0',
            border: '1px inset'
          }}
        >
          <div 
            className="absolute w-3 h-3 rounded-full top-0.5 transition-all"
            style={{
              left: optimizePrompt ? 'calc(100% - 14px)' : '2px',
              background: '#ffffff'
            }}
          />
        </div>
      </label>

      {/* Optimization Result Display - collapsed by default */}
      {hasOptimizationResult && optimizePrompt && (
        <div className="pt-1 mt-1 border-t" style={{ borderColor: '#d0d0d0' }}>
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="w-full flex items-center justify-between text-[8px] font-medium p-0.5"
            style={{ color: '#000000' }}
          >
            <span className="flex items-center gap-0.5">
              <Lightbulb className="w-2.5 h-2.5" style={{ color: '#f59e0b' }} />
              View
            </span>
            {showDetails ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>

          {showDetails && (
            <div className="mt-1 space-y-1 text-[8px]">
              <div className="p-1 rounded" style={{ background: '#f0f0f0' }}>
                <p style={{ color: '#666' }}>Original: "{promptOptimizationResult.originalPrompt}"</p>
              </div>
              <div className="p-1 rounded" style={{ background: '#ede9fe' }}>
                <p style={{ color: '#4c1d95' }}>Enhanced: "{promptOptimizationResult.optimizedPrompt}"</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PromptOptimizer;


