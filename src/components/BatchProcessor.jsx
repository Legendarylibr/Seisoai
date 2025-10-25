import React, { useState } from 'react';
import { useImageGenerator } from '../contexts/ImageGeneratorContext';
import { useSimpleWallet } from '../contexts/SimpleWalletContext';
import { addGeneration } from '../services/galleryService';
import { generateImage } from '../services/smartImageService';
import { Upload, Play, Pause, Download, Trash2, CheckCircle, AlertCircle, Clock } from 'lucide-react';

const BatchProcessor = () => {
  const { 
    batchPrompts, 
    setBatchPrompts, 
    batchResults, 
    addBatchResult, 
    clearBatchResults,
    isBatchProcessing,
    setBatchProcessing,
    selectedStyle,
    guidanceScale,
    numInferenceSteps,
    imageSize,
    numImages,
    enableSafetyChecker,
    generationMode
  } = useImageGenerator();

  const {
    isConnected,
    address,
    credits,
    fetchCredits,
    isNFTHolder
  } = useSimpleWallet();

  const [newPrompt, setNewPrompt] = useState('');
  const [processingIndex, setProcessingIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const handleAddPrompt = () => {
    if (newPrompt.trim()) {
      setBatchPrompts([...batchPrompts, {
        id: Date.now(),
        text: newPrompt.trim(),
        status: 'pending'
      }]);
      setNewPrompt('');
    }
  };

  const handleRemovePrompt = (id) => {
    setBatchPrompts(batchPrompts.filter(p => p.id !== id));
  };

  const handleClearAll = () => {
    setBatchPrompts([]);
    clearBatchResults();
    setProcessingIndex(0);
  };

  const processBatch = async () => {
    // Check if wallet is connected
    if (!isConnected || !address) {
      alert('Please connect your wallet first');
      return;
    }

    // Check if user has credits
    if (credits <= 0) {
      alert('You need credits to process batch images. Please purchase credits first.');
      return;
    }

    // Style is optional - can generate with just prompts

    setBatchProcessing(true);
    setProcessingIndex(0);

    for (let i = 0; i < batchPrompts.length; i++) {
      if (isPaused) {
        break;
      }

      setProcessingIndex(i);
      
      // Update prompt status
      const updatedPrompts = [...batchPrompts];
      updatedPrompts[i].status = 'processing';
      setBatchPrompts(updatedPrompts);

      try {
        const advancedSettings = {
          guidanceScale,
          numInferenceSteps,
          imageSize,
          numImages,
          enableSafetyChecker,
          generationMode,
          walletAddress: address, // Pass wallet address for safety logging
          isNFTHolder: isNFTHolder || false // Pass NFT holder status for routing
        };

        const imageUrl = await generateImage(
          selectedStyle || null,
          batchPrompts[i].text,
          advancedSettings,
          null // no control net for batch
        );

        // Save generation to backend and deduct credits
        try {
          await addGeneration(address, {
            prompt: batchPrompts[i].text,
            style: selectedStyle ? selectedStyle.name : 'No Style',
            imageUrl,
            creditsUsed: 1 // 1 credit per generation
          });
        } catch (error) {
          console.error('Error saving batch generation:', error);
          // Continue with batch processing even if saving fails
        }

        // Add result
        addBatchResult({
          id: Date.now() + i,
          prompt: batchPrompts[i].text,
          imageUrl,
          timestamp: new Date().toISOString(),
          style: selectedStyle || { name: 'No Style' }
        });

        // Update prompt status
        updatedPrompts[i].status = 'completed';
        setBatchPrompts(updatedPrompts);

      } catch (error) {
        console.error('Batch processing error:', error);
        updatedPrompts[i].status = 'error';
        updatedPrompts[i].error = error.message;
        setBatchPrompts(updatedPrompts);
      }

      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Refresh credits after batch processing is complete
    if (fetchCredits && address) {
      await fetchCredits(address);
    }

    setBatchProcessing(false);
    setProcessingIndex(0);
  };

  const handlePause = () => {
    setIsPaused(true);
    setBatchProcessing(false);
  };

  const handleResume = () => {
    setIsPaused(false);
    processBatch();
  };

  const handleDownloadAll = async () => {
    for (let i = 0; i < batchResults.length; i++) {
      const result = batchResults[i];
      try {
        // Fetch the image as a blob to handle CORS issues
        const response = await fetch(result.imageUrl);
        const blob = await response.blob();
        
        // Create a blob URL
        const blobUrl = window.URL.createObjectURL(blob);
        
        // Create download link
        const link = document.createElement('a');
        link.href = blobUrl;
        link.download = `batch-${i + 1}-${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        
        // Cleanup
        document.body.removeChild(link);
        window.URL.revokeObjectURL(blobUrl);
        
        // Small delay between downloads
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`Download failed for batch ${i + 1}:`, error);
        // Fallback to direct link method
        const link = document.createElement('a');
        link.href = result.imageUrl;
        link.download = `batch-${i + 1}-${Date.now()}.png`;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4 text-green-400" />;
      case 'processing':
        return <Clock className="w-4 h-4 text-blue-400 animate-spin" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-400" />;
      default:
        return <Clock className="w-4 h-4 text-gray-400" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="flex items-center justify-center gap-3 mb-4">
          <Upload className="w-8 h-8 text-purple-400" />
          <h1 className="text-3xl font-bold gradient-text">Batch Processing</h1>
        </div>
        <p className="text-gray-300 max-w-2xl mx-auto">
          Generate multiple images at once using different prompts. Perfect for creating variations or processing large sets.
        </p>
      </div>

      {/* Add Prompts */}
      <div className="glass-effect rounded-xl p-6">
        <h3 className="text-lg font-semibold mb-4">Add Prompts</h3>
        <div className="flex gap-3">
          <input
            type="text"
            value={newPrompt}
            onChange={(e) => setNewPrompt(e.target.value)}
            placeholder="Enter a prompt for batch generation..."
            className="flex-1 p-3 rounded-lg bg-white/10 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-400"
            onKeyPress={(e) => e.key === 'Enter' && handleAddPrompt()}
            id="batch-prompt-input"
            name="batch-prompt"
          />
          <button
            onClick={handleAddPrompt}
            disabled={!newPrompt.trim()}
            className="btn-primary px-6"
          >
            Add
          </button>
        </div>
      </div>

      {/* Prompts List */}
      {batchPrompts.length > 0 && (
        <div className="glass-effect rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Prompts ({batchPrompts.length})</h3>
            <div className="flex gap-2">
              {!isBatchProcessing && !isPaused && (
                <button
                  onClick={processBatch}
                  disabled={!selectedStyle}
                  className="btn-primary flex items-center gap-2"
                >
                  <Play className="w-4 h-4" />
                  Start Batch
                </button>
              )}
              {isBatchProcessing && !isPaused && (
                <button
                  onClick={handlePause}
                  className="btn-secondary flex items-center gap-2"
                >
                  <Pause className="w-4 h-4" />
                  Pause
                </button>
              )}
              {isPaused && (
                <button
                  onClick={handleResume}
                  className="btn-primary flex items-center gap-2"
                >
                  <Play className="w-4 h-4" />
                  Resume
                </button>
              )}
              <button
                onClick={handleClearAll}
                className="btn-secondary flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                Clear All
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {batchPrompts.map((prompt, index) => (
              <div
                key={prompt.id}
                className={`flex items-center gap-3 p-3 rounded-lg border ${
                  index === processingIndex && isBatchProcessing
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-white/20 bg-white/5'
                }`}
              >
                <div className="flex-shrink-0">
                  {getStatusIcon(prompt.status)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-300 truncate">{prompt.text}</p>
                  {prompt.error && (
                    <p className="text-xs text-red-400 mt-1">{prompt.error}</p>
                  )}
                </div>
                <div className="flex-shrink-0 text-xs text-gray-500">
                  {index + 1}
                </div>
                <button
                  onClick={() => handleRemovePrompt(prompt.id)}
                  className="flex-shrink-0 p-1 rounded hover:bg-white/10 transition-colors"
                >
                  <Trash2 className="w-4 h-4 text-gray-400" />
                </button>
              </div>
            ))}
          </div>

          {/* Progress */}
          {isBatchProcessing && (
            <div className="mt-4">
              <div className="flex items-center justify-between text-sm text-gray-400 mb-2">
                <span>Processing...</span>
                <span>{processingIndex + 1} / {batchPrompts.length}</span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-2">
                <div
                  className="bg-purple-500 h-2 rounded-full transition-all duration-300"
                  style={{ width: `${((processingIndex + 1) / batchPrompts.length) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Results */}
      {batchResults.length > 0 && (
        <div className="glass-effect rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Results ({batchResults.length})</h3>
            <button
              onClick={handleDownloadAll}
              className="btn-primary flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              Download All
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {batchResults.map((result, index) => (
              <div key={result.id} className="relative group">
                <div className="aspect-square rounded-lg overflow-hidden">
                  <img
                    src={result.imageUrl}
                    alt={`Batch result ${index + 1}`}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
                  <button
                    onClick={async () => {
                      try {
                        // Fetch the image as a blob to handle CORS issues
                        const response = await fetch(result.imageUrl);
                        const blob = await response.blob();
                        
                        // Create a blob URL
                        const blobUrl = window.URL.createObjectURL(blob);
                        
                        // Create download link
                        const link = document.createElement('a');
                        link.href = blobUrl;
                        link.download = `batch-${index + 1}-${Date.now()}.png`;
                        document.body.appendChild(link);
                        link.click();
                        
                        // Cleanup
                        document.body.removeChild(link);
                        window.URL.revokeObjectURL(blobUrl);
                      } catch (error) {
                        console.error('Download failed:', error);
                        // Fallback to direct link method
                        const link = document.createElement('a');
                        link.href = result.imageUrl;
                        link.download = `batch-${index + 1}-${Date.now()}.png`;
                        link.target = '_blank';
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                      }
                    }}
                    className="p-2 rounded-lg bg-white/20 text-white hover:bg-white/30 transition-colors"
                  >
                    <Download className="w-5 h-5" />
                  </button>
                </div>
                <div className="mt-2">
                  <p className="text-xs text-gray-400 truncate">{result.prompt}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No Prompts */}
      {batchPrompts.length === 0 && (
        <div className="text-center py-12">
          <div className="text-4xl mb-4">📝</div>
          <h3 className="text-lg font-semibold text-gray-300 mb-2">No prompts added</h3>
          <p className="text-gray-500">Add some prompts above to start batch processing</p>
        </div>
      )}
    </div>
  );
};

export default BatchProcessor;
