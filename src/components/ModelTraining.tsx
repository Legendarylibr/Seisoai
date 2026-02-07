import { useState, useEffect, useCallback, useRef } from 'react';
import { Upload, Cpu, Play, CheckCircle, XCircle, Clock, Trash2, Sparkles, Wand2, Loader2, Info, Image as ImageIcon, Zap } from 'lucide-react';
import { useSimpleWallet } from '../contexts/SimpleWalletContext';
import { WIN95, BTN, PANEL, TITLEBAR, INPUT } from '../utils/buttonStyles';
import logger from '../utils/logger';
import {
  submitTraining,
  checkTrainingStatus,
  getTrainingResult,
  getTrainedModels,
  deleteTrainedModel,
  calculateTrainingCost,
  TRAINERS,
  LORA_INFERENCE_CREDITS,
  type TrainerType,
  type TrainedModel,
  type TrainingConfig
} from '../services/trainingService';
import { API_URL, ensureCSRFToken } from '../utils/apiConfig';

// ============================================================================
// Sub-components
// ============================================================================

/** Training job status polling interval */
const POLL_INTERVAL = 5000;

interface TrainerCardProps {
  id: TrainerType;
  name: string;
  description: string;
  features: string[];
  isSelected: boolean;
  onSelect: () => void;
}

function TrainerCard({ id, name, description, features, isSelected, onSelect }: TrainerCardProps) {
  return (
    <button
      onClick={onSelect}
      className="flex-1 text-left p-3 min-w-[200px]"
      style={isSelected ? {
        background: WIN95.highlight,
        color: WIN95.highlightText,
        border: 'none',
        boxShadow: `inset 1px 1px 0 ${WIN95.border.darker}, inset -1px -1px 0 ${WIN95.border.light}`,
        fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
      } : {
        background: WIN95.buttonFace,
        color: WIN95.text,
        border: 'none',
        boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}, inset 2px 2px 0 ${WIN95.bgLight}, inset -2px -2px 0 ${WIN95.bgDark}`,
        fontFamily: 'Tahoma, "MS Sans Serif", sans-serif',
        cursor: 'pointer'
      }}
    >
      <div className="flex items-center gap-2 mb-1">
        {id === 'flux-lora-fast' ? <Zap className="w-4 h-4" /> : <Wand2 className="w-4 h-4" />}
        <span className="text-[11px] font-bold">{name}</span>
      </div>
      <p className="text-[9px] mb-2" style={{ opacity: 0.85 }}>{description}</p>
      <ul className="space-y-0.5">
        {features.slice(0, 3).map((f, i) => (
          <li key={i} className="text-[8px] flex items-center gap-1" style={{ opacity: 0.75 }}>
            <CheckCircle className="w-2.5 h-2.5 flex-shrink-0" />
            <span>{f}</span>
          </li>
        ))}
      </ul>
    </button>
  );
}

interface TrainedModelCardProps {
  model: TrainedModel;
  onDelete: (id: string) => void;
  onGenerate: (model: TrainedModel) => void;
  onRefreshStatus: (model: TrainedModel) => void;
}

function TrainedModelCard({ model, onDelete, onGenerate, onRefreshStatus }: TrainedModelCardProps) {
  const statusColor = model.status === 'ready'
    ? WIN95.successText || 'green'
    : model.status === 'failed'
      ? WIN95.errorText || 'red'
      : WIN95.warningText || 'orange';

  const StatusIcon = model.status === 'ready' ? CheckCircle
    : model.status === 'failed' ? XCircle
    : Clock;

  return (
    <div
      className="p-2"
      style={{
        background: WIN95.bg,
        boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}`,
        fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
      }}
    >
      <div className="flex items-center justify-between mb-1">
        <div className="flex items-center gap-1.5">
          <StatusIcon className="w-3.5 h-3.5" style={{ color: statusColor }} />
          <span className="text-[10px] font-bold" style={{ color: WIN95.text }}>{model.name}</span>
        </div>
        <div className="flex items-center gap-1">
          {model.status === 'training' && (
            <button
              onClick={() => onRefreshStatus(model)}
              className="p-1"
              style={BTN.small}
              title="Check status"
            >
              <Loader2 className="w-3 h-3 animate-spin" />
            </button>
          )}
          {model.status === 'ready' && (
            <button
              onClick={() => onGenerate(model)}
              className="px-2 py-1 flex items-center gap-1"
              style={{
                ...BTN.base,
                fontSize: '9px',
                fontWeight: 'bold'
              }}
              title="Generate with this model"
            >
              <Sparkles className="w-3 h-3" />
              <span>Use</span>
            </button>
          )}
          <button
            onClick={() => onDelete(model.id)}
            className="p-1"
            style={BTN.small}
            title="Delete model"
          >
            <Trash2 className="w-3 h-3" style={{ color: WIN95.errorText || 'red' }} />
          </button>
        </div>
      </div>
      <div className="flex items-center gap-2 text-[8px]" style={{ color: WIN95.textDisabled }}>
        <span>{model.trainer === 'flux-lora-fast' ? 'FLUX LoRA' : 'FLUX 2'}</span>
        {model.triggerWord && <span>Trigger: <strong>{model.triggerWord}</strong></span>}
        <span>{new Date(model.createdAt).toLocaleDateString()}</span>
      </div>
    </div>
  );
}

