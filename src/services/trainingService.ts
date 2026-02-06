// Training service for fal.ai model fine-tuning (LoRA training)
// Supports FLUX LoRA Fast Training and FLUX 2 Trainer
import logger from '../utils/logger';
import { API_URL, apiFetch } from '../utils/apiConfig';

// ============================================================================
// Types
// ============================================================================

export type TrainerType = 'flux-lora-fast' | 'flux-2-trainer';

export interface TrainingConfig {
  /** Trainer to use */
  trainer: TrainerType;
  /** URL to zip archive with images (at least 4 images recommended) */
  imagesDataUrl: string;
  /** Trigger word for the LoRA (e.g., "MYSUBJECT") */
  triggerWord?: string;
  /** Number of training steps (default: 1000) */
  steps?: number;
  /** Whether this is a style LoRA (disables auto-captioning and segmentation) */
  isStyle?: boolean;
  /** Whether to create segmentation masks (default: true, only for flux-lora-fast) */
  createMasks?: boolean;
  /** Optional caption for the training dataset */
  defaultCaption?: string;
}

export interface TrainingSubmitResult {
  success: boolean;
  requestId: string;
  trainer: TrainerType;
  message: string;
  creditsDeducted?: number;
  remainingCredits?: number;
}

export interface TrainingStatusResult {
  status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  progress?: number;
  logs?: string[];
  message?: string;
}

export interface TrainingResult {
  success: boolean;
  loraUrl: string;
  configUrl?: string;
  trainer: TrainerType;
  triggerWord?: string;
}

export interface TrainedModel {
  id: string;
  name: string;
  trainer: TrainerType;
  loraUrl: string;
  triggerWord?: string;
  createdAt: string;
  status: 'training' | 'ready' | 'failed';
  requestId?: string;
}

// ============================================================================
// Training API calls
// ============================================================================

/**
 * Submit a training job to the backend
 */
export async function submitTraining(
  config: TrainingConfig,
  userIdentity: { walletAddress?: string; userId?: string; email?: string }
): Promise<TrainingSubmitResult> {
  const response = await apiFetch(`${API_URL}/api/training/submit`, {
    method: 'POST',
    body: JSON.stringify({
      trainer: config.trainer,
      images_data_url: config.imagesDataUrl,
      trigger_word: config.triggerWord || undefined,
      steps: config.steps || 1000,
      is_style: config.isStyle || false,
      create_masks: config.createMasks !== false,
      default_caption: config.defaultCaption || undefined,
      ...userIdentity
    })
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: `HTTP error: ${response.status}` }));
    throw new Error(errorData.error || errorData.detail || `Training submission failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Check the status of a training job
 */
export async function checkTrainingStatus(
  requestId: string,
  trainer: TrainerType
): Promise<TrainingStatusResult> {
  const response = await apiFetch(`${API_URL}/api/training/status/${requestId}?trainer=${trainer}`);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: `HTTP error: ${response.status}` }));
    throw new Error(errorData.error || `Status check failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Get the result of a completed training job
 */
export async function getTrainingResult(
  requestId: string,
  trainer: TrainerType
): Promise<TrainingResult> {
  const response = await apiFetch(`${API_URL}/api/training/result/${requestId}?trainer=${trainer}`);

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: `HTTP error: ${response.status}` }));
    throw new Error(errorData.error || `Result fetch failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Get all trained models for the current user
 */
export async function getTrainedModels(
  userIdentity: { walletAddress?: string; userId?: string; email?: string }
): Promise<TrainedModel[]> {
  // Skip network call entirely if no user identity is available
  if (!userIdentity.walletAddress && !userIdentity.userId && !userIdentity.email) {
    return [];
  }

  const params = new URLSearchParams();
  if (userIdentity.walletAddress) params.set('walletAddress', userIdentity.walletAddress);
  if (userIdentity.userId) params.set('userId', userIdentity.userId);
  if (userIdentity.email) params.set('email', userIdentity.email);

  const response = await apiFetch(`${API_URL}/api/training/models?${params}`);

  if (!response.ok) {
    // 401 is expected when session expired — return empty silently
    if (response.status === 401) return [];
    logger.warn('Failed to fetch trained models', { status: response.status });
    return [];
  }

  const data = await response.json();
  return data.models || [];
}

/**
 * Delete a trained model
 */
export async function deleteTrainedModel(
  modelId: string,
  userIdentity: { walletAddress?: string; userId?: string; email?: string }
): Promise<void> {
  const response = await apiFetch(`${API_URL}/api/training/models/${modelId}`, {
    method: 'DELETE',
    body: JSON.stringify(userIdentity)
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ error: `HTTP error: ${response.status}` }));
    throw new Error(errorData.error || `Delete failed: ${response.status}`);
  }
}

// ============================================================================
// Trainer info
// ============================================================================

export interface TrainerInfo {
  id: TrainerType;
  name: string;
  description: string;
  costPerStep: number;
  defaultSteps: number;
  features: string[];
  inferenceEndpoint: string;
}

// Pricing: 30% above fal.ai API cost, 1 credit = $0.10
// FLUX LoRA Fast: fal $0.002/step × 1.3 = $0.0026/step → 0.026 credits/step
// FLUX 2 Trainer: fal $0.008/step × 1.3 = $0.0104/step → 0.104 credits/step
// LoRA Inference:  fal ~$0.025/img × 1.3 = $0.0325/img → 0.35 credits/img
const CREDITS_PER_STEP: Record<TrainerType, number> = {
  'flux-lora-fast': 0.026,
  'flux-2-trainer': 0.104,
};

export const LORA_INFERENCE_CREDITS = 0.35;

export const TRAINERS: TrainerInfo[] = [
  {
    id: 'flux-lora-fast',
    name: 'FLUX LoRA Fast',
    description: 'Train styles, people, and subjects at blazing speeds. 10x faster training with auto-captioning and segmentation.',
    costPerStep: 0.026,
    defaultSteps: 1000,
    features: [
      'Auto-captioning & segmentation',
      'Subject & style training',
      'Face mask detection',
      'Fast training speed',
      'Commercial use'
    ],
    inferenceEndpoint: 'fal-ai/flux-lora-fast-training'
  },
  {
    id: 'flux-2-trainer',
    name: 'FLUX 2 Trainer',
    description: 'Fine-tune FLUX.2 [dev] with custom datasets. Create specialized LoRA adaptations for specific styles and domains.',
    costPerStep: 0.104,
    defaultSteps: 1000,
    features: [
      'Brand consistency training',
      'Character design',
      'Artistic styles & domains',
      'Up to 4MP resolution',
      'Commercial use'
    ],
    inferenceEndpoint: 'fal-ai/flux-2-trainer'
  }
];

/**
 * Calculate training cost in credits (30% above fal.ai API cost)
 * 1 credit = $0.10
 */
export function calculateTrainingCost(trainer: TrainerType, steps: number): number {
  const perStep = CREDITS_PER_STEP[trainer] || 0.104;
  return Math.ceil(perStep * steps * 10) / 10; // Round to 1 decimal
}
