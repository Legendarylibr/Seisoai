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


  const image = initialImage || controlNetImage;

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
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <div className="flex items-center justify-center gap-3 mb-4">
          <Video className="w-8 h-8 text-purple-400" />
          <h1 className="text-3xl font-bold gradient-text">Video Generation</h1>
        </div>
        <p className="text-gray-300 max-w-2xl mx-auto">
          Create stunning videos with Google's Veo 3 Fast Image-to-Video model. Upload an image and describe how it should be animated.
        </p>
      </div>

      {/* Credits Info */}
      <div className="glass-effect rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Video className="w-5 h-5 text-purple-400" />
            <span className="text-gray-300">Cost: 10 credits per video</span>
          </div>
          <div className="text-purple-400 font-semibold">
            {credits} credits available
          </div>
        </div>
      </div>

      {/* Image Input */}
      {!initialImage && (
        <div className="glass-effect rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Upload className="w-5 h-5 text-purple-400" />
            Reference Image (Required)
          </h3>
          <ReferenceImageInput />
          {image && (
            <div className="mt-4">
              <img src={image} alt="Selected" className="max-w-full h-auto rounded-lg max-h-96" />
            </div>
          )}
        </div>
      )}
      {initialImage && (
        <div className="glass-effect rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Upload className="w-5 h-5 text-purple-400" />
            Reference Image
          </h3>
          <div className="mt-4">
            <img src={initialImage} alt="Reference" className="max-w-full h-auto rounded-lg max-h-96 mx-auto" />
            <p className="text-sm text-gray-400 mt-2 text-center">Using provided reference image</p>
          </div>
        </div>
      )}

      {/* Video Settings */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="glass-effect rounded-xl p-4">
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Aspect Ratio
          </label>
          <select
            value={aspectRatio}
            onChange={(e) => setAspectRatio(e.target.value)}
            className="w-full p-3 rounded-lg bg-white/5 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-purple-400"
          >
            <option value="auto" className="bg-gray-800">Auto (Match Image)</option>
            <option value="16:9" className="bg-gray-800">16:9 (Landscape)</option>
            <option value="9:16" className="bg-gray-800">9:16 (Portrait)</option>
            <option value="1:1" className="bg-gray-800">1:1 (Square)</option>
          </select>
        </div>

        <div className="glass-effect rounded-xl p-4">
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Duration
          </label>
          <div className="w-full p-3 rounded-lg bg-white/5 border border-white/20 text-gray-400">
            8 seconds (Fixed)
          </div>
        </div>
      </div>

      {/* Prompt Input */}
      <div className="glass-effect rounded-xl p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Video className="w-5 h-5 text-purple-400" />
          Video Prompt
        </h3>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe how the image should be animated. Include action, camera motion, style, and ambiance..."
          className="w-full p-4 rounded-lg bg-white/5 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-400 min-h-32"
          rows="5"
        />
        <p className="text-xs text-gray-400 mt-2">
          Describe the animation: how objects move, camera perspective, style, and atmosphere.
        </p>
      </div>

      {/* Progress */}
      {isGenerating && (
        <div className="glass-effect rounded-xl p-6">
          <div className="flex items-center gap-3 mb-3">
            <Loader className="w-5 h-5 text-purple-400 animate-spin" />
            <span className="text-white font-medium">Generating video...</span>
          </div>
          <div className="w-full bg-white/10 rounded-full h-2">
            <div 
              className="bg-gradient-to-r from-purple-600 to-pink-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-sm text-gray-400 mt-2">{progress}% complete</p>
        </div>
      )}

      {/* Generated Video */}
      {generatedVideo && (
        <div className="glass-effect rounded-xl p-6 space-y-4">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Play className="w-5 h-5 text-green-400" />
            Generated Video {videoHistory.length > 0 && `(${videoHistory.length} ${videoHistory.length === 1 ? 'part' : 'parts'})`}
          </h3>
          <video
            src={generatedVideo}
            controls
            className="w-full rounded-lg"
            autoPlay
          >
            Your browser does not support the video tag.
          </video>
          <div className="flex justify-between items-center">
            <button onClick={handleDownloadVideo} className="btn-secondary flex items-center gap-2">
              <Download className="w-4 h-4" />
              Download
            </button>
          </div>
          
          {/* Video Extension Section */}
          <div className="mt-6 pt-6 border-t border-white/10">
            <h4 className="text-md font-semibold mb-3 flex items-center gap-2">
              <Video className="w-4 h-4 text-purple-400" />
              Extend Video
            </h4>
            <p className="text-sm text-gray-400 mb-3">
              Continue the video with a new prompt. Cost: 10 credits per extension.
            </p>
            <textarea
              value={extensionPrompt}
              onChange={(e) => setExtensionPrompt(e.target.value)}
              placeholder="Describe how the video should continue... (e.g., 'zoom out slowly', 'camera pans left', 'character walks forward')"
              className="w-full p-3 rounded-lg bg-white/5 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-400 min-h-24 mb-3"
              rows="3"
            />
            <button
              onClick={handleExtendVideo}
              disabled={isExtending || !extensionPrompt.trim() || credits < 10}
              className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 w-full"
            >
              {isExtending ? (
                <>
                  <Loader className="w-4 h-4 animate-spin" />
                  Extending Video...
                </>
              ) : (
                <>
                  <Video className="w-4 h-4" />
                  Extend Video (10 credits)
                </>
              )}
            </button>
            {extensionPrompt.trim() && credits < 10 && (
              <p className="text-sm text-yellow-400 mt-2">⚠️ You need 10 credits to extend. You have {credits} credits</p>
            )}
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-red-400">
          {error}
        </div>
      )}

      {/* Generate Button */}
      <div className="flex flex-col items-center gap-3">
        <button
          onClick={handleGenerate}
          disabled={isGenerating || !prompt.trim() || !image || credits < 10}
          className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {isGenerating ? (
            <>
              <Loader className="w-5 h-5 animate-spin" />
              Generating...
            </>
          ) : (
            <>
              <Video className="w-5 h-5" />
              Generate Video (10 credits)
            </>
          )}
        </button>
        
        {/* Status messages */}
        {!prompt.trim() && (
          <p className="text-sm text-yellow-400">⚠️ Enter a prompt to enable generation</p>
        )}
        {prompt.trim() && !image && (
          <p className="text-sm text-yellow-400">⚠️ Upload an image to enable generation</p>
        )}
        {prompt.trim() && image && credits < 10 && (
          <p className="text-sm text-yellow-400">⚠️ You need 10 credits. You have {credits} credits</p>
        )}
        {prompt.trim() && image && credits >= 10 && !isGenerating && (
          <p className="text-sm text-green-400">✅ Ready to generate!</p>
        )}
      </div>
    </div>
  );
};

export default VideoGeneration;