// ============================================================================
// LoRA Generation Panel
// ============================================================================

interface LoraGenerationPanelProps {
  selectedModel: TrainedModel;
  onClose: () => void;
  userIdentity: { walletAddress?: string; userId?: string };
}

function LoraGenerationPanel({ selectedModel, onClose, userIdentity }: LoraGenerationPanelProps) {
  const [prompt, setPrompt] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedImages, setGeneratedImages] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [loraScale, setLoraScale] = useState(1.0);

  const handleGenerate = useCallback(async () => {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    setError('');
    setGeneratedImages([]);

    try {
      const csrfToken = await ensureCSRFToken();
      const response = await fetch(`${API_URL}/api/training/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(csrfToken && { 'X-CSRF-Token': csrfToken })
        },
        credentials: 'include',
        body: JSON.stringify({
          prompt: prompt.trim(),
          lora_url: selectedModel.loraUrl,
          lora_scale: loraScale,
          trigger_word: selectedModel.triggerWord,
          num_images: 1,
          ...userIdentity
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Generation failed' }));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      if (data.images && data.images.length > 0) {
        setGeneratedImages(data.images);
      }
    } catch (err) {
      const e = err as Error;
      setError(e.message);
      logger.error('LoRA generation failed', { error: e.message });
    } finally {
      setIsGenerating(false);
    }
  }, [prompt, selectedModel, loraScale, userIdentity]);

  return (
    <div style={{
      background: WIN95.bg,
      boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}, inset 2px 2px 0 ${WIN95.bgLight}, inset -2px -2px 0 ${WIN95.bgDark}`
    }}>
      {/* Title bar */}
      <div className="flex items-center justify-between px-2 py-1" style={TITLEBAR.active}>
        <div className="flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5" />
          <span className="text-[10px] font-bold">Generate with {selectedModel.name}</span>
        </div>
        <button
          onClick={onClose}
          className="w-4 h-3.5 flex items-center justify-center text-[9px] font-bold"
          style={{
            background: WIN95.buttonFace,
            boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}`,
            color: WIN95.text,
            border: 'none',
            cursor: 'pointer'
          }}
        >
          X
        </button>
      </div>

      <div className="p-3 space-y-2">
        {/* Trigger word hint */}
        {selectedModel.triggerWord && (
          <div className="flex items-center gap-1.5 p-1.5 text-[9px]" style={{
            background: WIN95.inputBg,
            boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`,
            color: WIN95.text,
            fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
          }}>
            <Info className="w-3 h-3 flex-shrink-0" />
            <span>Trigger word "<strong>{selectedModel.triggerWord}</strong>" will be automatically prepended</span>
          </div>
        )}

        {/* Prompt */}
        <div>
          <label className="text-[10px] font-bold block mb-1" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
            Prompt
          </label>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the image you want to generate..."
            rows={3}
            className="w-full px-2 py-1.5 text-[11px] resize-none"
            style={INPUT.base}
          />
        </div>

        {/* LoRA Scale */}
        <div className="flex items-center gap-2">
          <label className="text-[9px] font-bold flex-shrink-0" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
            LoRA Scale:
          </label>
          <input
            type="range"
            min="0.1"
            max="2.0"
            step="0.1"
            value={loraScale}
            onChange={(e) => setLoraScale(Number(e.target.value))}
            className="flex-1"
          />
          <span className="text-[9px] font-mono w-8 text-right" style={{ color: WIN95.text }}>{loraScale.toFixed(1)}</span>
        </div>

        {/* Generate button */}
        <button
          onClick={handleGenerate}
          disabled={isGenerating || !prompt.trim()}
          className="w-full flex items-center justify-center gap-2 px-4 py-2"
          style={isGenerating || !prompt.trim() ? BTN.disabled : {
            background: 'var(--win95-active-title)',
            color: '#ffffff',
            border: 'none',
            boxShadow: `inset 1px 1px 0 var(--win95-highlight), inset -1px -1px 0 var(--win95-border-darker)`,
            cursor: 'pointer',
            fontFamily: 'Tahoma, "MS Sans Serif", sans-serif',
            fontSize: '11px',
            fontWeight: 'bold'
          }}
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Generating...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              <span>Generate ({LORA_INFERENCE_CREDITS} credits)</span>
            </>
          )}
        </button>

        {/* Error */}
        {error && (
          <div className="p-2 text-[10px]" style={{
            background: WIN95.errorBg || '#fff0f0',
            color: WIN95.errorText || '#cc0000',
            fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
          }}>
            {error}
          </div>
        )}

        {/* Generated images */}
        {generatedImages.length > 0 && (
          <div className="space-y-2">
            <div className="text-[10px] font-bold" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
              Generated Images
            </div>
            <div className="grid grid-cols-1 gap-2">
              {generatedImages.map((url, i) => (
                <div key={i} style={{ ...PANEL.sunken, padding: '4px' }}>
                  <img
                    src={url}
                    alt={`Generated ${i + 1}`}
                    className="w-full h-auto"
                    style={{ imageRendering: 'auto' }}
                  />
                  <a
                    href={url}
                    download={`lora-generation-${Date.now()}.png`}
                    className="block mt-1 text-center text-[9px] font-bold px-2 py-1"
                    style={BTN.base}
                  >
                    Download
                  </a>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

const ModelTraining: React.FC = () => {
  const { isConnected, address, credits } = useSimpleWallet();

  // Training form state
  const [selectedTrainer, setSelectedTrainer] = useState<TrainerType>('flux-lora-fast');
  const [triggerWord, setTriggerWord] = useState('');
  const [steps, setSteps] = useState(1000);
  const [isStyle, setIsStyle] = useState(false);
  const [createMasks, setCreateMasks] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitSuccess, setSubmitSuccess] = useState('');

  // File upload state
  const [zipFile, setZipFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Trained models state
  const [trainedModels, setTrainedModels] = useState<TrainedModel[]>([]);
  const [isLoadingModels, setIsLoadingModels] = useState(false);

  // Generation state
  const [generatingModel, setGeneratingModel] = useState<TrainedModel | null>(null);

  // Tab state
  const [activeSubTab, setActiveSubTab] = useState<'train' | 'models'>('train');

  // User identity
  const userIdentity = {
    walletAddress: address || undefined,
  };

  // Load trained models on mount
  useEffect(() => {
    if (isConnected && address) {
      loadTrainedModels();
    }
  }, [isConnected, address]);

  const loadTrainedModels = useCallback(async () => {
    setIsLoadingModels(true);
    try {
      const models = await getTrainedModels(userIdentity);
      setTrainedModels(models);
    } catch (err) {
      logger.error('Failed to load trained models', { error: (err as Error).message });
    } finally {
      setIsLoadingModels(false);
    }
  }, [address]);

  // File upload handler
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.endsWith('.zip')) {
        setSubmitError('Please upload a .zip file containing your training images');
        return;
      }
      if (file.size > 100 * 1024 * 1024) {
        setSubmitError('File size must be under 100MB');
        return;
      }
      setZipFile(file);
      setSubmitError('');
    }
  }, []);

  // Upload zip to FAL storage via backend proxy
  const uploadZipFile = useCallback(async (file: File): Promise<string> => {
    setUploadProgress('Uploading training images...');
    const csrfToken = await ensureCSRFToken();

    // Read file as ArrayBuffer and send as raw body
    const arrayBuffer = await file.arrayBuffer();

    const response = await fetch(`${API_URL}/api/training/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/zip',
        ...(csrfToken && { 'X-CSRF-Token': csrfToken })
      },
      credentials: 'include',
      body: arrayBuffer
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error(errorData.error || `Upload failed: ${response.status}`);
    }

    const data = await response.json();
    setUploadProgress('');
    return data.url;
  }, [address]);

  // Submit training job
  const handleSubmitTraining = useCallback(async () => {
    if (!zipFile) {
      setSubmitError('Please select a .zip file with training images');
      return;
    }

    setIsSubmitting(true);
    setSubmitError('');
    setSubmitSuccess('');

    try {
      // First upload the zip file
      const imagesDataUrl = await uploadZipFile(zipFile);

      // Submit training
      const config: TrainingConfig = {
        trainer: selectedTrainer,
        imagesDataUrl: imagesDataUrl,
        triggerWord: triggerWord || undefined,
        steps,
        isStyle,
        createMasks
      };

      const result = await submitTraining(config, userIdentity);

      if (result.success) {
        setSubmitSuccess(result.message);
        setZipFile(null);
        setTriggerWord('');
        if (fileInputRef.current) fileInputRef.current.value = '';

        // Refresh trained models list
        await loadTrainedModels();

        // Switch to models tab
        setActiveSubTab('models');
      }
    } catch (err) {
      const e = err as Error;
      setSubmitError(e.message);
      logger.error('Training submission failed', { error: e.message });
    } finally {
      setIsSubmitting(false);
      setUploadProgress('');
    }
  }, [zipFile, selectedTrainer, triggerWord, steps, isStyle, createMasks, userIdentity, uploadZipFile, loadTrainedModels]);

  // Refresh training status
  const handleRefreshStatus = useCallback(async (model: TrainedModel) => {
    try {
      const status = await checkTrainingStatus(model.requestId || model.id, model.trainer);

      if (status.status === 'COMPLETED') {
        // Fetch the result
        const result = await getTrainingResult(model.requestId || model.id, model.trainer);
        if (result.success) {
          // Update local state
          setTrainedModels(prev => prev.map(m =>
            m.id === model.id ? { ...m, status: 'ready' as const, loraUrl: result.loraUrl } : m
          ));
        }
      } else if (status.status === 'FAILED') {
        setTrainedModels(prev => prev.map(m =>
          m.id === model.id ? { ...m, status: 'failed' as const } : m
        ));
      }
    } catch (err) {
      logger.error('Status refresh failed', { error: (err as Error).message });
    }
  }, []);

  // Delete trained model
  const handleDeleteModel = useCallback(async (modelId: string) => {
    try {
      await deleteTrainedModel(modelId, userIdentity);
      setTrainedModels(prev => prev.filter(m => m.id !== modelId));
    } catch (err) {
      logger.error('Delete model failed', { error: (err as Error).message });
    }
  }, [userIdentity]);

  const estimatedCost = calculateTrainingCost(selectedTrainer, steps);

  return (
    <div className="container mx-auto max-w-5xl p-2 sm:p-4 space-y-2">
      {/* Main window */}
      <div style={{
        background: WIN95.bg,
        boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}, inset 2px 2px 0 ${WIN95.bgLight}, inset -2px -2px 0 ${WIN95.bgDark}, 2px 2px 0 rgba(0,0,0,0.15)`
      }}>
        {/* Title bar */}
        <div className="flex items-center gap-1.5 px-2 py-1" style={TITLEBAR.active}>
          <Cpu className="w-4 h-4" />
          <span className="text-[11px] font-bold">Model Training</span>
          <span className="text-[9px] opacity-80 ml-1">- LoRA Fine-Tuning</span>
        </div>

        {/* Sub-tabs */}
        <div className="flex gap-0 px-2 pt-1" style={{ borderBottom: `1px solid ${WIN95.bgDark}` }}>
          <button
            onClick={() => setActiveSubTab('train')}
            className="px-3 py-1.5 text-[10px] font-bold"
            style={{
              background: activeSubTab === 'train' ? WIN95.bg : WIN95.bgDark,
              color: activeSubTab === 'train' ? WIN95.text : WIN95.textDisabled,
              border: 'none',
              boxShadow: activeSubTab === 'train'
                ? `inset 1px 1px 0 ${WIN95.border.light}, 1px 0 0 ${WIN95.border.darker}`
                : `inset 1px 1px 0 ${WIN95.border.dark}`,
              fontFamily: 'Tahoma, "MS Sans Serif", sans-serif',
              cursor: 'pointer',
              marginBottom: activeSubTab === 'train' ? '-1px' : '0',
              position: 'relative',
              zIndex: activeSubTab === 'train' ? 1 : 0
            }}
          >
            New Training
          </button>
          <button
            onClick={() => setActiveSubTab('models')}
            className="px-3 py-1.5 text-[10px] font-bold"
            style={{
              background: activeSubTab === 'models' ? WIN95.bg : WIN95.bgDark,
              color: activeSubTab === 'models' ? WIN95.text : WIN95.textDisabled,
              border: 'none',
              boxShadow: activeSubTab === 'models'
                ? `inset 1px 1px 0 ${WIN95.border.light}, 1px 0 0 ${WIN95.border.darker}`
                : `inset 1px 1px 0 ${WIN95.border.dark}`,
              fontFamily: 'Tahoma, "MS Sans Serif", sans-serif',
              cursor: 'pointer',
              marginBottom: activeSubTab === 'models' ? '-1px' : '0',
              position: 'relative',
              zIndex: activeSubTab === 'models' ? 1 : 0
            }}
          >
            My Models ({trainedModels.length})
          </button>
        </div>

        {/* Content */}
        <div className="p-3">
          {activeSubTab === 'train' ? (
            <div className="space-y-3">
              {/* Trainer selection */}
              <div>
                <div className="text-[10px] font-bold mb-1.5" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
                  Select Training Engine
                </div>
                <div className="flex flex-col sm:flex-row gap-2">
                  {TRAINERS.map(t => (
                    <TrainerCard
                      key={t.id}
                      id={t.id}
                      name={t.name}
                      description={t.description}
                      features={t.features}
                      isSelected={selectedTrainer === t.id}
                      onSelect={() => setSelectedTrainer(t.id)}
                    />
                  ))}
                </div>
              </div>

              {/* Training images upload */}
              <div>
                <label className="text-[10px] font-bold block mb-1" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
                  Training Images (.zip)
                </label>
                <div className="text-[8px] mb-1.5" style={{ color: WIN95.textDisabled, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
                  Upload a .zip archive with at least 4 images. Optionally include .txt caption files with same filenames.
                </div>
                <div className="flex items-center gap-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".zip"
                    onChange={handleFileChange}
                    className="hidden"
                    id="training-zip-upload"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-1.5 px-3 py-1.5"
                    style={BTN.base}
                  >
                    <Upload className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-bold">Browse...</span>
                  </button>
                  <div className="flex-1 px-2 py-1 text-[10px] truncate" style={{
                    ...INPUT.base,
                    minHeight: '24px',
                    display: 'flex',
                    alignItems: 'center'
                  }}>
                    {zipFile ? (
                      <span>{zipFile.name} ({(zipFile.size / 1024 / 1024).toFixed(1)} MB)</span>
                    ) : (
                      <span style={{ color: WIN95.textDisabled }}>No file selected</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Trigger word */}
              <div>
                <label className="text-[10px] font-bold block mb-1" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
                  Trigger Word (optional)
                </label>
                <div className="text-[8px] mb-1" style={{ color: WIN95.textDisabled, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
                  A unique word that activates the trained style/subject (e.g., "MYCHARACTER", "MYSTYLE")
                </div>
                <input
                  type="text"
                  value={triggerWord}
                  onChange={(e) => setTriggerWord(e.target.value)}
                  placeholder="e.g., MYSUBJECT"
                  className="w-full sm:w-64 px-2 py-1 text-[11px]"
                  style={INPUT.base}
                />
              </div>

              {/* Steps */}
              <div>
                <label className="text-[10px] font-bold block mb-1" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
                  Training Steps: {steps}
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min="100"
                    max="5000"
                    step="100"
                    value={steps}
                    onChange={(e) => setSteps(Number(e.target.value))}
                    className="flex-1 max-w-xs"
                  />
                  <input
                    type="number"
                    value={steps}
                    onChange={(e) => setSteps(Math.min(5000, Math.max(100, Number(e.target.value) || 100)))}
                    className="w-20 px-2 py-1 text-[10px] text-center"
                    style={INPUT.base}
                  />
                </div>
                <div className="text-[8px] mt-0.5" style={{ color: WIN95.textDisabled, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
                  More steps = better quality but higher cost. 1000 is recommended for most use cases.
                </div>
              </div>

              {/* Options row */}
              <div className="flex flex-wrap items-center gap-4">
                {/* Style LoRA toggle */}
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isStyle}
                    onChange={(e) => setIsStyle(e.target.checked)}
                  />
                  <span className="text-[10px] font-bold" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
                    Style LoRA
                  </span>
                  <span className="text-[8px]" style={{ color: WIN95.textDisabled }}>(disables auto-captioning)</span>
                </label>

                {/* Create masks toggle (only for flux-lora-fast) */}
                {selectedTrainer === 'flux-lora-fast' && (
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={createMasks}
                      onChange={(e) => setCreateMasks(e.target.checked)}
                    />
                    <span className="text-[10px] font-bold" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
                      Create Masks
                    </span>
                    <span className="text-[8px]" style={{ color: WIN95.textDisabled }}>(segmentation for subjects)</span>
                  </label>
                )}
              </div>

              {/* Cost estimate */}
              <div className="flex items-center gap-2 p-2" style={{
                background: WIN95.inputBg,
                boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`,
              }}>
                <Info className="w-3.5 h-3.5 flex-shrink-0" style={{ color: WIN95.text }} />
                <div className="text-[10px]" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
                  <strong>Estimated cost:</strong> {estimatedCost} credits ({steps} steps)
                  {(credits || 0) < estimatedCost && (
                    <span style={{ color: WIN95.errorText || '#cc0000' }}>
                      {' '} — Insufficient credits (you have {credits || 0})
                    </span>
                  )}
                </div>
              </div>

              {/* Upload progress */}
              {uploadProgress && (
                <div className="flex items-center gap-2 p-2" style={{
                  background: WIN95.bg,
                  boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`,
                }}>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: WIN95.text }} />
                  <span className="text-[10px]" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
                    {uploadProgress}
                  </span>
                </div>
              )}

              {/* Error */}
              {submitError && (
                <div className="p-2 text-[10px]" style={{
                  background: WIN95.errorBg || '#fff0f0',
                  color: WIN95.errorText || '#cc0000',
                  fontFamily: 'Tahoma, "MS Sans Serif", sans-serif',
                  boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`
                }}>
                  {submitError}
                </div>
              )}

              {/* Success */}
              {submitSuccess && (
                <div className="p-2 text-[10px]" style={{
                  background: '#f0fff0',
                  color: WIN95.successText || '#008000',
                  fontFamily: 'Tahoma, "MS Sans Serif", sans-serif',
                  boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`
                }}>
                  {submitSuccess}
                </div>
              )}

              {/* Submit button */}
              <button
                onClick={handleSubmitTraining}
                disabled={isSubmitting || !zipFile || (credits || 0) < estimatedCost}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5"
                style={isSubmitting || !zipFile || (credits || 0) < estimatedCost ? {
                  ...BTN.disabled,
                  fontSize: '12px',
                  fontWeight: 'bold'
                } : {
                  background: 'var(--win95-active-title)',
                  color: '#ffffff',
                  border: 'none',
                  boxShadow: `inset 1px 1px 0 var(--win95-highlight), inset -1px -1px 0 var(--win95-border-darker), 2px 2px 0 var(--win95-border-darker)`,
                  cursor: 'pointer',
                  fontFamily: 'Tahoma, "MS Sans Serif", sans-serif',
                  fontSize: '12px',
                  fontWeight: 'bold',
                  textShadow: '1px 1px 0 rgba(0, 0, 0, 0.4)'
                }}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Submitting Training Job...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    <span>Start Training ({estimatedCost} credits)</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            /* Models tab */
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="text-[10px] font-bold" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
                  Trained Models
                </div>
                <button
                  onClick={loadTrainedModels}
                  className="flex items-center gap-1 px-2 py-1"
                  style={BTN.base}
                  disabled={isLoadingModels}
                >
                  <Loader2 className={`w-3 h-3 ${isLoadingModels ? 'animate-spin' : ''}`} />
                  <span className="text-[9px] font-bold">Refresh</span>
                </button>
              </div>

              {isLoadingModels ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="w-6 h-6 animate-spin" style={{ color: WIN95.text }} />
                </div>
              ) : trainedModels.length === 0 ? (
                <div className="text-center p-8" style={{
                  background: WIN95.inputBg,
                  boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`,
                }}>
                  <Cpu className="w-8 h-8 mx-auto mb-2" style={{ color: WIN95.textDisabled }} />
                  <p className="text-[11px] font-bold mb-1" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
                    No trained models yet
                  </p>
                  <p className="text-[9px]" style={{ color: WIN95.textDisabled, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
                    Train a LoRA model to see it here. You can then use it to generate custom images.
                  </p>
                  <button
                    onClick={() => setActiveSubTab('train')}
                    className="mt-3 flex items-center gap-1.5 mx-auto px-3 py-1.5"
                    style={BTN.base}
                  >
                    <Play className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-bold">Start Training</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {trainedModels.map(model => (
                    <TrainedModelCard
                      key={model.id}
                      model={model}
                      onDelete={handleDeleteModel}
                      onGenerate={(m) => setGeneratingModel(m)}
                      onRefreshStatus={handleRefreshStatus}
                    />
                  ))}
                </div>
              )}

              {/* LoRA Generation Panel */}
              {generatingModel && (
                <LoraGenerationPanel
                  selectedModel={generatingModel}
                  onClose={() => setGeneratingModel(null)}
                  userIdentity={userIdentity}
                />
              )}
            </div>
          )}
        </div>
      </div>

      {/* Help section */}
      <div style={{
        background: WIN95.bg,
        boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}, inset 2px 2px 0 ${WIN95.bgLight}, inset -2px -2px 0 ${WIN95.bgDark}`
      }}>
        <div className="flex items-center gap-1.5 px-2 py-1" style={TITLEBAR.active}>
          <Info className="w-3.5 h-3.5" />
          <span className="text-[10px] font-bold">Training Guide</span>
        </div>
        <div className="p-3 text-[9px] space-y-2" style={{ color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }}>
          <div>
            <strong>How LoRA Training Works:</strong>
            <p className="mt-0.5" style={{ color: WIN95.textDisabled }}>
              LoRA (Low-Rank Adaptation) fine-tunes an AI model on your images without full retraining. 
              Train once, then generate unlimited variations of your subject or style.
            </p>
          </div>
          <div>
            <strong>Dataset Tips:</strong>
            <ul className="mt-0.5 space-y-0.5 ml-3" style={{ color: WIN95.textDisabled, listStyleType: 'disc' }}>
              <li>Use at least 4 high-quality images (more is better)</li>
              <li>Images should be consistent in subject/style</li>
              <li>Minimum 1024x1024px resolution recommended</li>
              <li>Include .txt caption files for better results</li>
              <li>For subjects: use varied poses, backgrounds, lighting</li>
              <li>For styles: use consistent artistic approach across images</li>
            </ul>
          </div>
          <div>
            <strong>FLUX LoRA Fast</strong> — Best for subjects (people, characters, objects). Includes auto-captioning and face segmentation. ~26 credits per 1000 steps.
          </div>
          <div>
            <strong>FLUX 2 Trainer</strong> — Best for styles and brand consistency. Higher quality output, supports up to 4MP. ~104 credits per 1000 steps.
          </div>
          <div>
            <strong>LoRA Generation</strong> — {LORA_INFERENCE_CREDITS} credits per image when generating with your trained model.
          </div>
        </div>
      </div>
    </div>
  );
};

export default ModelTraining;
