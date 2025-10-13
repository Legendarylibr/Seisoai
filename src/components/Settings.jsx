import React, { useState } from 'react';
import { useImageGenerator } from '../contexts/ImageGeneratorContext';
import { Settings as SettingsIcon, RotateCcw, Download, Trash2, Info, Upload } from 'lucide-react';

const Settings = () => {
  const {
    guidanceScale,
    setGuidanceScale,
    numInferenceSteps,
    setInferenceSteps,
    imageSize,
    setImageSize,
    numImages,
    setNumImages,
    enableSafetyChecker,
    setSafetyChecker,
    generationMode,
    setGenerationMode,
    clearAll,
    generationHistory
  } = useImageGenerator();

  const [showResetConfirm, setShowResetConfirm] = useState(false);

  const handleReset = () => {
    clearAll();
    setShowResetConfirm(false);
  };

  const handleExportSettings = () => {
    const settings = {
      guidanceScale,
      numInferenceSteps,
      imageSize,
      numImages,
      enableSafetyChecker,
      generationMode,
      exportDate: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'seiso-ai-settings.json';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleImportSettings = (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const settings = JSON.parse(e.target.result);
          if (settings.guidanceScale) setGuidanceScale(settings.guidanceScale);
          if (settings.numInferenceSteps) setInferenceSteps(settings.numInferenceSteps);
          if (settings.imageSize) setImageSize(settings.imageSize);
          if (settings.numImages) setNumImages(settings.numImages);
          if (settings.enableSafetyChecker !== undefined) setSafetyChecker(settings.enableSafetyChecker);
          if (settings.generationMode) setGenerationMode(settings.generationMode);
        } catch (error) {
          alert('Invalid settings file');
        }
      };
      reader.readAsText(file);
    }
  };

  const imageSizes = [
    { id: 'square_hd', name: 'Square HD', description: '1024x1024' },
    { id: 'square', name: 'Square', description: '512x512' },
    { id: 'portrait_4_3', name: 'Portrait 4:3', description: '768x1024' },
    { id: 'portrait_16_9', name: 'Portrait 16:9', description: '576x1024' },
    { id: 'landscape_4_3', name: 'Landscape 4:3', description: '1024x768' },
    { id: 'landscape_16_9', name: 'Landscape 16:9', description: '1024x576' }
  ];

  const generationModes = [
    { id: 'flux-pro', name: 'Flux Pro', description: 'Highest quality, slower generation' },
    { id: 'fast-sdxl', name: 'Fast SDXL', description: 'Fast generation, good quality' },
    { id: 'controlnet-canny', name: 'ControlNet Canny', description: 'Structure control, medium quality' }
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="flex items-center justify-center gap-3 mb-4">
          <SettingsIcon className="w-8 h-8 text-purple-400" />
          <h1 className="text-3xl font-bold gradient-text">Settings</h1>
        </div>
        <p className="text-gray-300 max-w-2xl mx-auto">
          Configure your AI image generation preferences and manage your data.
        </p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Generation Settings */}
        <div className="glass-effect rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-4">Generation Settings</h3>
          
          {/* Guidance Scale */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-300 mb-3">
              Guidance Scale: {guidanceScale}
            </label>
            <input
              type="range"
              min="1"
              max="20"
              step="0.5"
              value={guidanceScale}
              onChange={(e) => setGuidanceScale(parseFloat(e.target.value))}
              className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer slider"
            />
            <p className="text-xs text-gray-500 mt-1">
              Higher values follow the prompt more closely (1-20)
            </p>
          </div>

          {/* Inference Steps */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-300 mb-3">
              Inference Steps: {numInferenceSteps}
            </label>
            <input
              type="range"
              min="10"
              max="50"
              value={numInferenceSteps}
              onChange={(e) => setInferenceSteps(parseInt(e.target.value))}
              className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer slider"
            />
            <p className="text-xs text-gray-500 mt-1">
              More steps = higher quality but slower generation (10-50)
            </p>
          </div>

          {/* Number of Images */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-300 mb-3">
              Number of Images: {numImages}
            </label>
            <input
              type="range"
              min="1"
              max="4"
              value={numImages}
              onChange={(e) => setNumImages(parseInt(e.target.value))}
              className="w-full h-2 bg-white/20 rounded-lg appearance-none cursor-pointer slider"
            />
            <p className="text-xs text-gray-500 mt-1">
              Generate multiple variations (1-4)
            </p>
          </div>

          {/* Image Size */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-300 mb-3">
              Default Image Size
            </label>
            <select
              value={imageSize}
              onChange={(e) => setImageSize(e.target.value)}
              className="w-full p-3 rounded-lg bg-white/10 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-purple-400"
            >
              {imageSizes.map((size) => (
                <option key={size.id} value={size.id} className="bg-slate-800">
                  {size.name} - {size.description}
                </option>
              ))}
            </select>
          </div>

          {/* Generation Mode */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-300 mb-3">
              Default Generation Mode
            </label>
            <select
              value={generationMode}
              onChange={(e) => setGenerationMode(e.target.value)}
              className="w-full p-3 rounded-lg bg-white/10 border border-white/20 text-white focus:outline-none focus:ring-2 focus:ring-purple-400"
            >
              {generationModes.map((mode) => (
                <option key={mode.id} value={mode.id} className="bg-slate-800">
                  {mode.name} - {mode.description}
                </option>
              ))}
            </select>
          </div>

          {/* Safety Checker */}
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium text-gray-300">
                Safety Checker
              </label>
              <p className="text-xs text-gray-500">
                Automatically filter inappropriate content
              </p>
            </div>
            <button
              onClick={() => setSafetyChecker(!enableSafetyChecker)}
              className={`
                relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                ${enableSafetyChecker ? 'bg-purple-500' : 'bg-gray-600'}
              `}
            >
              <span
                className={`
                  inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                  ${enableSafetyChecker ? 'translate-x-6' : 'translate-x-1'}
                `}
              />
            </button>
          </div>
        </div>

        {/* Data Management */}
        <div className="glass-effect rounded-xl p-6">
          <h3 className="text-lg font-semibold mb-4">Data Management</h3>
          
          {/* Statistics */}
          <div className="mb-6 p-4 bg-gradient-to-r from-purple-500/10 to-pink-500/10 rounded-lg">
            <h4 className="font-medium text-purple-300 mb-2">Your Statistics</h4>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-400">Images Generated:</span>
                <div className="font-semibold text-white">{generationHistory.length}</div>
              </div>
              <div>
                <span className="text-gray-400">Storage Used:</span>
                <div className="font-semibold text-white">
                  {Math.round(generationHistory.length * 0.5)} MB
                </div>
              </div>
            </div>
          </div>

          {/* Export/Import */}
          <div className="space-y-4 mb-6">
            <div>
              <h4 className="font-medium text-gray-300 mb-2">Settings</h4>
              <div className="flex gap-2">
                <button
                  onClick={handleExportSettings}
                  className="btn-secondary flex items-center gap-2 flex-1"
                >
                  <Download className="w-4 h-4" />
                  Export Settings
                </button>
                <label className="btn-secondary flex items-center gap-2 flex-1 cursor-pointer">
                  <Upload className="w-4 h-4" />
                  Import Settings
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleImportSettings}
                    className="hidden"
                  />
                </label>
              </div>
            </div>
          </div>

          {/* Reset */}
          <div className="border-t border-white/10 pt-6">
            <h4 className="font-medium text-gray-300 mb-2">Reset</h4>
            <p className="text-sm text-gray-400 mb-4">
              Clear all generated images and reset settings to defaults.
            </p>
            {!showResetConfirm ? (
              <button
                onClick={() => setShowResetConfirm(true)}
                className="btn-secondary flex items-center gap-2 w-full"
              >
                <RotateCcw className="w-4 h-4" />
                Reset All Data
              </button>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-red-400">
                  Are you sure? This action cannot be undone.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleReset}
                    className="btn-primary flex items-center gap-2 flex-1"
                  >
                    <Trash2 className="w-4 h-4" />
                    Yes, Reset
                  </button>
                  <button
                    onClick={() => setShowResetConfirm(false)}
                    className="btn-secondary flex-1"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* API Info */}
      <div className="glass-effect rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <Info className="w-5 h-5 text-blue-400" />
          <h3 className="text-lg font-semibold">API Information</h3>
        </div>
        <div className="grid md:grid-cols-2 gap-6 text-sm">
          <div>
            <h4 className="font-medium text-gray-300 mb-2">FAL.ai Models</h4>
            <ul className="space-y-1 text-gray-400">
              <li>• Flux 1.1 Pro - High quality generation</li>
              <li>• Fast SDXL - Quick generation</li>
              <li>• ControlNet Canny - Structure control</li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium text-gray-300 mb-2">Features</h4>
            <ul className="space-y-1 text-gray-400">
              <li>• Multiple image sizes</li>
              <li>• Batch processing</li>
              <li>• Advanced controls</li>
              <li>• Style presets</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
