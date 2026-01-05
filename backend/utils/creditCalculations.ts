/**
 * Credit calculation utilities
 * Centralized credit calculations for all generation types
 */
import { CREDITS } from '../config/constants';

/**
 * Calculate credits for video generation based on duration, audio, and quality
 * @param duration - Duration string like '4s', '6s', '8s'
 * @param hasAudio - Whether audio is generated
 * @param quality - 'fast' or 'quality'
 * @returns Number of credits required
 */
export function calculateVideoCredits(
  duration: string,
  hasAudio: boolean,
  quality: string
): number {
  const durationSeconds = parseInt(duration.replace('s', '')) || 8;
  
  let pricePerSecond: number;
  if (quality === 'quality') {
    pricePerSecond = hasAudio ? 0.825 : 0.55;
  } else {
    pricePerSecond = hasAudio ? 0.44 : 0.22;
  }
  
  const totalCost = durationSeconds * pricePerSecond;
  // Convert dollars to credits (1 credit = $0.20), minimum of VIDEO_GENERATION_MINIMUM
  return Math.max(CREDITS.VIDEO_GENERATION_MINIMUM, Math.ceil(totalCost / 0.20));
}

/**
 * Calculate credits for music generation based on duration
 * @param durationSeconds - Duration in seconds (clamped between 10-180)
 * @returns Number of credits required
 */
export function calculateMusicCredits(durationSeconds: number): number {
  // Clamp duration between 10 and 180 seconds
  const clampedDuration = Math.max(10, Math.min(180, durationSeconds));
  const minutes = clampedDuration / 60;
  // CREDITS.MUSIC_GENERATION_PER_MINUTE = 0.25 credits per minute
  // Round up to nearest 0.25
  return Math.max(CREDITS.MUSIC_GENERATION_PER_MINUTE, Math.ceil(minutes * 4) / 4);
}

/**
 * Calculate credits for image generation based on model
 * @param model - Model identifier
 * @returns Number of credits required
 */
export function calculateImageCredits(model: string | undefined): number {
  switch (model) {
    case 'flux-2':
      return CREDITS.IMAGE_GENERATION_FLUX_2;
    case 'nano-banana-pro':
      return CREDITS.IMAGE_GENERATION_NANO;
    case 'qwen-image-layered':
      return CREDITS.LAYER_EXTRACTION;
    default:
      return CREDITS.IMAGE_GENERATION;
  }
}

/**
 * Calculate credits for upscaling based on scale factor
 * @param scale - Scale factor (2 or 4)
 * @returns Number of credits required
 */
export function calculateUpscaleCredits(scale: number): number {
  return scale === 4 ? 1.0 : 0.5;
}

/**
 * Calculate credits for video-to-audio generation
 * @returns Number of credits required
 */
export function calculateVideoToAudioCredits(): number {
  return CREDITS.VIDEO_TO_AUDIO;
}


