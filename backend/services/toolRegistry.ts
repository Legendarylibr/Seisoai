/**
 * Tool Registry Service
 * Central registry of ALL AI inference capabilities as structured, invokable tools.
 * This is the foundation of the agentic gateway - every capability is a tool
 * that can be discovered, priced, and invoked by external agents.
 * 
 * Supports: MCP tool discovery, x402 pricing, JSON Schema validation
 */
import logger from '../utils/logger';
import { FAL_API_COSTS } from '../middleware/x402Payment';

// ============================================
// Core Types
// ============================================

export interface ToolParameter {
  type: string;
  description?: string;
  enum?: string[];
  default?: unknown;
  minimum?: number;
  maximum?: number;
  items?: { type: string; enum?: string[] };
  properties?: Record<string, ToolParameter>;
  required?: string[];
}

export interface ToolSchema {
  type: 'object';
  properties: Record<string, ToolParameter>;
  required: string[];
}

export interface ToolPricing {
  /** Base cost in USD */
  baseUsdCost: number;
  /** Cost per unit (second, minute, image, etc.) */
  perUnitCost?: number;
  /** Unit type for per-unit pricing */
  unitType?: 'second' | 'minute' | 'image' | 'step';
  /** Credit cost (1 credit = $0.10) */
  credits: number;
  /** Per-unit credit cost */
  perUnitCredits?: number;
  /** Markup multiplier (default 1.30 for x402) */
  markup: number;
}

export interface ToolDefinition {
  /** Unique tool identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Detailed description for agent consumption */
  description: string;
  /** Tool category */
  category: ToolCategory;
  /** Fal.ai model endpoint */
  falModel: string;
  /** Whether this uses queue (async) or sync */
  executionMode: 'sync' | 'queue';
  /** Input schema (JSON Schema) */
  inputSchema: ToolSchema;
  /** Output description */
  outputDescription: string;
  /** Output MIME types */
  outputMimeTypes: string[];
  /** Pricing information */
  pricing: ToolPricing;
  /** Whether the tool is currently available */
  enabled: boolean;
  /** Tags for search/filtering */
  tags: string[];
  /** Version */
  version: string;
}

export type ToolCategory = 
  | 'image-generation'
  | 'image-editing'
  | 'image-processing'
  | 'video-generation'
  | 'video-editing'
  | 'audio-generation'
  | 'audio-processing'
  | 'music-generation'
  | '3d-generation'
  | 'text-generation'
  | 'vision'
  | 'training'
  | 'utility';

// ============================================
// Tool Definitions - ALL fal.ai capabilities
// ============================================

