import React, { useState, useCallback, useRef, useEffect, memo } from 'react';
import { 
  MessageCircle, Send, X, Minimize2, Maximize2, 
  Sparkles, Lightbulb, Check, Copy, ChevronDown
} from 'lucide-react';
import { WIN95, BTN, PANEL } from '../utils/buttonStyles';
import { sendCoworkMessage, getCoworkSuggestions, type ChatMessage, type CoworkContext } from '../services/coworkService';

interface ClaudeCoworkProps {
  /** Current mode (image, video, music, 3d) */
  mode?: 'image' | 'video' | 'music' | '3d';
  /** Current prompt in the main input */
  currentPrompt?: string;
  /** Selected style */
  selectedStyle?: string;
  /** Selected model */
  selectedModel?: string;
  /** Callback when user wants to apply a suggested prompt */
  onApplyPrompt?: (prompt: string) => void;
  /** Whether the panel is initially open */
  defaultOpen?: boolean;
}

/**
 * ClaudeCowork - AI prompt planning assistant
 * Helps users brainstorm and refine their prompts through conversation
 * Does NOT access any user files - only works with in-app context
 */
const ClaudeCowork: React.FC<ClaudeCoworkProps> = memo(({
  mode = 'image',
  currentPrompt = '',
  selectedStyle,
  selectedModel,
  onApplyPrompt,
  defaultOpen = false
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [isMinimized, setIsMinimized] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [copiedPrompt, setCopiedPrompt] = useState<string | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load suggestions when mode changes
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      getCoworkSuggestions(mode).then(setSuggestions);
    }
  }, [isOpen, mode, messages.length]);

  // Focus input when opened
  useEffect(() => {
    if (isOpen && !isMinimized) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen, isMinimized]);

  const handleSend = useCallback(async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage: ChatMessage = {
      role: 'user',
      content: inputValue.trim(),
      timestamp: new Date().toISOString()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);
    setSuggestions([]);

    // Build context from current app state
    const context: CoworkContext = {
      mode,
      currentPrompt: currentPrompt || undefined,
      selectedStyle: selectedStyle || undefined,
      selectedModel: selectedModel || undefined
    };

    const response = await sendCoworkMessage(
      userMessage.content,
      messages,
      context
    );

    if (response.success && response.response) {
      const assistantMessage: ChatMessage = {
        role: 'assistant',
        content: response.response,
        timestamp: response.timestamp,
        action: response.action
      };
      setMessages(prev => [...prev, assistantMessage]);
    } else {
      // Show error as assistant message
      const errorMessage: ChatMessage = {
        role: 'assistant',
        content: response.error || 'Sorry, I had trouble responding. Please try again.',
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, errorMessage]);
    }

    setIsLoading(false);
  }, [inputValue, isLoading, messages, mode, currentPrompt, selectedStyle, selectedModel]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }, [handleSend]);

  const handleSuggestionClick = useCallback((suggestion: string) => {
    setInputValue(suggestion);
    inputRef.current?.focus();
  }, []);

  const handleApplyPrompt = useCallback((prompt: string) => {
    onApplyPrompt?.(prompt);
    setCopiedPrompt(prompt);
    setTimeout(() => setCopiedPrompt(null), 2000);
  }, [onApplyPrompt]);

  const handleCopyPrompt = useCallback((prompt: string) => {
    navigator.clipboard.writeText(prompt);
    setCopiedPrompt(prompt);
    setTimeout(() => setCopiedPrompt(null), 2000);
  }, []);

  const clearChat = useCallback(() => {
    setMessages([]);
    getCoworkSuggestions(mode).then(setSuggestions);
  }, [mode]);

  // Floating button when closed
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-20 right-4 z-50 flex items-center gap-2 px-3 py-2 text-[11px] font-bold transition-transform hover:scale-105"
        style={{
          ...BTN.base,
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          color: '#fff',
          boxShadow: '2px 2px 8px rgba(0,0,0,0.3), inset 1px 1px 0 rgba(255,255,255,0.3)'
        }}
        title="Open Claude Cowork - AI prompt planning assistant"
      >
        <Sparkles className="w-4 h-4" />
        <span>Cowork</span>
      </button>
    );
  }

  // Minimized state
  if (isMinimized) {
    return (
      <div
        className="fixed bottom-20 right-4 z-50 flex items-center gap-2 px-3 py-1.5 cursor-pointer"
        onClick={() => setIsMinimized(false)}
        style={{
          background: 'linear-gradient(90deg, #000080 0%, #1084d0 100%)',
          boxShadow: '2px 2px 8px rgba(0,0,0,0.3)'
        }}
      >
        <Sparkles className="w-3.5 h-3.5 text-white" />
        <span className="text-[11px] font-bold text-white" style={{ fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
          Claude Cowork
        </span>
        <Maximize2 className="w-3 h-3 text-white/70 ml-2" />
      </div>
    );
  }

  return (
    <div
      className="fixed bottom-20 right-4 z-50 w-80 sm:w-96 flex flex-col"
      style={{
        ...PANEL.window,
        maxHeight: 'calc(100vh - 120px)',
        boxShadow: '4px 4px 12px rgba(0,0,0,0.4)'
      }}
    >
      {/* Title bar */}
      <div 
        className="flex items-center gap-2 px-2 py-1 cursor-move select-none"
        style={{ 
          background: 'linear-gradient(90deg, #000080 0%, #1084d0 100%)',
          color: '#ffffff'
        }}
      >
        <Sparkles className="w-3.5 h-3.5" />
        <span 
          className="text-[11px] font-bold flex-1" 
          style={{ fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}
        >
          Claude Cowork
        </span>
        <div className="flex gap-0.5">
          <button
            onClick={() => setIsMinimized(true)}
            className="w-4 h-4 flex items-center justify-center hover:bg-white/20"
            style={{ ...BTN.small, padding: 0, background: 'transparent' }}
          >
            <Minimize2 className="w-2.5 h-2.5 text-white" />
          </button>
          <button
            onClick={() => setIsOpen(false)}
            className="w-4 h-4 flex items-center justify-center hover:bg-red-500"
            style={{ ...BTN.small, padding: 0, background: 'transparent' }}
          >
            <X className="w-2.5 h-2.5 text-white" />
          </button>
        </div>
      </div>

      {/* Status bar showing context */}
      <div 
        className="flex items-center gap-2 px-2 py-1 text-[9px] border-b"
        style={{ 
          background: WIN95.bgLight, 
          color: WIN95.textDisabled,
          borderColor: WIN95.border.dark,
          fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
        }}
      >
        <span>Mode: {mode}</span>
        {selectedStyle && <span>• Style: {selectedStyle}</span>}
        {currentPrompt && (
          <span className="truncate flex-1" title={currentPrompt}>
            • Prompt: {currentPrompt.slice(0, 20)}...
          </span>
        )}
      </div>

      {/* Messages area */}
      <div 
        className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[200px] max-h-[300px]"
        style={{ ...PANEL.sunken }}
      >
        {messages.length === 0 ? (
          <div className="text-center py-4">
            <MessageCircle className="w-8 h-8 mx-auto mb-2" style={{ color: WIN95.textDisabled }} />
            <p className="text-[11px] font-bold mb-1" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
              Hi! I'm here to help you plan your prompts.
            </p>
            <p className="text-[10px] mb-3" style={{ color: WIN95.textDisabled, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
              Tell me what you want to create, and I'll help you craft the perfect prompt.
            </p>
            
            {/* Starter suggestions */}
            {suggestions.length > 0 && (
              <div className="space-y-1">
                <p className="text-[9px] font-bold" style={{ color: WIN95.textDisabled }}>
                  Try asking:
                </p>
                {suggestions.map((suggestion, i) => (
                  <button
                    key={i}
                    onClick={() => handleSuggestionClick(suggestion)}
                    className="block w-full text-left px-2 py-1 text-[10px] hover:bg-[#000080] hover:text-white transition-colors"
                    style={{ 
                      color: WIN95.highlight,
                      fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
                    }}
                  >
                    <Lightbulb className="w-3 h-3 inline mr-1" />
                    {suggestion}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className="max-w-[85%] px-2 py-1.5 text-[11px]"
                  style={{
                    background: msg.role === 'user' ? WIN95.highlight : WIN95.bg,
                    color: msg.role === 'user' ? WIN95.highlightText : WIN95.text,
                    boxShadow: msg.role === 'user' 
                      ? `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}`
                      : `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.dark}`,
                    fontFamily: 'Tahoma, "MS Sans Serif", sans-serif',
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word'
                  }}
                >
                  {msg.content}
                  
                  {/* Action button for suggested prompts */}
                  {msg.action?.type === 'suggest_prompt' && msg.action.value && (
                    <div className="mt-2 pt-2 border-t border-current/20 flex gap-1">
                      <button
                        onClick={() => handleApplyPrompt(msg.action!.value!)}
                        className="flex items-center gap-1 px-2 py-0.5 text-[9px]"
                        style={{ ...BTN.base }}
                        disabled={copiedPrompt === msg.action.value}
                      >
                        {copiedPrompt === msg.action.value ? (
                          <><Check className="w-3 h-3" /> Applied!</>
                        ) : (
                          <><Sparkles className="w-3 h-3" /> Use this</>
                        )}
                      </button>
                      <button
                        onClick={() => handleCopyPrompt(msg.action!.value!)}
                        className="flex items-center gap-1 px-2 py-0.5 text-[9px]"
                        style={{ ...BTN.base }}
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
            
            {isLoading && (
              <div className="flex justify-start">
                <div
                  className="px-2 py-1.5 text-[11px]"
                  style={{
                    background: WIN95.bg,
                    color: WIN95.textDisabled,
                    boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.dark}`,
                    fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
                  }}
                >
                  <span className="animate-pulse">Thinking...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input area */}
      <div className="p-2 border-t" style={{ borderColor: WIN95.border.dark }}>
        <div className="flex gap-1">
          <input
            ref={inputRef}
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask me anything about your prompt..."
            disabled={isLoading}
            className="flex-1 px-2 py-1 text-[11px] focus:outline-none"
            style={{
              ...PANEL.sunken,
              color: WIN95.text,
              fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
            }}
          />
          <button
            onClick={handleSend}
            disabled={!inputValue.trim() || isLoading}
            className="px-2 py-1 flex items-center"
            style={{
              ...BTN.base,
              opacity: (!inputValue.trim() || isLoading) ? 0.5 : 1
            }}
          >
            <Send className="w-3.5 h-3.5" style={{ color: WIN95.text }} />
          </button>
        </div>
        
        {/* Quick actions */}
        <div className="flex items-center gap-2 mt-1.5">
          <button
            onClick={clearChat}
            className="text-[9px] px-1.5 py-0.5 hover:underline"
            style={{ color: WIN95.textDisabled, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}
          >
            Clear chat
          </button>
          <span className="text-[9px]" style={{ color: WIN95.textDisabled }}>•</span>
          <span className="text-[9px]" style={{ color: WIN95.textDisabled, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
            Powered by Claude
          </span>
        </div>
      </div>
    </div>
  );
});

ClaudeCowork.displayName = 'ClaudeCowork';

export default ClaudeCowork;
