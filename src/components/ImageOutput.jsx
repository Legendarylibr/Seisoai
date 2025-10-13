import React, { useState } from 'react';
import { useImageGenerator } from '../contexts/ImageGeneratorContext';
import { useMultiWallet } from '../contexts/MultiWalletContext';
import { generateImage } from '../services/falService';
import GenerateButton from './GenerateButton';

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
    setControlNetImage,
    selectedStyle,
    guidanceScale,
    imageSize,
    numImages,
    enableSafetyChecker,
    generationMode,
    controlNetImage
  } = useImageGenerator();

  const { isConnected, address, credits, hasFreeAccess } = useMultiWallet();
  
  const [isDownloading, setIsDownloading] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isUpscaling, setIsUpscaling] = useState(false);
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [showPromptModal, setShowPromptModal] = useState(false);
  const [newPrompt, setNewPrompt] = useState('');

  const handleDownload = async () => {
    if (!generatedImage || isDownloading) return;
    
    setIsDownloading(true);
    
    try {
      // Fetch the image as a blob to handle CORS issues
      const response = await fetch(generatedImage);
      const blob = await response.blob();
      
      // Create a blob URL
      const blobUrl = window.URL.createObjectURL(blob);
      
      // Create download link
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `ai-generated-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      
      // Cleanup
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error('Download failed:', error);
      // Fallback to direct link method
      const link = document.createElement('a');
      link.href = generatedImage;
      link.download = `ai-generated-${Date.now()}.png`;
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
      const result = await generateImage({
        prompt: currentGeneration.prompt || '',
        style: currentGeneration.style,
        referenceImage: currentGeneration.referenceImage,
        guidanceScale: currentGeneration.guidanceScale || guidanceScale,
        imageSize: currentGeneration.imageSize || imageSize,
        numImages: currentGeneration.numImages || numImages,
        enableSafetyChecker: currentGeneration.enableSafetyChecker || enableSafetyChecker,
        generationMode: currentGeneration.generationMode || generationMode
      });
      
      setGeneratedImage(result.imageUrl);
      
      // Update current generation with new details
      setCurrentGeneration({
        ...currentGeneration,
        image: result.imageUrl,
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
      
      // Set the generated image as the controlNetImage in context for FLUX.1 Kontext
      setControlNetImage(generatedImage);
      
      // Use the generated image as the reference image for the new generation
      const result = await generateImage({
        prompt: newPrompt.trim(),
        style: currentGeneration.style,
        referenceImage: generatedImage, // Use current output as input
        guidanceScale: currentGeneration.guidanceScale || guidanceScale,
        imageSize: currentGeneration.imageSize || imageSize,
        numImages: currentGeneration.numImages || numImages,
        enableSafetyChecker: currentGeneration.enableSafetyChecker || enableSafetyChecker,
        generationMode: currentGeneration.generationMode || generationMode
      });
      
      setGeneratedImage(result.imageUrl);
      
      // Update current generation with new details
      setCurrentGeneration({
        ...currentGeneration,
        image: result.imageUrl,
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

  const handleUpscale = async () => {
    if (!generatedImage || isUpscaling || !isConnected) return;
    
    setIsUpscaling(true);
    setError(null);
    
    try {
      setGenerating(true);
      
      // For now, we'll simulate upscaling by regenerating with higher resolution
      // In a real implementation, you'd call an upscaling service
      const result = await generateImage({
        prompt: currentGeneration?.prompt || 'upscale this image',
        style: currentGeneration?.style,
        referenceImage: generatedImage,
        guidanceScale: (currentGeneration?.guidanceScale || 7.5) * 0.8, // Lower guidance for upscaling
        imageSize: 'square_hd', // Use highest quality
        numImages: 1,
        enableSafetyChecker: currentGeneration?.enableSafetyChecker || enableSafetyChecker,
        generationMode: 'flux-pro' // Use best quality model
      });
      
      setGeneratedImage(result.imageUrl);
      
      // Update current generation
      setCurrentGeneration({
        ...currentGeneration,
        image: result.imageUrl,
        imageSize: 'square_hd',
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('Upscaling failed:', error);
      setError(error.message || 'Failed to upscale image. Please try again.');
    } finally {
      setIsUpscaling(false);
      setGenerating(false);
    }
  };

  const handleGenerateVideo = async () => {
    if (!generatedImage || isGeneratingVideo || !isConnected) return;
    
    setIsGeneratingVideo(true);
    setError(null);
    
    try {
      setGenerating(true);
      
      // For now, we'll simulate video generation
      // In a real implementation, you'd call a video generation service
      await new Promise(resolve => setTimeout(resolve, 5000)); // Simulate video generation time
      
      // For demo purposes, we'll just show a message
      setError('Video generation is not yet implemented. This would create a video from your image.');
      
    } catch (error) {
      console.error('Video generation failed:', error);
      setError(error.message || 'Failed to generate video. Please try again.');
    } finally {
      setIsGeneratingVideo(false);
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
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold gradient-text">Generated Image</h3>
        <div className="flex gap-2">
          <button
            onClick={handleDownload}
            disabled={isDownloading}
            className="btn-secondary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="text-lg">{isDownloading ? '⏳' : '💾'}</span>
            {isDownloading ? 'Downloading...' : 'Download'}
          </button>
          <button
            onClick={handleRegenerate}
            disabled={isRegenerating || !isConnected || !currentGeneration}
            className="btn-secondary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="text-lg">{isRegenerating ? '⏳' : '🔄'}</span>
            {isRegenerating ? 'Regenerating...' : 'Regenerate'}
          </button>
          <button
            onClick={clearGeneration}
            className="btn-secondary flex items-center gap-2"
          >
            <span className="text-lg">🗑️</span>
            Clear
          </button>
        </div>
      </div>
      
      <div className="glass-effect rounded-xl overflow-hidden mb-4">
        <img
          src={generatedImage}
          alt="Generated AI image"
          className="w-full h-auto max-h-96 object-contain"
        />
      </div>

      {/* Generate Button Section */}
      <div className="mb-4">
        <div className="glass-effect rounded-lg p-4">
          <h4 className="text-md font-semibold text-gray-300 mb-3">Quick Actions</h4>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setShowPromptModal(true)}
              disabled={isRegenerating || !isConnected || !currentGeneration}
              className="btn-primary flex items-center gap-2 text-sm px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="text-lg">✨</span>
              New Prompt
            </button>
            <button
              onClick={handleUpscale}
              disabled={isUpscaling || !isConnected || !currentGeneration}
              className="btn-secondary flex items-center gap-2 text-sm px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="text-lg">{isUpscaling ? '⏳' : '🔍'}</span>
              {isUpscaling ? 'Upscaling...' : 'Upscale'}
            </button>
            <button
              onClick={handleGenerateVideo}
              disabled={isGeneratingVideo || !isConnected || !currentGeneration}
              className="btn-secondary flex items-center gap-2 text-sm px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="text-lg">{isGeneratingVideo ? '⏳' : '🎬'}</span>
              {isGeneratingVideo ? 'Generating...' : 'Video'}
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