const TOOLS: ToolDefinition[] = [
  // ============================================
  // IMAGE GENERATION
  // ============================================
  {
    id: 'image.generate.flux-pro-kontext',
    name: 'FLUX Pro Kontext - Text to Image',
    description: 'Generate high-quality images from text prompts using FLUX Pro Kontext. Best for creative, versatile image generation with fast results.',
    category: 'image-generation',
    falModel: 'fal-ai/flux-pro/kontext/text-to-image',
    executionMode: 'sync',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Text description of the image to generate' },
        image_size: {
          type: 'string',
          description: 'Output image dimensions',
          enum: ['square_hd', 'square', 'landscape_4_3', 'landscape_16_9', 'portrait_4_3', 'portrait_16_9'],
          default: 'landscape_4_3',
        },
        num_images: { type: 'number', description: 'Number of images to generate', default: 1, minimum: 1, maximum: 4 },
        seed: { type: 'number', description: 'Random seed for reproducibility' },
        guidance_scale: { type: 'number', description: 'Guidance scale for generation', default: 3.5, minimum: 1, maximum: 20 },
        output_format: { type: 'string', description: 'Output image format', enum: ['jpeg', 'png', 'webp'], default: 'jpeg' },
      },
      required: ['prompt'],
    },
    outputDescription: 'Array of generated image URLs',
    outputMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    pricing: { baseUsdCost: FAL_API_COSTS.FLUX_PRO_KONTEXT, credits: 0.5, markup: 1.30 },
    enabled: true,
    tags: ['image', 'text-to-image', 'flux', 'creative', 'fast'],
    version: '1.0.0',
  },
  {
    id: 'image.generate.flux-pro-kontext-edit',
    name: 'FLUX Pro Kontext - Image Editing',
    description: 'Edit an existing image using text instructions with FLUX Pro Kontext. Supports single image editing with natural language commands.',
    category: 'image-editing',
    falModel: 'fal-ai/flux-pro/kontext/max',
    executionMode: 'sync',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Text instruction for how to edit the image' },
        image_url: { type: 'string', description: 'URL of the image to edit' },
        image_size: {
          type: 'string',
          description: 'Output image dimensions',
          enum: ['square_hd', 'square', 'landscape_4_3', 'landscape_16_9', 'portrait_4_3', 'portrait_16_9'],
          default: 'landscape_4_3',
        },
        seed: { type: 'number', description: 'Random seed for reproducibility' },
        guidance_scale: { type: 'number', description: 'Guidance scale', default: 3.5 },
        output_format: { type: 'string', enum: ['jpeg', 'png', 'webp'], default: 'jpeg' },
      },
      required: ['prompt', 'image_url'],
    },
    outputDescription: 'Edited image URL',
    outputMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    pricing: { baseUsdCost: FAL_API_COSTS.FLUX_PRO_KONTEXT, credits: 0.5, markup: 1.30 },
    enabled: true,
    tags: ['image', 'editing', 'flux', 'image-to-image'],
    version: '1.0.0',
  },
  {
    id: 'image.generate.flux-pro-kontext-multi',
    name: 'FLUX Pro Kontext - Multi-Image Blending',
    description: 'Blend multiple reference images into a new image using FLUX Pro Kontext. Great for combining elements from different images.',
    category: 'image-editing',
    falModel: 'fal-ai/flux-pro/kontext/max/multi',
    executionMode: 'sync',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Text description of how to blend the images' },
        image_urls: {
          type: 'array',
          description: 'Array of image URLs to blend (first is base, others are references)',
          items: { type: 'string' },
        },
        image_size: {
          type: 'string',
          enum: ['square_hd', 'square', 'landscape_4_3', 'landscape_16_9', 'portrait_4_3', 'portrait_16_9'],
          default: 'landscape_4_3',
        },
        seed: { type: 'number', description: 'Random seed' },
        output_format: { type: 'string', enum: ['jpeg', 'png', 'webp'], default: 'jpeg' },
      },
      required: ['prompt', 'image_urls'],
    },
    outputDescription: 'Blended image URL',
    outputMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    pricing: { baseUsdCost: FAL_API_COSTS.FLUX_PRO_KONTEXT, credits: 1.0, markup: 1.30 },
    enabled: true,
    tags: ['image', 'blending', 'multi-image', 'flux'],
    version: '1.0.0',
  },
  {
    id: 'image.generate.flux-2',
    name: 'FLUX 2 - Text to Image',
    description: 'Generate photorealistic images with excellent text rendering using FLUX 2. Best for photorealistic content and images containing text.',
    category: 'image-generation',
    falModel: 'fal-ai/flux-2',
    executionMode: 'sync',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Text description of the image to generate' },
        image_size: {
          type: 'string',
          enum: ['square_hd', 'square', 'landscape_4_3', 'landscape_16_9', 'portrait_4_3', 'portrait_16_9'],
          default: 'landscape_4_3',
        },
        num_images: { type: 'number', default: 1, minimum: 1, maximum: 4 },
        seed: { type: 'number', description: 'Random seed' },
        guidance_scale: { type: 'number', default: 3.5 },
        output_format: { type: 'string', enum: ['jpeg', 'png', 'webp'], default: 'jpeg' },
      },
      required: ['prompt'],
    },
    outputDescription: 'Array of generated image URLs',
    outputMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    pricing: { baseUsdCost: FAL_API_COSTS.FLUX_2, credits: 0.65, markup: 1.30 },
    enabled: true,
    tags: ['image', 'text-to-image', 'flux-2', 'photorealistic', 'text-in-image'],
    version: '1.0.0',
  },
  {
    id: 'image.generate.flux-2-edit',
    name: 'FLUX 2 - Image Editing',
    description: 'Edit images with photorealistic quality using FLUX 2. Best for realistic edits and modifications.',
    category: 'image-editing',
    falModel: 'fal-ai/flux-2/edit',
    executionMode: 'sync',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Edit instruction' },
        image_url: { type: 'string', description: 'URL of image to edit' },
        image_size: {
          type: 'string',
          enum: ['square_hd', 'square', 'landscape_4_3', 'landscape_16_9', 'portrait_4_3', 'portrait_16_9'],
          default: 'landscape_4_3',
        },
        seed: { type: 'number' },
        output_format: { type: 'string', enum: ['jpeg', 'png', 'webp'], default: 'jpeg' },
      },
      required: ['prompt', 'image_url'],
    },
    outputDescription: 'Edited image URL',
    outputMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    pricing: { baseUsdCost: FAL_API_COSTS.FLUX_2, credits: 0.65, markup: 1.30 },
    enabled: true,
    tags: ['image', 'editing', 'flux-2', 'photorealistic'],
    version: '1.0.0',
  },
  {
    id: 'image.generate.nano-banana-pro',
    name: 'Nano Banana Pro - Text to Image',
    description: 'Generate images including 360° panoramas using Nano Banana Pro. Specialized for panoramic and immersive content.',
    category: 'image-generation',
    falModel: 'fal-ai/nano-banana-pro',
    executionMode: 'sync',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Text description' },
        image_size: {
          type: 'string',
          enum: ['square_hd', 'square', 'landscape_4_3', 'landscape_16_9', 'portrait_4_3', 'portrait_16_9'],
          default: 'landscape_4_3',
        },
        num_images: { type: 'number', default: 1, minimum: 1, maximum: 4 },
        seed: { type: 'number' },
        output_format: { type: 'string', enum: ['jpeg', 'png', 'webp'], default: 'jpeg' },
      },
      required: ['prompt'],
    },
    outputDescription: 'Array of generated image URLs (supports 360° panorama)',
    outputMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    pricing: { baseUsdCost: FAL_API_COSTS.NANO_BANANA, credits: 0.7, markup: 1.30 },
    enabled: true,
    tags: ['image', 'text-to-image', 'nano-banana', '360', 'panorama'],
    version: '1.0.0',
  },
  {
    id: 'image.generate.nano-banana-pro-edit',
    name: 'Nano Banana Pro - Image Editing',
    description: 'Edit images using Nano Banana Pro model.',
    category: 'image-editing',
    falModel: 'fal-ai/nano-banana-pro/edit',
    executionMode: 'sync',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Edit instruction' },
        image_url: { type: 'string', description: 'URL of image to edit' },
        image_size: {
          type: 'string',
          enum: ['square_hd', 'square', 'landscape_4_3', 'landscape_16_9', 'portrait_4_3', 'portrait_16_9'],
          default: 'landscape_4_3',
        },
        seed: { type: 'number' },
        output_format: { type: 'string', enum: ['jpeg', 'png', 'webp'], default: 'jpeg' },
      },
      required: ['prompt', 'image_url'],
    },
    outputDescription: 'Edited image URL',
    outputMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    pricing: { baseUsdCost: FAL_API_COSTS.NANO_BANANA, credits: 0.7, markup: 1.30 },
    enabled: true,
    tags: ['image', 'editing', 'nano-banana'],
    version: '1.0.0',
  },
  {
    id: 'image.generate.flux-controlnet-canny',
    name: 'FLUX ControlNet Canny',
    description: 'Generate images guided by edge detection (Canny) from a reference image. Great for maintaining structure while changing style.',
    category: 'image-generation',
    falModel: 'fal-ai/flux-control-lora-canny',
    executionMode: 'sync',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Text description of the desired output' },
        control_image_url: { type: 'string', description: 'URL of the reference image for edge detection' },
        image_size: {
          type: 'string',
          enum: ['square_hd', 'square', 'landscape_4_3', 'landscape_16_9', 'portrait_4_3', 'portrait_16_9'],
          default: 'landscape_4_3',
        },
        num_images: { type: 'number', default: 1, minimum: 1, maximum: 4 },
        seed: { type: 'number' },
        guidance_scale: { type: 'number', default: 3.5 },
        output_format: { type: 'string', enum: ['jpeg', 'png', 'webp'], default: 'jpeg' },
      },
      required: ['prompt', 'control_image_url'],
    },
    outputDescription: 'Generated image guided by edge structure',
    outputMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    pricing: { baseUsdCost: FAL_API_COSTS.FLUX_PRO_KONTEXT, credits: 0.5, markup: 1.30 },
    enabled: true,
    tags: ['image', 'controlnet', 'canny', 'structure-guided'],
    version: '1.0.0',
  },

  // ============================================
  // IMAGE PROCESSING
  // ============================================
  {
    id: 'image.upscale',
    name: 'Creative Upscaler',
    description: 'Upscale images 2x or 4x with AI-enhanced detail. Adds realistic detail while increasing resolution.',
    category: 'image-processing',
    falModel: 'fal-ai/creative-upscaler',
    executionMode: 'sync',
    inputSchema: {
      type: 'object',
      properties: {
        image_url: { type: 'string', description: 'URL of image to upscale' },
        scale: { type: 'number', description: 'Upscale factor', enum: [2, 4] as unknown as string[], default: 2 },
        creativity: { type: 'number', description: 'How much creative detail to add (0-1)', default: 0.5, minimum: 0, maximum: 1 },
        prompt: { type: 'string', description: 'Optional text guidance for upscaling' },
        output_format: { type: 'string', enum: ['jpeg', 'png', 'webp'], default: 'png' },
      },
      required: ['image_url'],
    },
    outputDescription: 'Upscaled image URL',
    outputMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    pricing: { baseUsdCost: FAL_API_COSTS.UPSCALE, credits: 0.5, markup: 1.30 },
    enabled: true,
    tags: ['image', 'upscale', 'enhance', 'resolution'],
    version: '1.0.0',
  },
  {
    id: 'image.face-swap',
    name: 'Face Swap',
    description: 'Swap faces between two images. Detects and replaces the face in the target image with the face from the source image.',
    category: 'image-editing',
    falModel: 'fal-ai/face-swap',
    executionMode: 'queue',
    inputSchema: {
      type: 'object',
      properties: {
        source_image_url: { type: 'string', description: 'URL of the image containing the face to use' },
        target_image_url: { type: 'string', description: 'URL of the image where the face will be placed' },
      },
      required: ['source_image_url', 'target_image_url'],
    },
    outputDescription: 'Image with swapped face',
    outputMimeTypes: ['image/png'],
    pricing: { baseUsdCost: 0.02, credits: 2, markup: 1.30 },
    enabled: true,
    tags: ['image', 'face-swap', 'editing'],
    version: '1.0.0',
  },
  {
    id: 'image.inpaint',
    name: 'Image Inpainting',
    description: 'Fill in or replace masked regions of an image using AI. Provide a mask to indicate which areas to regenerate.',
    category: 'image-editing',
    falModel: 'fal-ai/flux-pro/v1.1/inpaint',
    executionMode: 'queue',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Description of what to generate in the masked area' },
        image_url: { type: 'string', description: 'URL of the original image' },
        mask_url: { type: 'string', description: 'URL of the mask image (white = areas to regenerate)' },
        seed: { type: 'number' },
        guidance_scale: { type: 'number', default: 7.5 },
        output_format: { type: 'string', enum: ['jpeg', 'png', 'webp'], default: 'png' },
      },
      required: ['prompt', 'image_url', 'mask_url'],
    },
    outputDescription: 'Inpainted image URL',
    outputMimeTypes: ['image/png'],
    pricing: { baseUsdCost: 0.03, credits: 2, markup: 1.30 },
    enabled: true,
    tags: ['image', 'inpainting', 'editing', 'mask'],
    version: '1.0.0',
  },
  {
    id: 'image.outpaint',
    name: 'Image Outpainting',
    description: 'Extend an image beyond its borders using AI. Generates content for the expanded regions while maintaining consistency.',
    category: 'image-editing',
    falModel: 'fal-ai/flux-pro/v1.1/outpaint',
    executionMode: 'queue',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Description of what to generate in the extended area' },
        image_url: { type: 'string', description: 'URL of the original image' },
        top: { type: 'number', description: 'Pixels to extend upward', default: 0 },
        bottom: { type: 'number', description: 'Pixels to extend downward', default: 0 },
        left: { type: 'number', description: 'Pixels to extend left', default: 0 },
        right: { type: 'number', description: 'Pixels to extend right', default: 0 },
        seed: { type: 'number' },
        output_format: { type: 'string', enum: ['jpeg', 'png', 'webp'], default: 'png' },
      },
      required: ['prompt', 'image_url'],
    },
    outputDescription: 'Extended image URL',
    outputMimeTypes: ['image/png'],
    pricing: { baseUsdCost: 0.03, credits: 2, markup: 1.30 },
    enabled: true,
    tags: ['image', 'outpainting', 'extend', 'editing'],
    version: '1.0.0',
  },
  {
    id: 'image.extract-layer',
    name: 'Layer Extraction (Background Removal)',
    description: 'Extract the foreground subject from an image, removing the background. Returns an RGBA image with transparency.',
    category: 'image-processing',
    falModel: 'fal-ai/birefnet',
    executionMode: 'queue',
    inputSchema: {
      type: 'object',
      properties: {
        image_url: { type: 'string', description: 'URL of the image to extract from' },
        operating_resolution: { type: 'string', description: 'Processing resolution', enum: ['1024x1024', '2048x2048'], default: '1024x1024' },
        output_format: { type: 'string', enum: ['png', 'webp'], default: 'png' },
      },
      required: ['image_url'],
    },
    outputDescription: 'RGBA image with transparent background',
    outputMimeTypes: ['image/png'],
    pricing: { baseUsdCost: 0.01, credits: 0.5, markup: 1.30 },
    enabled: true,
    tags: ['image', 'background-removal', 'segmentation', 'layer'],
    version: '1.0.0',
  },

  // ============================================
  // VIDEO GENERATION
  // ============================================
  {
    id: 'video.generate.veo3',
    name: 'Veo 3.1 - Text to Video',
    description: 'Generate high-quality cinematic videos from text prompts using Google Veo 3.1. Best for premium, cinematic quality output.',
    category: 'video-generation',
    falModel: 'fal-ai/veo3.1',
    executionMode: 'queue',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Text description of the video to generate' },
        duration: { type: 'string', description: 'Video duration', enum: ['4s', '6s', '8s'], default: '6s' },
        aspect_ratio: { type: 'string', description: 'Video aspect ratio', enum: ['16:9', '9:16', '1:1'], default: '16:9' },
        generate_audio: { type: 'boolean', description: 'Whether to generate audio', default: true },
      },
      required: ['prompt'],
    },
    outputDescription: 'Video URL (MP4)',
    outputMimeTypes: ['video/mp4'],
    pricing: { baseUsdCost: FAL_API_COSTS.VIDEO_PER_SECOND, perUnitCost: FAL_API_COSTS.VIDEO_PER_SECOND, unitType: 'second', credits: 2.2, perUnitCredits: 2.2, markup: 1.30 },
    enabled: true,
    tags: ['video', 'text-to-video', 'veo', 'cinematic', 'premium'],
    version: '1.0.0',
  },
  {
    id: 'video.generate.veo3-image-to-video',
    name: 'Veo 3.1 - Image to Video',
    description: 'Animate a still image into a video using Veo 3.1. Brings images to life with cinematic motion.',
    category: 'video-generation',
    falModel: 'fal-ai/veo3.1/fast/image-to-video',
    executionMode: 'queue',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Description of the desired motion/animation' },
        image_url: { type: 'string', description: 'URL of the image to animate' },
        duration: { type: 'string', enum: ['4s', '6s', '8s'], default: '6s' },
        aspect_ratio: { type: 'string', enum: ['16:9', '9:16', '1:1'], default: '16:9' },
        generate_audio: { type: 'boolean', default: true },
      },
      required: ['prompt', 'image_url'],
    },
    outputDescription: 'Animated video URL (MP4)',
    outputMimeTypes: ['video/mp4'],
    pricing: { baseUsdCost: FAL_API_COSTS.VIDEO_PER_SECOND, perUnitCost: FAL_API_COSTS.VIDEO_PER_SECOND, unitType: 'second', credits: 2.2, perUnitCredits: 2.2, markup: 1.30 },
    enabled: true,
    tags: ['video', 'image-to-video', 'veo', 'animation'],
    version: '1.0.0',
  },
  {
    id: 'video.generate.veo3-first-last-frame',
    name: 'Veo 3.1 - First/Last Frame Animation',
    description: 'Generate a video that transitions between a first frame and last frame image. Creates smooth interpolation between two keyframes.',
    category: 'video-generation',
    falModel: 'fal-ai/veo3.1/fast/first-last-frame-to-video',
    executionMode: 'queue',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Description of the transition' },
        first_frame_image_url: { type: 'string', description: 'URL of the first frame image' },
        last_frame_image_url: { type: 'string', description: 'URL of the last frame image' },
        duration: { type: 'string', enum: ['4s', '6s', '8s'], default: '6s' },
        generate_audio: { type: 'boolean', default: true },
      },
      required: ['prompt', 'first_frame_image_url', 'last_frame_image_url'],
    },
    outputDescription: 'Interpolated video URL (MP4)',
    outputMimeTypes: ['video/mp4'],
    pricing: { baseUsdCost: FAL_API_COSTS.VIDEO_PER_SECOND, perUnitCost: FAL_API_COSTS.VIDEO_PER_SECOND, unitType: 'second', credits: 2.2, perUnitCredits: 2.2, markup: 1.30 },
    enabled: true,
    tags: ['video', 'frame-interpolation', 'veo', 'keyframe'],
    version: '1.0.0',
  },
  {
    id: 'video.generate.ltx-text',
    name: 'LTX-2 - Text to Video',
    description: 'Generate videos from text prompts using LTX-2 19B. Fast and affordable option for video generation.',
    category: 'video-generation',
    falModel: 'fal-ai/ltx-2-19b/text-to-video',
    executionMode: 'queue',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Text description of the video' },
        duration: { type: 'string', enum: ['4s', '6s', '8s'], default: '6s' },
        aspect_ratio: { type: 'string', enum: ['16:9', '9:16', '1:1'], default: '16:9' },
        seed: { type: 'number' },
      },
      required: ['prompt'],
    },
    outputDescription: 'Video URL (MP4)',
    outputMimeTypes: ['video/mp4'],
    pricing: { baseUsdCost: 0.05, perUnitCost: 0.05, unitType: 'second', credits: 1, perUnitCredits: 1, markup: 1.30 },
    enabled: true,
    tags: ['video', 'text-to-video', 'ltx', 'budget', 'fast'],
    version: '1.0.0',
  },
  {
    id: 'video.generate.ltx-image',
    name: 'LTX-2 - Image to Video',
    description: 'Animate an image into a video using LTX-2 19B. Fast and affordable image animation.',
    category: 'video-generation',
    falModel: 'fal-ai/ltx-2-19b/image-to-video',
    executionMode: 'queue',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Description of desired motion' },
        image_url: { type: 'string', description: 'URL of image to animate' },
        duration: { type: 'string', enum: ['4s', '6s', '8s'], default: '6s' },
        seed: { type: 'number' },
      },
      required: ['prompt', 'image_url'],
    },
    outputDescription: 'Animated video URL (MP4)',
    outputMimeTypes: ['video/mp4'],
    pricing: { baseUsdCost: 0.05, perUnitCost: 0.05, unitType: 'second', credits: 1, perUnitCredits: 1, markup: 1.30 },
    enabled: true,
    tags: ['video', 'image-to-video', 'ltx', 'budget', 'fast'],
    version: '1.0.0',
  },
  {
    id: 'video.animate.wan',
    name: 'WAN Animate - Video Animation',
    description: 'Animate or transform videos using WAN v2.2. Supports video-to-video style transfer and animation replacement.',
    category: 'video-editing',
    falModel: 'fal-ai/wan/v2.2-1.3b/animate/replace',
    executionMode: 'queue',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Description of desired animation style' },
        video_url: { type: 'string', description: 'URL of video to animate' },
        image_url: { type: 'string', description: 'Optional reference image for style' },
        aspect_ratio: { type: 'string', enum: ['16:9', '9:16', '1:1'], default: '16:9' },
      },
      required: ['prompt'],
    },
    outputDescription: 'Animated video URL (MP4)',
    outputMimeTypes: ['video/mp4'],
    pricing: { baseUsdCost: 0.05, perUnitCost: 0.05, unitType: 'second', credits: 2, perUnitCredits: 2, markup: 1.30 },
    enabled: true,
    tags: ['video', 'animation', 'wan', 'style-transfer'],
    version: '1.0.0',
  },
  {
    id: 'video.video-to-audio',
    name: 'Video to Audio',
    description: 'Generate audio/sound effects for a video using MMAudio v2. Creates contextually appropriate audio from video content.',
    category: 'audio-generation',
    falModel: 'fal-ai/mmaudio-v2',
    executionMode: 'queue',
    inputSchema: {
      type: 'object',
      properties: {
        video_url: { type: 'string', description: 'URL of the video to generate audio for' },
        prompt: { type: 'string', description: 'Optional text description of desired audio' },
        duration: { type: 'number', description: 'Audio duration in seconds' },
      },
      required: ['video_url'],
    },
    outputDescription: 'Video with generated audio (MP4)',
    outputMimeTypes: ['video/mp4', 'audio/wav'],
    pricing: { baseUsdCost: 0.03, credits: 1, markup: 1.30 },
    enabled: true,
    tags: ['audio', 'video-to-audio', 'sound-effects', 'foley'],
    version: '1.0.0',
  },

  // ============================================
  // AUDIO & MUSIC
  // ============================================
  {
    id: 'audio.tts',
    name: 'XTTS v2 - Voice Cloning & TTS',
    description: 'Generate speech from text with voice cloning. Provide a reference audio to clone any voice.',
    category: 'audio-generation',
    falModel: 'fal-ai/xtts-v2',
    executionMode: 'queue',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'Text to convert to speech' },
        audio_url: { type: 'string', description: 'URL of reference audio for voice cloning' },
        language: { type: 'string', description: 'Language code', enum: ['en', 'ja', 'zh', 'ko', 'es', 'fr', 'de', 'it', 'pt', 'ru'], default: 'en' },
      },
      required: ['text', 'audio_url'],
    },
    outputDescription: 'Generated speech audio URL (WAV)',
    outputMimeTypes: ['audio/wav'],
    pricing: { baseUsdCost: 0.02, credits: 1, markup: 1.30 },
    enabled: true,
    tags: ['audio', 'tts', 'voice-cloning', 'speech'],
    version: '1.0.0',
  },
  {
    id: 'audio.transcribe',
    name: 'Whisper - Speech to Text',
    description: 'Transcribe audio or video files to text using OpenAI Whisper large-v3. Supports 100+ languages with auto-detection, word-level timestamps, and translation to English.',
    category: 'audio-processing',
    falModel: 'fal-ai/whisper',
    executionMode: 'queue',
    inputSchema: {
      type: 'object',
      properties: {
        audio_url: { type: 'string', description: 'URL of the audio or video file to transcribe' },
        language: { type: 'string', description: 'Language code hint (auto-detected if omitted)' },
        task: { type: 'string', description: 'Task type', enum: ['transcribe', 'translate'], default: 'transcribe' },
        chunk_level: { type: 'string', description: 'Timestamp granularity', enum: ['segment', 'word'], default: 'segment' },
      },
      required: ['audio_url'],
    },
    outputDescription: 'Transcribed text with timestamps and detected language',
    outputMimeTypes: ['application/json'],
    pricing: { baseUsdCost: 0.01, credits: 1, markup: 1.30 },
    enabled: true,
    tags: ['audio', 'transcription', 'speech-to-text', 'whisper', 'subtitles'],
    version: '1.0.0',
  },
  {
    id: 'audio.lip-sync',
    name: 'SadTalker - Lip Sync',
    description: 'Generate a talking-head video from a portrait image and audio. The face will lip-sync to the provided audio.',
    category: 'video-generation',
    falModel: 'fal-ai/sadtalker',
    executionMode: 'queue',
    inputSchema: {
      type: 'object',
      properties: {
        face_image_url: { type: 'string', description: 'URL of the portrait/face image' },
        audio_url: { type: 'string', description: 'URL of the audio to lip-sync to' },
        still_mode: { type: 'boolean', description: 'Minimal head movement', default: false },
        preprocess: { type: 'string', description: 'Face preprocessing', enum: ['crop', 'resize', 'full', 'extcrop', 'extfull'], default: 'crop' },
      },
      required: ['face_image_url', 'audio_url'],
    },
    outputDescription: 'Lip-synced video URL (MP4)',
    outputMimeTypes: ['video/mp4'],
    pricing: { baseUsdCost: 0.04, credits: 3, markup: 1.30 },
    enabled: true,
    tags: ['video', 'lip-sync', 'talking-head', 'avatar'],
    version: '1.0.0',
  },
  {
    id: 'music.generate',
    name: 'CassetteAI Music Generator',
    description: 'Generate original music from text descriptions. Specify genre, mood, tempo, and instruments for customized music creation.',
    category: 'music-generation',
    falModel: 'CassetteAI/music-generator',
    executionMode: 'queue',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Description of the music (genre, mood, tempo, instruments)' },
        duration: { type: 'number', description: 'Duration in seconds', default: 30, minimum: 15, maximum: 180 },
      },
      required: ['prompt'],
    },
    outputDescription: 'Generated music audio URL (MP3/WAV)',
    outputMimeTypes: ['audio/mpeg', 'audio/wav'],
    pricing: { baseUsdCost: FAL_API_COSTS.MUSIC_PER_MINUTE, perUnitCost: FAL_API_COSTS.MUSIC_PER_MINUTE, unitType: 'minute', credits: 0.25, perUnitCredits: 0.25, markup: 1.30 },
    enabled: true,
    tags: ['music', 'generation', 'audio', 'composition'],
    version: '1.0.0',
  },
  {
    id: 'audio.sfx',
    name: 'AudioLDM2 - Sound Effects',
    description: 'Generate sound effects from text descriptions. Create any sound effect from a text prompt.',
    category: 'audio-generation',
    falModel: 'fal-ai/audioldm2',
    executionMode: 'queue',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Description of the sound effect to generate' },
        duration: { type: 'number', description: 'Duration in seconds', default: 5, minimum: 1, maximum: 30 },
        num_inference_steps: { type: 'number', description: 'Quality steps', default: 50, minimum: 10, maximum: 100 },
        seed: { type: 'number' },
      },
      required: ['prompt'],
    },
    outputDescription: 'Sound effect audio URL (WAV)',
    outputMimeTypes: ['audio/wav'],
    pricing: { baseUsdCost: FAL_API_COSTS.SFX, credits: 1, markup: 1.30 },
    enabled: true,
    tags: ['audio', 'sound-effects', 'sfx', 'foley'],
    version: '1.0.0',
  },
  {
    id: 'audio.stem-separation',
    name: 'Demucs - Stem Separation',
    description: 'Separate audio into individual stems: vocals, drums, bass, and other instruments. Professional audio isolation.',
    category: 'audio-processing',
    falModel: 'fal-ai/demucs',
    executionMode: 'queue',
    inputSchema: {
      type: 'object',
      properties: {
        audio_url: { type: 'string', description: 'URL of the audio to separate' },
        stems: { type: 'number', description: 'Number of stems (2 or 4)', enum: [2, 4] as unknown as string[], default: 4 },
      },
      required: ['audio_url'],
    },
    outputDescription: 'Separated audio stems (vocals, drums, bass, other)',
    outputMimeTypes: ['audio/wav'],
    pricing: { baseUsdCost: 0.03, credits: 2, markup: 1.30 },
    enabled: true,
    tags: ['audio', 'stem-separation', 'demucs', 'remix'],
    version: '1.0.0',
  },

  // ============================================
  // 3D GENERATION
  // ============================================
  {
    id: '3d.image-to-3d',
    name: 'Hunyuan3D v3 - Image to 3D',
    description: 'Convert a 2D image into a 3D model using Hunyuan3D v3. Supports GLB, OBJ, and FBX output formats with PBR materials.',
    category: '3d-generation',
    falModel: 'fal-ai/hunyuan3d-v3/image-to-3d',
    executionMode: 'queue',
    inputSchema: {
      type: 'object',
      properties: {
        image_url: { type: 'string', description: 'URL of the image to convert to 3D' },
        back_image_url: { type: 'string', description: 'Optional URL of back view image' },
        left_image_url: { type: 'string', description: 'Optional URL of left view image' },
        right_image_url: { type: 'string', description: 'Optional URL of right view image' },
        generate_texture: { type: 'boolean', description: 'Generate PBR textures', default: true },
        target_face_count: { type: 'number', description: 'Target polygon count', default: 40000, minimum: 10000, maximum: 1500000 },
        output_format: { type: 'string', description: 'Output 3D format', enum: ['glb', 'obj', 'fbx'], default: 'glb' },
      },
      required: ['image_url'],
    },
    outputDescription: '3D model file URL (GLB/OBJ/FBX)',
    outputMimeTypes: ['model/gltf-binary', 'model/obj', 'application/octet-stream'],
    pricing: { baseUsdCost: 0.05, credits: 3, markup: 1.30 },
    enabled: true,
    tags: ['3d', 'image-to-3d', '3d-model', 'mesh', 'pbr'],
    version: '1.0.0',
  },

  // ============================================
  // VISION & TEXT
  // ============================================
  {
    id: 'vision.describe',
    name: 'Image Description (LLaVA)',
    description: 'Generate a detailed text description of an image using LLaVA vision model. Useful for image understanding and captioning.',
    category: 'vision',
    falModel: 'fal-ai/llavav15-13b',
    executionMode: 'sync',
    inputSchema: {
      type: 'object',
      properties: {
        image_url: { type: 'string', description: 'URL of the image to describe' },
        prompt: { type: 'string', description: 'Optional question about the image', default: 'Describe this image in detail.' },
        max_tokens: { type: 'number', description: 'Maximum response length', default: 512 },
      },
      required: ['image_url'],
    },
    outputDescription: 'Text description of the image',
    outputMimeTypes: ['text/plain'],
    pricing: { baseUsdCost: FAL_API_COSTS.DESCRIBE, credits: 0.5, markup: 1.30 },
    enabled: true,
    tags: ['vision', 'description', 'captioning', 'understanding'],
    version: '1.0.0',
  },
  {
    id: 'text.llm',
    name: 'LLM Chat (Claude Models)',
    description: 'Chat with Claude models (Opus 4.6, Sonnet 4.5, Haiku 4.5) through a unified interface. Useful for prompt optimization, text generation, and analysis.',
    category: 'text-generation',
    falModel: 'fal-ai/any-llm',
    executionMode: 'sync',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'The prompt/question to send to the LLM' },
        system_prompt: { type: 'string', description: 'Optional system prompt to set the behavior' },
        model: { type: 'string', description: 'Claude model to use: claude-opus-4-6, claude-sonnet-4-5, claude-haiku-4-5', default: 'claude-sonnet-4-5' },
        max_tokens: { type: 'number', description: 'Maximum response tokens', default: 1024 },
      },
      required: ['prompt'],
    },
    outputDescription: 'LLM text response',
    outputMimeTypes: ['text/plain'],
    pricing: { baseUsdCost: FAL_API_COSTS.PROMPT_LAB, credits: 0.1, markup: 1.30 },
    enabled: true,
    tags: ['text', 'llm', 'chat', 'analysis', 'prompt-optimization'],
    version: '1.0.0',
  },

  // ============================================
  // TRAINING
  // ============================================
  {
    id: 'training.flux-lora',
    name: 'FLUX LoRA Fast Training',
    description: 'Train a custom LoRA model on FLUX for personalized image generation. Upload training images to create a fine-tuned model.',
    category: 'training',
    falModel: 'fal-ai/flux-lora-fast-training',
    executionMode: 'queue',
    inputSchema: {
      type: 'object',
      properties: {
        images_data_url: { type: 'string', description: 'URL of training images ZIP file' },
        trigger_word: { type: 'string', description: 'Trigger word for the trained concept', default: 'ohwx' },
        steps: { type: 'number', description: 'Training steps', default: 1000, minimum: 100, maximum: 5000 },
        learning_rate: { type: 'number', description: 'Learning rate', default: 0.0001 },
        create_masks: { type: 'boolean', description: 'Auto-generate training masks', default: true },
      },
      required: ['images_data_url'],
    },
    outputDescription: 'Trained LoRA model weights URL',
    outputMimeTypes: ['application/octet-stream'],
    pricing: { baseUsdCost: 0.003, perUnitCost: 0.003, unitType: 'step', credits: 0.03, perUnitCredits: 0.03, markup: 1.30 },
    enabled: true,
    tags: ['training', 'lora', 'fine-tuning', 'flux', 'personalization'],
    version: '1.0.0',
  },
  {
    id: 'training.flux-2',
    name: 'FLUX 2 LoRA Training',
    description: 'Train a custom LoRA model on FLUX 2 for photorealistic personalized generation.',
    category: 'training',
    falModel: 'fal-ai/flux-2-trainer',
    executionMode: 'queue',
    inputSchema: {
      type: 'object',
      properties: {
        images_data_url: { type: 'string', description: 'URL of training images ZIP file' },
        trigger_word: { type: 'string', description: 'Trigger word', default: 'ohwx' },
        steps: { type: 'number', description: 'Training steps', default: 1000, minimum: 100, maximum: 5000 },
        learning_rate: { type: 'number', description: 'Learning rate', default: 0.0001 },
      },
      required: ['images_data_url'],
    },
    outputDescription: 'Trained LoRA model weights URL',
    outputMimeTypes: ['application/octet-stream'],
    pricing: { baseUsdCost: 0.005, perUnitCost: 0.005, unitType: 'step', credits: 0.05, perUnitCredits: 0.05, markup: 1.30 },
    enabled: true,
    tags: ['training', 'lora', 'fine-tuning', 'flux-2', 'photorealistic'],
    version: '1.0.0',
  },
  {
    id: 'training.lora-inference',
    name: 'LoRA Inference - Generate with Custom Model',
    description: 'Generate images using a previously trained LoRA model. Provide the LoRA weights URL and trigger word.',
    category: 'image-generation',
    falModel: 'fal-ai/flux-2/lora',
    executionMode: 'queue',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'Text prompt (include trigger word)' },
        lora_url: { type: 'string', description: 'URL of the trained LoRA weights' },
        lora_scale: { type: 'number', description: 'LoRA influence scale', default: 1.0, minimum: 0, maximum: 2 },
        image_size: {
          type: 'string',
          enum: ['square_hd', 'square', 'landscape_4_3', 'landscape_16_9', 'portrait_4_3', 'portrait_16_9'],
          default: 'landscape_4_3',
        },
        num_images: { type: 'number', default: 1, minimum: 1, maximum: 4 },
        seed: { type: 'number' },
        guidance_scale: { type: 'number', default: 3.5 },
        output_format: { type: 'string', enum: ['jpeg', 'png', 'webp'], default: 'jpeg' },
      },
      required: ['prompt', 'lora_url'],
    },
    outputDescription: 'Generated images using custom LoRA model',
    outputMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    pricing: { baseUsdCost: 0.03, credits: 1, markup: 1.30 },
    enabled: true,
    tags: ['image', 'lora', 'custom-model', 'personalized'],
    version: '1.0.0',
  },
];

