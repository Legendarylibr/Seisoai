import React, { useState } from 'react';
import { useSimpleWallet } from '../contexts/SimpleWalletContext';
import { useEmailAuth } from '../contexts/EmailAuthContext';
import SimpleWalletConnect from './SimpleWalletConnect';
import EmailUserInfo from './EmailUserInfo';
import VideoOutput from './VideoOutput';
import VideoUpload from './VideoUpload';
import { Video as VideoIcon, Upload, Image as ImageIcon } from 'lucide-react';
import { getVideoDuration, calculateVideoCredits } from '../utils/videoUtils';
import logger from '../utils/logger';

function VideoTab({ onShowTokenPayment, onShowStripePayment }) {
  const walletContext = useSimpleWallet();
  const emailContext = useEmailAuth();
  
  const isEmailAuth = emailContext.isAuthenticated;
  const credits = isEmailAuth ? (emailContext.credits || 0) : (walletContext.credits || 0);
  
  const [videoFile, setVideoFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [imageUrl, setImageUrl] = useState(null);
  const [generatedVideoUrl, setGeneratedVideoUrl] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [progress, setProgress] = useState(0);

  const handleVideoUpload = async (file) => {
    if (file) {
      setVideoFile(file);
      setError(null);
      
      // Check file size (warn if too large, but still try)
      if (file.size > 50 * 1024 * 1024) {
        setError('Video file is large (>50MB). This may take longer to process.');
      }
      
      // Convert to data URI for upload (backend will handle uploading to fal.ai)
      const reader = new FileReader();
      reader.onload = (e) => {
        setVideoUrl(e.target.result);
        setError(null); // Clear error once loaded
      };
      reader.onerror = () => {
        setError('Failed to read video file. Please try a smaller file or different format.');
      };
      reader.readAsDataURL(file);
    }
  };

  const handleImageUpload = (file) => {
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        setImageUrl(e.target.result);
        setError(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleClear = () => {
    setVideoFile(null);
    setVideoUrl(null);
    setImageFile(null);
    setImageUrl(null);
    setGeneratedVideoUrl(null);
    setError(null);
    setProgress(0);
  };

  return (
    <div className="fade-in">
      {/* Professional Header */}
      <div className="text-center py-0.5 mb-1">
        <h1 className="text-3xl md:text-4xl font-bold gradient-text mb-0.5">Video Animate</h1>
        <p className="text-gray-400 text-base md:text-lg">Replace characters in videos with AI</p>
      </div>

      {/* User Info - Email or Wallet */}
      <div className="glass-card rounded-xl rounded-b-none p-2.5 mb-0 slide-up">
        {isEmailAuth ? (
          <EmailUserInfo onShowStripePayment={onShowStripePayment} />
        ) : (
          <SimpleWalletConnect />
        )}
      </div>

      {/* Credits Status Banner */}
      {credits < 2 && !isEmailAuth && (
        <div className="glass-card bg-yellow-500/10 border-yellow-500/30 rounded-t-none rounded-b-none p-2.5 mb-0 animate-pulse">
          <div className="flex items-center gap-2 text-center justify-center">
            <div className="w-2.5 h-2.5 bg-yellow-400 rounded-full animate-pulse"></div>
            <span className="text-yellow-300 text-xs md:text-sm font-medium">
              {credits === 0 
                ? 'No credits available - Click "Buy Credits" in the top right to purchase credits'
                : `Insufficient credits (${credits} available). Video generation requires at least 2 credits (2 credits per second).`
              }
            </span>
          </div>
        </div>
      )}

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Left Column - Inputs */}
        <div className="space-y-3">
          {/* Video Upload */}
          <div className="glass-card p-3 mb-3">
            <div className="flex items-center gap-2 mb-2">
              <VideoIcon className="w-4 h-4 text-gray-400" />
              <h3 className="text-xs font-medium text-gray-300">Reference Video</h3>
            </div>
            <VideoUpload
              onFileSelect={handleVideoUpload}
              currentFile={videoFile}
              currentUrl={videoUrl}
            />
          </div>

          {/* Image Upload */}
          <div className="glass-card p-3 mb-3">
            <div className="flex items-center gap-2 mb-2">
              <ImageIcon className="w-4 h-4 text-gray-400" />
              <h3 className="text-xs font-medium text-gray-300">Character Image</h3>
            </div>
            <div className="border border-dashed border-[#3d3d3d] p-4 text-center cursor-pointer hover:border-[#4a4a4a] hover:bg-[#1a1a1a] transition-all duration-150">
              {imageUrl ? (
                <div className="relative">
                  <img 
                    src={imageUrl} 
                    alt="Character" 
                    className="max-w-full max-h-64 mx-auto rounded"
                  />
                  <button
                    onClick={() => {
                      setImageFile(null);
                      setImageUrl(null);
                    }}
                    className="absolute top-2 right-2 p-1.5 bg-[#2d2d2d] hover:bg-[#3d3d3d] border border-[#3d3d3d] rounded"
                  >
                    <span className="text-gray-300 text-xs">×</span>
                  </button>
                </div>
              ) : (
                <label className="cursor-pointer">
                  <Upload className="w-6 h-6 text-gray-500 mx-auto mb-2" />
                  <p className="text-xs text-gray-400 mb-1">Click to upload character image</p>
                  <p className="text-xs text-gray-500">PNG, JPG up to 10MB</p>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => {
                      if (e.target.files && e.target.files[0]) {
                        handleImageUpload(e.target.files[0]);
                      }
                    }}
                    className="hidden"
                  />
                </label>
              )}
            </div>
          </div>
        </div>

        {/* Right Column - Output */}
        <div className="space-y-3">
          <VideoOutput
            videoUrl={generatedVideoUrl}
            isGenerating={isGenerating}
            progress={progress}
            error={error}
            onGenerate={async () => {
              if (!videoUrl || !imageUrl) {
                setError('Please upload both a video and an image');
                return;
              }
              
              // Check minimum credits (at least 2 credits required)
              if (credits < 2) {
                setError('Insufficient credits. Video generation requires at least 2 credits (2 credits per second of video).');
                return;
              }
              
              setIsGenerating(true);
              setError(null);
              setProgress(10);
              
              try {
                const { generateVideo } = await import('../services/wanAnimateService');
                const { addGeneration } = await import('../services/galleryService');
                
                const userIdentifier = isEmailAuth 
                  ? (emailContext.linkedWalletAddress || emailContext.userId) 
                  : walletContext.address;
                
                // Calculate credits first (before starting generation)
                let videoDuration = 0;
                let creditsToCharge = 2; // Default minimum
                
                // Check if user has enough credits (use minimum estimate)
                if (credits < creditsToCharge) {
                  throw new Error(
                    `Insufficient credits. This video requires at least ${creditsToCharge} credits, ` +
                    `but you only have ${credits} credits.`
                  );
                }
                
                // Store generation as queued when we get request_id
                let generationId = null;
                let requestId = null;
                
                const result = await generateVideo(
                  videoUrl, 
                  imageUrl, 
                  {
                    resolution: '480p',
                    videoQuality: 'high',
                    videoWriteMode: 'balanced'
                  },
                  async (progress, request_id) => {
                    setProgress(progress);
                    
                    // When we get the request_id (around 30% progress), store as queued
                    if (request_id && !generationId) {
                      requestId = request_id;
                      try {
                        const genResult = await addGeneration(userIdentifier, {
                          prompt: 'Video Animate Replace',
                          style: 'Wan 2.2 Animate',
                          requestId: request_id,
                          status: 'queued',
                          creditsUsed: creditsToCharge,
                          userId: isEmailAuth ? emailContext.userId : undefined,
                          email: isEmailAuth ? emailContext.email : undefined
                        });
                        generationId = genResult.generationId;
                        logger.info('Video generation queued and stored', { generationId, request_id });
                      } catch (storeError) {
                        logger.warn('Failed to store queued generation', { error: storeError.message });
                        // Continue even if storage fails
                      }
                    }
                  }
                );
                
                // Get video duration and calculate final credits
                try {
                  videoDuration = await getVideoDuration(result);
                  creditsToCharge = calculateVideoCredits(videoDuration);
                  logger.info('Video duration calculated', { 
                    duration: videoDuration, 
                    creditsToCharge 
                  });
                } catch (durationError) {
                  logger.warn('Failed to get video duration, using minimum credits', { 
                    error: durationError.message 
                  });
                  // Use minimum 2 credits if we can't determine duration
                }
                
                // Update generation with video URL when completed
                if (generationId) {
                  try {
                    const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
                    await fetch(`${API_URL}/api/generations/update/${generationId}`, {
                      method: 'PUT',
                      headers: {
                        'Content-Type': 'application/json'
                      },
                      body: JSON.stringify({
                        walletAddress: !isEmailAuth ? userIdentifier : undefined,
                        userId: isEmailAuth ? userIdentifier : undefined,
                        email: isEmailAuth ? emailContext.email : undefined,
                        videoUrl: result,
                        status: 'completed'
                      })
                    });
                    logger.info('Video generation updated in database', { generationId, videoUrl: result });
                  } catch (updateError) {
                    logger.warn('Failed to update generation', { error: updateError.message });
                    // Continue even if update fails
                  }
                } else {
                  // If we didn't store as queued, store now as completed
                  try {
                    await addGeneration(userIdentifier, {
                      prompt: 'Video Animate Replace',
                      style: 'Wan 2.2 Animate',
                      videoUrl: result,
                      status: 'completed',
                      creditsUsed: creditsToCharge,
                      userId: isEmailAuth ? emailContext.userId : undefined,
                      email: isEmailAuth ? emailContext.email : undefined
                    });
                    logger.info('Video generation stored as completed', { videoUrl: result });
                  } catch (storeError) {
                    logger.warn('Failed to store completed generation', { error: storeError.message });
                  }
                }
                
                logger.info('Video generation completed', {
                  duration: videoDuration,
                  creditsCharged: creditsToCharge,
                  remainingCredits: credits - creditsToCharge
                });
                
                setGeneratedVideoUrl(result);
                setProgress(100);
                
                // Refresh credits
                if (isEmailAuth) {
                  emailContext.refreshCredits();
                } else {
                  walletContext.refreshCredits();
                }
              } catch (err) {
                setError(err.message || 'Failed to generate video');
                setProgress(0);
              } finally {
                setIsGenerating(false);
              }
            }}
            onClear={handleClear}
            hasInputs={!!videoUrl && !!imageUrl}
            credits={credits}
            isEmailAuth={isEmailAuth}
          />
        </div>
      </div>
    </div>
  );
}

export default VideoTab;

