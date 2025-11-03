import React, { useState } from 'react';
import { useImageGenerator } from '../contexts/ImageGeneratorContext';
import { useSimpleWallet } from '../contexts/SimpleWalletContext';
import { generateImage } from '../services/smartImageService';
import { addGeneration } from '../services/galleryService';
import GenerateButton from './GenerateButton';
import { X, Sparkles } from 'lucide-react';
import logger from '../utils/logger.js';

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

  const { 
    isConnected, 
    address, 
    credits, 
    isNFTHolder,
    refreshCredits,
    setCreditsManually
  } = useSimpleWallet();
  
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
    // Check if wallet is connected
    if (!isConnected || !address) {
      setError('Please connect your wallet first');
      return;
    }

    // Check if user has credits
    const availableCredits = credits || 0;
    if (availableCredits <= 0) {
      setError('Insufficient credits. Please buy credits to generate.');
      return;
    }

    if (!currentGeneration || isRegenerating || !newPrompt.trim()) return;
    
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
        walletAddress: address, // Pass wallet address for safety logging
        isNFTHolder: isNFTHolder || false,
        referenceImageDimensions: currentGeneration.referenceImageDimensions
      };
      
      logger.info('Starting regeneration with new prompt');
      const result = await generateImage(
        currentGeneration.style,
        newPrompt.trim(),
        advancedSettings,
        generatedImage // Use current output as reference image
      );
      
      // Ensure we have a valid image URL
      if (!result || typeof result !== 'string') {
        throw new Error('No image URL returned from generation service');
      }

      logger.info('Regeneration with new prompt completed successfully', { hasImageUrl: !!result });
      
      // Save generation to backend and deduct credits IMMEDIATELY after image is returned
      console.log('💾 [AUTO] Saving generation and deducting credits automatically...', { 
        imageUrl: result?.substring(0, 50),
        currentCredits: credits 
      });
      
      let deductionResult = null;
      try {
        deductionResult = await addGeneration(address, {
          prompt: newPrompt.trim(),
          style: currentGeneration.style ? currentGeneration.style.name : 'No Style',
          imageUrl: result,
          creditsUsed: 1 // 1 credit per generation
        });
        console.log('✅ [AUTO] Generation saved and credits deducted:', {
          success: deductionResult.success,
          remainingCredits: deductionResult.remainingCredits,
          creditsDeducted: deductionResult.creditsDeducted
        });
        logger.info('Generation saved and credits deducted', { result: deductionResult, address });
        
        // Update UI immediately with the remaining credits from the response
        if (deductionResult.remainingCredits !== undefined && setCreditsManually) {
          console.log('📊 [AUTO] Updating UI credits immediately to:', deductionResult.remainingCredits);
          setCreditsManually(deductionResult.remainingCredits);
        }
        
        // Force immediate credit refresh to ensure UI is in sync with backend
        console.log('🔄 [AUTO] Refreshing credits from backend to verify...');
        if (refreshCredits && address) {
          await refreshCredits();
          console.log('✅ [AUTO] Credits refreshed in UI from backend');
          logger.info('Credits refreshed after generation', { address });
        } else {
          console.warn('⚠️ [AUTO] Cannot refresh credits - missing refreshCredits or address');
        }
      } catch (error) {
        console.error('Error saving generation:', error);
        logger.error('Error saving generation', { error: error.message, address, imageUrl: result });
        setError(`Image generated but failed to save to history. Credits not deducted. Error: ${error.message}`);
        // Still show the image even if saving failed
      }
      
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
      logger.error('Regeneration with prompt failed', { error: error.message });
      setError(error.message || 'Failed to regenerate image. Please try again.');
    } finally {
      setIsRegenerating(false);
      setGenerating(false);
    }
  };


  if (isGenerating) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8">
        <div className="glass-card p-8 rounded-2xl text-center slide-up">
          <div className="relative w-20 h-20 mx-auto mb-6">
            <div className="animate-spin w-full h-full border-4 border-purple-500/30 border-t-purple-500 rounded-full"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <Sparkles className="w-8 h-8 text-purple-400 animate-pulse" />
            </div>
          </div>
          <p className="text-xl text-white mb-2 font-semibold">Creating your masterpiece...</p>
          <p className="text-sm text-gray-400">This may take a few moments</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center p-8">
        <div className="glass-card p-8 rounded-2xl text-center max-w-md slide-up">
          <div className="w-20 h-20 mx-auto mb-6 flex items-center justify-center bg-red-500/20 rounded-full">
            <div className="text-4xl">❌</div>
          </div>
          <h4 className="text-xl font-semibold text-red-400 mb-3">Something went wrong</h4>
          <p className="text-gray-300 mb-6">{error}</p>
          <div className="flex gap-3 justify-center">
            <button
              onClick={clearGeneration}
              className="btn-secondary px-5 py-2.5"
            >
              Try Again
            </button>
            <button
              onClick={clearAll}
              className="btn-secondary px-5 py-2.5"
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
      <div className="h-full flex flex-col items-center justify-center p-8">
        <div className="glass-card p-12 rounded-2xl text-center max-w-md slide-up">
          <div className="w-28 h-28 mx-auto mb-6 opacity-60">
            <svg viewBox="0 0 24 24" fill="none" className="w-full h-full text-gray-400">
              <path
                d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"
                fill="currentColor"
              />
            </svg>
          </div>
          <p className="text-lg text-gray-300 mb-2 font-medium">Your generated image will appear here</p>
          <p className="text-sm text-gray-500">Select a style and click generate to create your image</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-4">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h3 className="text-lg sm:text-xl md:text-2xl font-semibold gradient-text">Generated Image</h3>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={handleDownload}
            disabled={isDownloading}
            className="btn-secondary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm px-4 py-2.5 hover:scale-105 transition-all duration-300"
          >
            <span className="text-lg">{isDownloading ? '⏳' : '💾'}</span>
            <span className="hidden sm:inline">{isDownloading ? 'Downloading...' : 'Download'}</span>
          </button>
          <button
            onClick={handleRegenerate}
            disabled={isRegenerating || !isConnected || !currentGeneration}
            className="btn-secondary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed text-sm px-4 py-2.5 hover:scale-105 transition-all duration-300"
          >
            <span className="text-lg">{isRegenerating ? '⏳' : '🔄'}</span>
            <span className="hidden sm:inline">{isRegenerating ? 'Regenerating...' : 'Regenerate'}</span>
          </button>
          <button
            onClick={clearGeneration}
            className="btn-secondary flex items-center gap-2 text-sm px-4 py-2.5 hover:scale-105 transition-all duration-300"
          >
            <span className="text-lg">🗑️</span>
            <span className="hidden sm:inline">Clear</span>
          </button>
        </div>
      </div>
      
      <div className="glass-card rounded-2xl overflow-hidden mb-4 p-2">
        <img
          src={generatedImage}
          alt="Generated AI image"
          className="w-full h-auto max-h-[300px] sm:max-h-96 md:max-h-[600px] lg:max-h-[700px] object-contain rounded-xl"
          style={{ maxWidth: '100%', height: 'auto' }}
        />
      </div>

      {/* Quick Actions */}
      <div className="glass-card rounded-xl p-4 mb-4">
        <h4 className="text-base md:text-lg font-semibold text-white mb-3 flex items-center gap-2">
          <span className="text-xl">✨</span>
          Quick Actions
        </h4>
        <div className="flex gap-3 flex-wrap">
          <button
            onClick={() => setShowPromptModal(true)}
            disabled={isRegenerating || !isConnected || !currentGeneration}
            className="btn-primary flex items-center gap-2 text-sm px-5 py-2.5 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Sparkles className="w-4 h-4" />
            New Prompt
          </button>
        </div>
      </div>

      {/* Generate New Image Section */}
      <div className="glass-card rounded-xl p-6 md:p-8">
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-3 mb-4">
            <div className="w-12 h-12 bg-gradient-to-r from-purple-500 to-pink-500 rounded-full flex items-center justify-center shadow-lg shadow-purple-500/30">
              <Sparkles className="w-6 h-6 text-white" />
            </div>
            <h4 className="text-2xl font-bold text-white">Create New Image</h4>
          </div>
          <p className="text-gray-400 text-base">Ready to generate your next masterpiece?</p>
        </div>
        
        <div className="mb-6">
          <GenerateButton />
        </div>
        
        <div className="text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2.5 bg-white/5 rounded-full border border-white/10">
            <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
            <span className="text-sm text-gray-400">⏱️ Takes 10-30 seconds</span>
          </div>
        </div>
      </div>

      {/* Prompt Modal for New Prompt Regeneration */}
      {showPromptModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass-card rounded-2xl p-6 md:p-8 max-w-md w-full mx-4 slide-up">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-500/20 rounded-lg">
                  <Sparkles className="w-5 h-5 text-purple-400" />
                </div>
                <h3 className="text-xl font-semibold text-white">New Prompt Regeneration</h3>
              </div>
              <button
                onClick={() => {
                  setShowPromptModal(false);
                  setNewPrompt('');
                }}
                className="p-2 rounded-lg hover:bg-white/20 transition-all duration-300 hover:scale-110"
              >
                <X className="w-5 h-5 text-gray-400 hover:text-white" />
              </button>
            </div>
            <p className="text-gray-300 text-sm mb-4">
              Enter a new prompt to regenerate the image. The current output will be used as the reference image.
            </p>
            <textarea
              value={newPrompt}
              onChange={(e) => setNewPrompt(e.target.value)}
              placeholder="Enter your new prompt here..."
              className="w-full h-32 px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-transparent resize-none transition-all duration-300 focus:bg-white/8"
            />
            <div className="flex gap-3 mt-6">
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
                className="btn-secondary px-5"
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