// ============================================
// Registry Class
// ============================================

export type ToolHealthStatus = 'healthy' | 'degraded' | 'down' | 'unknown';

interface ToolHealthInfo {
  status: ToolHealthStatus;
  lastCheckedAt: Date | null;
  lastSuccessAt: Date | null;
  consecutiveFailures: number;
  latencyMs: number | null;
}

class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();
  private healthStatus: Map<string, ToolHealthInfo> = new Map();
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Register all built-in tools
    for (const tool of TOOLS) {
      this.tools.set(tool.id, tool);
      this.healthStatus.set(tool.id, {
        status: 'unknown',
        lastCheckedAt: null,
        lastSuccessAt: null,
        consecutiveFailures: 0,
        latencyMs: null,
      });
    }
    logger.info(`Tool Registry initialized with ${this.tools.size} tools`);
  }

  /** Get all tools */
  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /** Get enabled tools only */
  getEnabled(): ToolDefinition[] {
    return this.getAll().filter(t => t.enabled);
  }

  /** Get tool by ID */
  get(id: string): ToolDefinition | undefined {
    return this.tools.get(id);
  }

  /** Search tools by category */
  getByCategory(category: ToolCategory): ToolDefinition[] {
    return this.getEnabled().filter(t => t.category === category);
  }

  /** Search tools by tag */
  getByTag(tag: string): ToolDefinition[] {
    return this.getEnabled().filter(t => t.tags.includes(tag));
  }

  /** Search tools by query (searches name, description, tags) */
  search(query: string): ToolDefinition[] {
    const q = query.toLowerCase();
    return this.getEnabled().filter(t =>
      t.name.toLowerCase().includes(q) ||
      t.description.toLowerCase().includes(q) ||
      t.tags.some(tag => tag.includes(q)) ||
      t.id.toLowerCase().includes(q)
    );
  }

  /** Get all categories with tool counts */
  getCategories(): Array<{ category: ToolCategory; count: number; tools: string[] }> {
    const categories = new Map<ToolCategory, string[]>();
    for (const tool of this.getEnabled()) {
      const existing = categories.get(tool.category) || [];
      existing.push(tool.id);
      categories.set(tool.category, existing);
    }
    return Array.from(categories.entries()).map(([category, tools]) => ({
      category,
      count: tools.length,
      tools,
    }));
  }

  /** Get pricing for a tool given request parameters */
  calculatePrice(toolId: string, params: Record<string, unknown>): { usd: number; credits: number; usdcUnits: string } | null {
    const tool = this.get(toolId);
    if (!tool) return null;

    let totalUsd = tool.pricing.baseUsdCost;
    let totalCredits = tool.pricing.credits;

    // Calculate per-unit costs
    if (tool.pricing.perUnitCost && tool.pricing.unitType) {
      let units = 1;
      switch (tool.pricing.unitType) {
        case 'second': {
          const raw = params.duration;
          if (typeof raw === 'number') units = raw;
          else if (typeof raw === 'string') units = parseInt(raw.replace('s', ''), 10) || 5;
          else units = 5;
          break;
        }
        case 'minute': {
          const dur = (params.duration as number) || 30;
          units = dur / 60;
          break;
        }
        case 'image':
          units = (params.num_images as number) || 1;
          break;
        case 'step':
          units = (params.steps as number) || 1000;
          break;
      }
      totalUsd = tool.pricing.perUnitCost * units;
      totalCredits = (tool.pricing.perUnitCredits || tool.pricing.credits) * units;
    }

    const markedUpUsd = totalUsd * tool.pricing.markup;
    const usdcUnits = Math.round(markedUpUsd * 1e6).toString();

    return { usd: markedUpUsd, credits: totalCredits, usdcUnits };
  }

  /**
   * Validate input against a tool's JSON Schema.
   * Returns { valid: true } or { valid: false, errors: string[] }.
   */
  validateInput(toolId: string, input: Record<string, unknown>): { valid: boolean; errors: string[] } {
    const tool = this.get(toolId);
    if (!tool) return { valid: false, errors: [`Unknown tool: ${toolId}`] };

    const schema = tool.inputSchema;
    const errors: string[] = [];

    // Check required fields
    for (const req of schema.required) {
      if (input[req] === undefined || input[req] === null || input[req] === '') {
        errors.push(`Missing required field: ${req}`);
      }
    }

    // Validate each provided field against the schema
    for (const [key, value] of Object.entries(input)) {
      const paramDef = schema.properties[key];
      if (!paramDef) continue; // allow extra fields (pass-through to fal.ai)

      // Type check
      if (paramDef.type === 'string' && typeof value !== 'string') {
        errors.push(`Field '${key}' must be a string, got ${typeof value}`);
        continue;
      }
      if (paramDef.type === 'number' && typeof value !== 'number') {
        // Allow numeric strings
        if (typeof value === 'string' && !isNaN(Number(value))) continue;
        errors.push(`Field '${key}' must be a number, got ${typeof value}`);
        continue;
      }
      if (paramDef.type === 'boolean' && typeof value !== 'boolean') {
        errors.push(`Field '${key}' must be a boolean, got ${typeof value}`);
        continue;
      }
      if (paramDef.type === 'array' && !Array.isArray(value)) {
        errors.push(`Field '${key}' must be an array, got ${typeof value}`);
        continue;
      }

      // Enum check
      if (paramDef.enum && !paramDef.enum.includes(value as string)) {
        errors.push(`Field '${key}' must be one of: ${paramDef.enum.join(', ')}. Got: ${String(value)}`);
      }

      // Range checks for numbers
      if (typeof value === 'number') {
        if (paramDef.minimum !== undefined && value < paramDef.minimum) {
          errors.push(`Field '${key}' must be >= ${paramDef.minimum}, got ${value}`);
        }
        if (paramDef.maximum !== undefined && value > paramDef.maximum) {
          errors.push(`Field '${key}' must be <= ${paramDef.maximum}, got ${value}`);
        }
      }
    }

    return { valid: errors.length === 0, errors };
  }

  /** Get tools scoped to an agent's allowed tool list */
  getToolsForAgent(toolIds: string[]): ToolDefinition[] {
    return toolIds
      .map(id => this.tools.get(id))
      .filter((t): t is ToolDefinition => !!t && t.enabled);
  }

  /** Validate that all provided tool IDs exist in the registry */
  validateToolIds(toolIds: string[]): { valid: boolean; unknownTools: string[] } {
    const unknownTools = toolIds.filter(id => !this.tools.has(id));
    return { valid: unknownTools.length === 0, unknownTools };
  }

  /** Get health status for a tool */
  getHealth(toolId: string): ToolHealthInfo | undefined {
    return this.healthStatus.get(toolId);
  }

  /** Get all health statuses */
  getAllHealth(): Record<string, ToolHealthInfo> {
    const result: Record<string, ToolHealthInfo> = {};
    for (const [id, info] of this.healthStatus) {
      result[id] = info;
    }
    return result;
  }

  /** Run a health check for a single tool by pinging fal.ai */
  async checkToolHealth(toolId: string): Promise<ToolHealthInfo> {
    const tool = this.tools.get(toolId);
    const info = this.healthStatus.get(toolId) || {
      status: 'unknown' as ToolHealthStatus,
      lastCheckedAt: null,
      lastSuccessAt: null,
      consecutiveFailures: 0,
      latencyMs: null,
    };

    if (!tool) {
      info.status = 'down';
      info.lastCheckedAt = new Date();
      return info;
    }

    const start = Date.now();
    try {
      // Lightweight check: HEAD request to fal.ai model endpoint
      const resp = await fetch(`https://fal.run/${tool.falModel}`, {
        method: 'HEAD',
        signal: AbortSignal.timeout(10000),
      });

      info.latencyMs = Date.now() - start;
      info.lastCheckedAt = new Date();

      // fal.ai returns 401/422 for HEAD (no body) but the endpoint exists
      if (resp.status < 500) {
        info.status = info.latencyMs > 5000 ? 'degraded' : 'healthy';
        info.lastSuccessAt = new Date();
        info.consecutiveFailures = 0;
      } else {
        info.consecutiveFailures++;
        info.status = info.consecutiveFailures >= 3 ? 'down' : 'degraded';
      }
    } catch {
      info.latencyMs = Date.now() - start;
      info.lastCheckedAt = new Date();
      info.consecutiveFailures++;
      info.status = info.consecutiveFailures >= 3 ? 'down' : 'degraded';
    }

    this.healthStatus.set(toolId, info);
    return info;
  }

  /** Run health checks for all enabled tools */
  async runHealthChecks(): Promise<void> {
    const enabled = this.getEnabled();
    logger.info(`Running health checks for ${enabled.length} tools`);

    // Check in batches of 5 to avoid overwhelming fal.ai
    for (let i = 0; i < enabled.length; i += 5) {
      const batch = enabled.slice(i, i + 5);
      await Promise.allSettled(batch.map(t => this.checkToolHealth(t.id)));
    }

    const statuses = this.getAllHealth();
    const healthy = Object.values(statuses).filter(h => h.status === 'healthy').length;
    const degraded = Object.values(statuses).filter(h => h.status === 'degraded').length;
    const down = Object.values(statuses).filter(h => h.status === 'down').length;
    logger.info(`Health checks complete: ${healthy} healthy, ${degraded} degraded, ${down} down`);
  }

  /** Start periodic health checks (every N ms, default 5 min) */
  startHealthChecks(intervalMs = 5 * 60 * 1000): void {
    if (this.healthCheckInterval) return;
    this.healthCheckInterval = setInterval(() => {
      this.runHealthChecks().catch(err =>
        logger.error('Health check run failed', { error: (err as Error).message })
      );
    }, intervalMs);
    // Run initial check after 30 seconds (don't block startup)
    setTimeout(() => this.runHealthChecks().catch(() => {}), 30000);
    logger.info('Tool health checks scheduled', { intervalMs });
  }

  /** Stop periodic health checks */
  stopHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }
  }

  /** 
   * Register a custom tool (for plugins/extensions) 
   * SECURITY FIX: Only allows registration of tools with validated IDs
   * and blocks registration of tools that override built-in tools.
   */
  register(tool: ToolDefinition, options?: { allowOverride?: boolean }): void {
    // SECURITY: Validate tool ID format (alphanumeric, dots, hyphens only)
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{2,100}$/.test(tool.id)) {
      logger.warn('Tool registration rejected - invalid tool ID', { toolId: tool.id });
      throw new Error(`Invalid tool ID format: ${tool.id}`);
    }

    // SECURITY: Prevent overriding built-in tools unless explicitly allowed
    if (this.tools.has(tool.id) && !options?.allowOverride) {
      logger.warn('Tool registration rejected - tool already exists', { toolId: tool.id });
      throw new Error(`Tool already registered: ${tool.id}. Use allowOverride to update.`);
    }

    // SECURITY: Validate required fields
    if (!tool.name || !tool.description || !tool.category || !tool.inputSchema) {
      logger.warn('Tool registration rejected - missing required fields', { toolId: tool.id });
      throw new Error(`Tool registration requires name, description, category, and inputSchema`);
    }

    this.tools.set(tool.id, tool);
    this.healthStatus.set(tool.id, {
      status: 'unknown',
      lastCheckedAt: null,
      lastSuccessAt: null,
      consecutiveFailures: 0,
      latencyMs: null,
    });
    logger.info(`Tool registered: ${tool.id} (${tool.name})`);
  }

  /** Get tool count */
  get size(): number {
    return this.tools.size;
  }

  /** Export for MCP tool listing */
  toMCPTools(): Array<{ name: string; description: string; inputSchema: ToolSchema }> {
    return this.getEnabled()
      .filter(tool => {
        // Exclude tools that are confirmed down
        const health = this.healthStatus.get(tool.id);
        return !health || health.status !== 'down';
      })
      .map(tool => ({
        name: tool.id,
        description: `${tool.name}: ${tool.description} [Category: ${tool.category}] [Cost: $${tool.pricing.baseUsdCost} / ${tool.pricing.credits} credits]`,
        inputSchema: tool.inputSchema,
      }));
  }

  /** Export for OpenAPI spec */
  toOpenAPISchema(): Record<string, unknown> {
    const paths: Record<string, unknown> = {};
    for (const tool of this.getEnabled()) {
      paths[`/api/gateway/invoke/${tool.id}`] = {
        post: {
          summary: tool.name,
          description: tool.description,
          tags: [tool.category],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: tool.inputSchema,
              },
            },
          },
          responses: {
            200: { description: tool.outputDescription },
            402: { description: 'Payment required (x402)' },
          },
        },
      };
    }
    return paths;
  }
}

// Singleton
export const toolRegistry = new ToolRegistry();
export default toolRegistry;
