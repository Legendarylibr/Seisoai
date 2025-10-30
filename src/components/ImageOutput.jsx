import React, { useState } from 'react';
import { useImageGenerator } from '../contexts/ImageGeneratorContext';
import { useSimpleWallet } from '../contexts/SimpleWalletContext';
import { generateImage } from '../services/smartImageService';
import GenerateButton from './GenerateButton';
import { X } from 'lucide-react';

const ImageOutput = () => {
  const { 
    generatedImage, 
    isGenerating, 
    error, 
    clearGeneration, 
    clearAll,
    currentGeneration,
    setCurrentGeneration,
    setGenerating,
    setGeneratedImage,
    setError,
    selectedStyle,
    guidanceScale,
    imageSize,
    numImages,
    enableSafetyChecker,
    generationMode,
    controlNetImage
  } = useImageGenerator();

  const { isConnected, address, credits, isNFTHolder } = useSimpleWallet();
  
  const [isDownloading, setIsDownloading] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [showPromptModal, setShowPromptModal] = useState(false);
  const [newPrompt, setNewPrompt] = useState('');

  const handleDownload = async () => {
    if (!generatedImage || isDownloading) return;
    
    setIsDownloading(true);
    
    try {
      const getNextSeisoFilename = () => {
        try {
          const key = 'seiso_download_index';
          const current = parseInt(localStorage.getItem(key) || '0', 10) || 0;
          const next = current + 1;
          localStorage.setItem(key, String(next));
          return `seiso${next}.png`;
        } catch (_) {
          return `seiso${Date.now()}.png`;
        }
      };
      const filename = getNextSeisoFilename();

      // Fetch the image as a blob to handle CORS issues
      const response = await fetch(generatedImage);
      const blob = await response.blob();
      
      // Create a blob URL
      const blobUrl = window.URL.createObjectURL(blob);
      
      // Detect iOS
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
      
      if (isIOS) {
        // iOS Safari requires opening in new tab for download
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = filename;
        // Add to DOM temporarily (required for iOS)
        link.style.display = 'none';
        document.body.appendChild(link);
        
        // Trigger download
        const clickEvent = new MouseEvent('click', {
          view: window,
          bubbles: true,
          cancelable: true
        });
        link.dispatchEvent(clickEvent);
        
        // Cleanup after a delay for iOS
        setTimeout(() => {
          document.body.removeChild(link);
          window.URL.revokeObjectURL(blobUrl);
        }, 100);
      } else {
        // Standard download for other browsers
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);
      }
    } catch (error) {
      console.error('Download failed:', error);
      // Fallback to opening image in new tab for iOS
      const link = document.createElement('a');
      link.href = generatedImage;
      try {
        const key = 'seiso_download_index';
        const current = parseInt(localStorage.getItem(key) || '0', 10) || 0;
        const next = current + 1;
        localStorage.setItem(key, String(next));
        link.download = `seiso${next}.png`;
      } catch (_) {
        link.download = `seiso${Date.now()}.png`;
      }
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } finally {
      setIsDownloading(false);
    }
  };


  const handleRegenerate = async () => {
    if (!currentGeneration || isRegenerating || !isConnected) return;
    
    setIsRegenerating(true);
    setError(null);
    
    try {
      setGenerating(true);
      
      // Use the same parameters as the current generation
      const advancedSettings = {
        guidanceScale: currentGeneration.guidanceScale || guidanceScale,
        imageSize: currentGeneration.imageSize || imageSize,
        numImages: currentGeneration.numImages || numImages,
        enableSafetyChecker: currentGeneration.enableSafetyChecker || enableSafetyChecker,
        generationMode: currentGeneration.generationMode || generationMode,
        isNFTHolder: isNFTHolder || false
      };
      
      const result = await generateImage(
        currentGeneration.style,
        currentGeneration.prompt || '',
        advancedSettings,
        currentGeneration.referenceImage
      );
      
      setGeneratedImage(result);
      
      // Update current generation with new details
      setCurrentGeneration({
        ...currentGeneration,
        image: result,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('Regeneration failed:', error);
      setError(error.message || 'Failed to regenerate image. Please try again.');
    } finally {
      setIsRegenerating(false);
      setGenerating(false);
    }
  };

  const handleRegenerateWithPrompt = async () => {
    if (!currentGeneration || isRegenerating || !isConnected || !newPrompt.trim()) return;
    
    setIsRegenerating(true);
    setError(null);
    setShowPromptModal(false);
    
    try {
      setGenerating(true);
      
      // Use the generated image as the reference image for the new generation
      const advancedSettings = {
        guidanceScale: currentGeneration.guidanceScale || guidanceScale,
        imageSize: currentGeneration.imageSize || imageSize,
        numImages: currentGeneration.numImages || numImages,
        enableSafetyChecker: currentGeneration.enableSafetyChecker || enableSafetyChecker,
        generationMode: currentGeneration.generationMode || generationMode,
        isNFTHolder: isNFTHolder || false
      };
      
      const result = await generateImage(
        currentGeneration.style,
        newPrompt.trim(),
        advancedSettings,
        generatedImage // Use current output as reference image
      );
      
      setGeneratedImage(result);
      
      // Update current generation with new details
      setCurrentGeneration({
        ...currentGeneration,
        image: result,
        prompt: newPrompt.trim(),
        referenceImage: generatedImage, // Previous output becomes new input
        timestamp: new Date().toISOString()
      });
      
      setNewPrompt(''); // Clear the prompt
      
    } catch (error) {
      console.error('Regeneration with prompt failed:', error);
      setError(error.message || 'Failed to regenerate image. Please try again.');
    } finally {
      setIsRegenerating(false);
      setGenerating(false);
    }
  };


  if (isGenerating) {
    return (
      <div className="h-full flex flex-col items-center justify-center">
        <div className="animate-spin w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full mb-6"></div>
        <p className="text-lg text-gray-300 mb-2">Creating your masterpiece...</p>
        <p className="text-sm text-gray-500">This may take a few moments</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 text-red-400 text-4xl mb-4">❌</div>
          <h4 className="text-lg font-semibold text-red-400 mb-2">Something went wrong</h4>
          <p className="text-gray-300 mb-6 max-w-sm">{error}</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={clearGeneration}
              className="btn-secondary px-4 py-2"
            >
              Try Again
            </button>
            <button
              onClick={clearAll}
              className="btn-secondary px-4 py-2"
            >
              Start Over
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!generatedImage) {
    return (
      <div className="h-full flex flex-col items-center justify-center">
        <div className="w-24 h-24 mx-auto mb-6 opacity-50">
          <svg viewBox="0 0 24 24" fill="none" className="w-full h-full text-gray-400">
            <path
              d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"
              fill="currentColor"
            />
          </svg>
        </div>
        <p className="text-lg text-gray-400 mb-2">Your generated image will appear here</p>
        <p className="text-sm text-gray-500">Select a style and click generate to create your image</p>
      </div>
    );
  }

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 className="text-base sm:text-lg md:text-xl font-semibold gradient-text">Generated Image</h3>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={handleDownload}
            disabled={isDownloading}
            className="btn-secondary flex items-center gap-1 sm:gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-xs sm:text-sm px-2 sm:px-4 py-2"
          >
            <span className="text-base">{isDownloading ? '⏳' : '💾'}</span>
            <span className="hidden sm:inline">{isDownloading ? 'Downloading...' : 'Download'}</span>
          </button>
          <button
            onClick={handleRegenerate}
            disabled={isRegenerating || !isConnected || !currentGeneration}
            className="btn-secondary flex items-center gap-1 sm:gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-xs sm:text-sm px-2 sm:px-4 py-2"
          >
            <span className="text-base">{isRegenerating ? '⏳' : '🔄'}</span>
            <span className="hidden sm:inline">{isRegenerating ? 'Regenerating...' : 'Regenerate'}</span>
          </button>
          <button
            onClick={clearGeneration}
            className="btn-secondary flex items-center gap-2 text-xs sm:text-sm px-2 sm:px-4 py-2"
          >
            <span className="text-base">🗑️</span>
            <span className="hidden sm:inline">Clear</span>
          </button>
        </div>
      </div>
      
      <div className="glass-effect rounded-xl overflow-hidden mb-4">
        <img
          src={generatedImage}
          alt="Generated AI image"
          className="w-full h-auto max-h-[300px] sm:max-h-96 md:max-h-[600px] lg:max-h-[700px] object-contain"
          style={{ maxWidth: '100%', height: 'auto' }}
        />
      </div>

      {/* Generate Button Section */}
      <div className="mb-4">
        <div className="glass-effect rounded-lg p-4">
          <h4 className="text-sm md:text-base font-semibold text-gray-300 mb-3">Quick Actions</h4>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setShowPromptModal(true)}
              disabled={isRegenerating || !isConnected || !currentGeneration}
              className="btn-primary flex items-center gap-2 text-sm px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="text-lg">✨</span>
              New Prompt
            </button>
          </div>
        </div>
      </div>

      {/* Generate Button Section */}
      <div className="glass-effect rounded-lg p-6">
        <div className="text-center mb-4">
          <div className="flex items-center justify-center gap-3 mb-3">
            <div className="w-8 h-8 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center">
              <span className="text-lg">✨</span>
            </div>
            <h4 className="text-xl font-bold text-white">Create New Image</h4>
          </div>
          <p className="text-gray-400">Ready to generate your next masterpiece?</p>
        </div>
        
        <div className="mb-4">
          <GenerateButton />
        </div>
        
        <div className="text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 rounded-full border border-white/10">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
            <span className="text-sm text-gray-400">⏱️ Takes 10-30 seconds</span>
          </div>
        </div>
      </div>

      {/* Prompt Modal for New Prompt Regeneration */}
      {showPromptModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="glass-effect rounded-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-white mb-4">New Prompt Regeneration</h3>
            <p className="text-gray-300 text-sm mb-4">
              Enter a new prompt to regenerate the image. The current output will be used as the reference image.
            </p>
            <textarea
              value={newPrompt}
              onChange={(e) => setNewPrompt(e.target.value)}
              placeholder="Enter your new prompt here..."
              className="w-full h-24 px-3 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
            />
            <div className="flex gap-3 mt-4">
              <button
                onClick={handleRegenerateWithPrompt}
                disabled={!newPrompt.trim() || isRegenerating}
                className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isRegenerating ? 'Generating...' : 'Generate with New Prompt'}
              </button>
              <button
                onClick={() => {
                  setShowPromptModal(false);
                  setNewPrompt('');
                }}
                className="btn-secondary px-4"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default ImageOutput;
