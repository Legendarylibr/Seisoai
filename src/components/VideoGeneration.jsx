import React, { useState } from 'react';
import { useSimpleWallet } from '../contexts/SimpleWalletContext';
import { generateVideo } from '../services/veo3Service';
import { Video, Upload, Play, Loader } from 'lucide-react';
import ReferenceImageInput from './ReferenceImageInput';

const VideoGeneration = ({ onShowTokenPayment, onShowStripePayment }) => {
  const { credits, address } = useSimpleWallet();
  const [prompt, setPrompt] = useState('');
  const [image, setImage] = useState(null);
  const [aspectRatio, setAspectRatio] = useState('16:9');
  const [duration, setDuration] = useState('8s');
  const [generatedVideo, setGeneratedVideo] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);

  const handleImageChange = (selectedImage) => {
    setImage(selectedImage);
    setError('');
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      setError('Please enter a prompt');
      return;
    }

    if (credits < 5) {
      setError('Insufficient credits. Video generation costs 5 credits.');
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
          Create stunning videos with Google's Veo 3 AI model. Upload an image and describe the video you want.
        </p>
      </div>

      {/* Credits Info */}
      <div className="glass-effect rounded-xl p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Video className="w-5 h-5 text-purple-400" />
            <span className="text-gray-300">Cost: 5 credits per video</span>
          </div>
          <div className="text-purple-400 font-semibold">
            {credits} credits available
          </div>
        </div>
      </div>

      {/* Image Input */}
      <div className="glass-effect rounded-xl p-6">
        <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Upload className="w-5 h-5 text-purple-400" />
          Reference Image (Optional)
        </h3>
        <ReferenceImageInput onImageChange={handleImageChange} />
        {image && (
          <div className="mt-4">
            <img src={image} alt="Selected" className="max-w-full h-auto rounded-lg max-h-96" />
          </div>
        )}
      </div>

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
            <option value="16:9" className="bg-gray-800">16:9 (Landscape)</option>
            <option value="9:16" className="bg-gray-800">9:16 (Portrait)</option>
            <option value="1:1" className="bg-gray-800">1:1 (Square)</option>
          </select>
        </div>

        <div className="glass-effect rounded-xl p-4">
          <label className="block text-sm font-medium text-gray-300 mb-2">
            Duration
          </label>
          <select
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className="w-full p-3 rounded-lg bg-white/5 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-purple-400"
          >
            <option value="4s" className="bg-gray-800">4 seconds</option>
            <option value="6s" className="bg-gray-800">6 seconds</option>
            <option value="8s" className="bg-gray-800">8 seconds</option>
          </select>
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
          placeholder="Describe the video you want to generate. Be descriptive about the subject, context, action, style, camera motion, and ambiance..."
          className="w-full p-4 rounded-lg bg-white/5 border border-white/20 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-400 min-h-32"
          rows="5"
        />
        <p className="text-xs text-gray-400 mt-2">
          Include: subject, context, action, style, camera motion, composition, and ambiance for best results.
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
        <div className="glass-effect rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Play className="w-5 h-5 text-green-400" />
            Generated Video
          </h3>
          <video
            src={generatedVideo}
            controls
            className="w-full rounded-lg"
            autoPlay
          >
            Your browser does not support the video tag.
          </video>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 text-red-400">
          {error}
        </div>
      )}

      {/* Generate Button */}
      <div className="flex justify-center">
        <button
          onClick={handleGenerate}
          disabled={isGenerating || !prompt.trim() || credits < 5}
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
              Generate Video (5 credits)
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default VideoGeneration;

