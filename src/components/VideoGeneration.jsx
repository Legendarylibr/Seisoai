import React, { useState, useEffect } from 'react';
import { useSimpleWallet } from '../contexts/SimpleWalletContext';
import { generateVideo } from '../services/veo3Service';
import { addGeneration } from '../services/galleryService';
import { Video, Upload, Play, Loader, Download } from 'lucide-react';
import ReferenceImageInput from './ReferenceImageInput';
import { useImageGenerator } from '../contexts/ImageGeneratorContext';

const VideoGeneration = ({ onShowTokenPayment, initialImage = null, initialPrompt = '' }) => {
  // onShowStripePayment prop removed - Stripe disabled
  const { credits, address, refreshCredits, setCreditsManually } = useSimpleWallet();
  const [prompt, setPrompt] = useState(initialPrompt);
  const { controlNetImage } = useImageGenerator();
  const [aspectRatio, setAspectRatio] = useState('auto');
  const [duration, setDuration] = useState('8s');
  const [generatedVideo, setGeneratedVideo] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const [extensionPrompt, setExtensionPrompt] = useState('');
  const [isExtending, setIsExtending] = useState(false);
  const [videoHistory, setVideoHistory] = useState([]); // Track video extensions


  // Extract single image - if controlNetImage is an array, use first image only
  const getSingleImage = () => {
    if (initialImage) return initialImage;
    if (!controlNetImage) return null;
    // If it's an array (multiple images), use first one for video
    if (Array.isArray(controlNetImage)) {
      return controlNetImage[0];
    }
    return controlNetImage;
  };
  
  const image = getSingleImage();

  // Set initial image if provided
  React.useEffect(() => {
    if (initialImage) {
      // Clear any existing controlNetImage if we have initialImage
    }
    if (initialPrompt) {
      setPrompt(initialPrompt);
    }
  }, [initialImage, initialPrompt]);

  const handleExtendVideo = async () => {
    if (!extensionPrompt.trim() || !generatedVideo || credits < 10) {
      setError('Please enter a prompt to extend the video. Extension costs 10 credits.');
      return;
    }

    setIsExtending(true);
    setError('');
    setProgress(0);

    try {
      let progressInterval;
      
      // Simulate progress
      progressInterval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 90) return prev;
          return prev + 1;
        });
      }, 1000);

      // Use the last frame of the current video as the image for extension
      // In practice, you'd extract the last frame, but for now we'll use the original image
      const extensionVideoUrl = await generateVideo({
        prompt: extensionPrompt.trim(),
        image: image, // Use same base image
        options: {
          aspectRatio: aspectRatio,
          duration: duration,
        }
      });

      clearInterval(progressInterval);
      setProgress(100);
      
      // Add new video to history
      setVideoHistory(prev => [...prev, {
        videoUrl: extensionVideoUrl,
        prompt: extensionPrompt.trim(),
        timestamp: Date.now(),
        isExtension: true
      }]);
      
      setGeneratedVideo(extensionVideoUrl);
      setExtensionPrompt('');

      // Deduct credits for extension
      if (address && extensionVideoUrl) {
        try {
          const result = await addGeneration(address, {
            prompt: `Video Extension: ${extensionPrompt.trim()}`,
            style: 'Video Extension',
            imageUrl: extensionVideoUrl,
            creditsUsed: 10
          });
          
          if (result.remainingCredits !== undefined && setCreditsManually) {
            setCreditsManually(result.remainingCredits);
          }
          
          if (refreshCredits) {
            await refreshCredits();
          }
        } catch (deductionError) {
          console.error('❌ Error deducting credits for video extension:', deductionError);
        }
      }
    } catch (err) {
      setError(err.message || 'Failed to extend video');
      setProgress(0);
    } finally {
      setIsExtending(false);
    }
  };

  const handleDownloadVideo = async () => {
    if (!generatedVideo) return;
    try {
      const getNextSeisoVideoFilename = () => {
        try {
          const key = 'seiso_download_index';
          const current = parseInt(localStorage.getItem(key) || '0', 10) || 0;
          const next = current + 1;
          localStorage.setItem(key, String(next));
          return `seiso${next}.mp4`;
        } catch (_) {
          return `seiso${Date.now()}.mp4`;
        }
      };
      const filename = getNextSeisoVideoFilename();

      const response = await fetch(generatedVideo);
      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);

      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = filename;
      if (isIOS) link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error('Video download failed:', error);
      const link = document.createElement('a');
      link.href = generatedVideo;
      try {
        const key = 'seiso_download_index';
        const current = parseInt(localStorage.getItem(key) || '0', 10) || 0;
        const next = current + 1;
        localStorage.setItem(key, String(next));
        link.download = `seiso${next}.mp4`;
      } catch (_) {
        link.download = `seiso${Date.now()}.mp4`;
      }
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError('Please enter a prompt');
      return;
    }

    if (!image) {
      setError('Please upload a reference image. Image-to-video requires an input image.');
      return;
    }

    if (credits < 10) {
      setError('Insufficient credits. Video generation costs 10 credits.');
      return;
    }

    setIsGenerating(true);
    setError('');
    setGeneratedVideo(null);
    setProgress(0);

    try {
      // Pass progress callback to update progress
      let progressInterval;
      
      // Simulate initial progress
      progressInterval = setInterval(() => {
        setProgress((prev) => {
          if (prev >= 90) return prev;
          return prev + 1;
        });
      }, 1000);

      const videoUrl = await generateVideo({
        prompt: prompt.trim(),
        image: image,
        options: {
          aspectRatio: aspectRatio,
          duration: duration,
        }
      });

      clearInterval(progressInterval);
      setProgress(100);
      setGeneratedVideo(videoUrl);

      // Deduct credits and save video to gallery
      if (address && videoUrl) {
        try {
          console.log('💾 Saving video generation and deducting 10 credits...', { address, videoUrl });
          const result = await addGeneration(address, {
            prompt: prompt.trim(),
            style: 'Video Generation',
            imageUrl: videoUrl,
            creditsUsed: 10 // 10 credits for video generation
          });
          
          console.log('✅ Video saved and credits deducted:', {
            success: result.success,
            remainingCredits: result.remainingCredits,
            creditsDeducted: result.creditsDeducted
          });
          
          // Add to video history for extension
          setVideoHistory(prev => [...prev, {
            videoUrl,
            prompt: prompt.trim(),
            timestamp: Date.now()
          }]);
          
          // Update credits in UI
          if (result.remainingCredits !== undefined && setCreditsManually) {
            setCreditsManually(result.remainingCredits);
          }
          
          // Refresh credits to ensure sync
          if (refreshCredits) {
            await refreshCredits();
          }
        } catch (deductionError) {
          console.error('❌ Error deducting credits for video:', deductionError);
          // Don't fail the whole operation if credit deduction fails
          // The video was generated successfully
        }
      }
    } catch (err) {
      setError(err.message || 'Failed to generate video');
      setProgress(0);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-4 md:space-y-6 px-4 md:px-0">
      {/* Header */}
      <div className="text-center">
        <div className="flex items-center justify-center gap-2 md:gap-3 mb-3 md:mb-4">
          <Video className="w-6 h-6 md:w-8 md:h-8 text-purple-400" />
          <h1 className="text-2xl md:text-3xl font-bold gradient-text">Video Generation</h1>
        </div>
        <p className="text-sm md:text-base text-gray-300 max-w-2xl mx-auto px-2">
          Create stunning videos with Google's Veo 3 Fast Image-to-Video model. Upload an image and describe how it should be animated.
        </p>
      </div>

      {/* Credits Info */}
      <div className="glass-effect rounded-xl p-3 md:p-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-0">
          <div className="flex items-center gap-2">
            <Video className="w-4 h-4 md:w-5 md:h-5 text-purple-400" />
            <span className="text-sm md:text-base text-gray-300">Cost: 10 credits per video</span>
          </div>
          <div className="text-sm md:text-base text-purple-400 font-semibold">
            {credits} credits available
          </div>
        </div>
      </div>

      {/* Image Input */}
      {!initialImage && (
        <div className="glass-effect rounded-xl p-4 md:p-6">
          <h3 className="text-base md:text-lg font-semibold mb-3 md:mb-4 flex items-center gap-2">
            <Upload className="w-4 h-4 md:w-5 md:h-5 text-purple-400" />
            Reference Image (Required)
          </h3>
          <div className="mb-3 md:mb-0">
            <ReferenceImageInput singleImageOnly={true} />
          </div>
          {image && (
            <div className="mt-4">
              <img 
                src={image} 
                alt="Selected" 
                className="w-full h-auto rounded-lg max-h-64 md:max-h-96 object-contain bg-white/5 mx-auto" 
              />
            </div>
          )}
        </div>
      )}
      {initialImage && (
        <div className="glass-effect rounded-xl p-4 md:p-6">
          <h3 className="text-base md:text-lg font-semibold mb-3 md:mb-4 flex items-center gap-2">
            <Upload className="w-4 h-4 md:w-5 md:h-5 text-purple-400" />
            Reference Image
          </h3>
          <div className="mt-4">
            <img 
              src={initialImage} 
              alt="Reference" 
              className="w-full h-auto rounded-lg max-h-64 md:max-h-96 object-contain bg-white/5 mx-auto" 
            />
            <p className="text-xs md:text-sm text-gray-400 mt-2 text-center">Using provided reference image</p>
          </div>
        </div>
      )}

      {/* Video Settings */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
        <div className="glass-effect rounded-xl p-3 md:p-4">
          <label className="block text-xs md:text-sm font-medium text-gray-300 mb-2">
            Aspect Ratio
          </label>
          <select
            value={aspectRatio}
            onChange={(e) => setAspectRatio(e.target.value)}
            className="w-full p-2 md:p-3 text-sm md:text-base rounded-lg bg-white/5 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-purple-400"
          >
            <option value="auto" className="bg-gray-800">Auto (Match Image)</option>
            <option value="16:9" className="bg-gray-800">16:9 (Landscape)</option>
            <option value="9:16" className="bg-gray-800">9:16 (Portrait)</option>
            <option value="1:1" className="bg-gray-800">1:1 (Square)</option>
          </select>
        </div>

        <div className="glass-effect rounded-xl p-3 md:p-4">
          <label className="block text-xs md:text-sm font-medium text-gray-300 mb-2">
            Duration
          </label>
          <div className="w-full p-2 md:p-3 text-sm md:text-base rounded-lg bg-white/5 border border-white/20 text-gray-400">
            8 seconds (Fixed)
          </div>
        </div>
      </div>

      {/* Prompt Input */}
      <div className="glass-effect rounded-xl p-4 md:p-6">
        <h3 className="text-base md:text-lg font-semibold mb-3 md:mb-4 flex items-center gap-2">
          <Video className="w-4 h-4 md:w-5 md:h-5 text-purple-400" />
          Video Prompt
        </h3>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe how the image should be animated. Include action, camera motion, style, and ambiance..."
          className="w-full p-3 md:p-4 text-sm md:text-base rounded-lg bg-white/5 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-400 min-h-24 md:min-h-32"
          rows="4"
        />
        <p className="text-xs md:text-sm text-gray-400 mt-2">
          Describe the animation: how objects move, camera perspective, style, and atmosphere.
        </p>
      </div>

      {/* Progress */}
      {isGenerating && (
        <div className="glass-effect rounded-xl p-4 md:p-6">
          <div className="flex items-center gap-2 md:gap-3 mb-3">
            <Loader className="w-4 h-4 md:w-5 md:h-5 text-purple-400 animate-spin" />
            <span className="text-sm md:text-base text-white font-medium">Generating video...</span>
          </div>
          <div className="w-full bg-white/10 rounded-full h-2">
            <div 
              className="bg-gradient-to-r from-purple-600 to-pink-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs md:text-sm text-gray-400 mt-2">{progress}% complete</p>
        </div>
      )}

      {/* Generated Video */}
      {generatedVideo && (
        <div className="glass-effect rounded-xl p-4 md:p-6 space-y-3 md:space-y-4">
          <h3 className="text-base md:text-lg font-semibold mb-3 md:mb-4 flex items-center gap-2">
            <Play className="w-4 h-4 md:w-5 md:h-5 text-green-400" />
            <span className="text-sm md:text-base">
              Generated Video {videoHistory.length > 0 && `(${videoHistory.length} ${videoHistory.length === 1 ? 'part' : 'parts'})`}
            </span>
          </h3>
          <div className="w-full rounded-lg overflow-hidden bg-black/20">
            <video
              src={generatedVideo}
              controls
              className="w-full h-auto rounded-lg"
              autoPlay
              playsInline
            >
              Your browser does not support the video tag.
            </video>
          </div>
          <div className="flex justify-center sm:justify-start items-center">
            <button 
              onClick={handleDownloadVideo} 
              className="btn-secondary flex items-center gap-2 text-sm md:text-base px-4 py-2 md:px-6 md:py-3"
            >
              <Download className="w-4 h-4" />
              Download
            </button>
          </div>
          
          {/* Video Extension Section */}
          <div className="mt-4 md:mt-6 pt-4 md:pt-6 border-t border-white/10">
            <h4 className="text-sm md:text-base font-semibold mb-2 md:mb-3 flex items-center gap-2">
              <Video className="w-3 h-3 md:w-4 md:h-4 text-purple-400" />
              Extend Video
            </h4>
            <p className="text-xs md:text-sm text-gray-400 mb-2 md:mb-3">
              Continue the video with a new prompt. Cost: 10 credits per extension.
            </p>
            <textarea
              value={extensionPrompt}
              onChange={(e) => setExtensionPrompt(e.target.value)}
              placeholder="Describe how the video should continue... (e.g., 'zoom out slowly', 'camera pans left', 'character walks forward')"
              className="w-full p-2 md:p-3 text-sm md:text-base rounded-lg bg-white/5 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-400 min-h-20 md:min-h-24 mb-2 md:mb-3"
              rows="3"
            />
            <button
              onClick={handleExtendVideo}
              disabled={isExtending || !extensionPrompt.trim() || credits < 10}
              className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 w-full text-sm md:text-base px-4 py-2 md:px-6 md:py-3"
            >
              {isExtending ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" />
                  <span>Extending Video...</span>
                </>
              ) : (
                <>
                  <Video className="w-4 h-4" />
                  <span>Extend Video (10 credits)</span>
                </>
              )}
            </button>
            {extensionPrompt.trim() && credits < 10 && (
              <p className="text-xs md:text-sm text-yellow-400 mt-2">⚠️ You need 10 credits to extend. You have {credits} credits</p>
            )}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 md:p-4 text-xs md:text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Generate Button */}
      <div className="flex flex-col items-center gap-2 md:gap-3 pb-4 md:pb-0">
        <button
          onClick={handleGenerate}
          disabled={isGenerating || !prompt.trim() || !image || credits < 10}
          className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 w-full sm:w-auto text-sm md:text-base px-6 py-3 md:px-8 md:py-4"
        >
          {isGenerating ? (
            <>
              <Loader className="w-4 h-4 md:w-5 md:h-5 animate-spin" />
              <span>Generating...</span>
            </>
          ) : (
            <>
              <Video className="w-4 h-4 md:w-5 md:h-5" />
              <span>Generate Video (10 credits)</span>
            </>
          )}
        </button>
        
        {/* Status messages */}
        {!prompt.trim() && (
          <p className="text-xs md:text-sm text-yellow-400 text-center">⚠️ Enter a prompt to enable generation</p>
        )}
        {prompt.trim() && !image && (
          <p className="text-xs md:text-sm text-yellow-400 text-center">⚠️ Upload an image to enable generation</p>
        )}
        {prompt.trim() && image && credits < 10 && (
          <p className="text-xs md:text-sm text-yellow-400 text-center">⚠️ You need 10 credits. You have {credits} credits</p>
        )}
        {prompt.trim() && image && credits >= 10 && !isGenerating && (
          <p className="text-xs md:text-sm text-green-400 text-center">✅ Ready to generate!</p>
        )}
      </div>
    </div>
  );
};

export default VideoGeneration;

