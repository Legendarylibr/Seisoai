/**
 * Credit calculation utilities
 * Centralized credit calculations for all generation types
 */
import { CREDITS } from '../config/constants';

/**
 * Calculate credits for video generation based on duration, audio, quality, and model
 * @param duration - Duration string like '4s', '6s', '8s' or number of seconds
 * @param hasAudio - Whether audio is generated
 * @param quality - 'fast' or 'quality'
 * @param model - 'veo' (quality) or 'ltx' (cheap) - defaults to 'veo'
 * @returns Number of credits required
 */
export function calculateVideoCredits(
  duration: string | number,
  hasAudio: boolean,
  quality: string,
  model: string = 'veo'
): number {
  let durationSeconds: number;
  if (typeof duration === 'number') {
    durationSeconds = Number.isFinite(duration) ? duration : 8;
  } else if (typeof duration === 'string') {
    const parsed = parseInt(duration.replace('s', ''), 10);
    durationSeconds = (Number.isFinite(parsed) && parsed > 0) ? parsed : 8;
  } else {
    durationSeconds = 8;
  }
  
  // LTX-2 model - budget pricing with good margin
  if (model === 'ltx') {
    // LTX-2: 1 credit/s base, 1.25 credits/s with audio (API cost is ~$0.04/s)
    const creditsPerSecond = hasAudio ? 1.25 : 1.0;
    const totalCredits = durationSeconds * creditsPerSecond;
    return Math.max(CREDITS.VIDEO_LTX_MINIMUM, Math.ceil(totalCredits));
  }
  
  // Veo 3.1 model - quality pricing (existing)
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
  // Validate input - default to 30 seconds if invalid
  const validDuration = (Number.isFinite(durationSeconds) && durationSeconds > 0) 
    ? durationSeconds 
    : 30;
  // Clamp duration between 10 and 180 seconds
  const clampedDuration = Math.max(10, Math.min(180, validDuration));
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
  // Validate input - only 2 or 4 are valid
  const validScale = (Number.isFinite(scale) && scale === 4) ? 4 : 2;
  return validScale === 4 ? 1.0 : 0.5;
}

/**
 * Calculate credits for video-to-audio generation
 * @returns Number of credits required
 */
export function calculateVideoToAudioCredits(): number {
  return CREDITS.VIDEO_TO_AUDIO;
}


