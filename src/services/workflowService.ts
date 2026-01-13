/**
 * Workflow Service
 * Manages multi-step AI generation pipelines
 */
import { API_URL, ensureCSRFToken } from '../utils/apiConfig';
import logger from '../utils/logger';

// Types
export interface WorkflowStep {
  id: string;
  name: string;
  credits: number;
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  totalCredits: number;
  stepCount: number;
  steps: WorkflowStep[];
}

export interface WorkflowStepResult {
  success: boolean;
  error?: string;
  credits_used?: number;
  remaining_credits?: number;
  [key: string]: unknown;
}

/**
 * Helper function to make workflow API calls with CSRF token
 */
async function workflowFetch(url: string, body: Record<string, unknown>): Promise<WorkflowStepResult> {
  const csrfToken = await ensureCSRFToken();
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(csrfToken && { 'X-CSRF-Token': csrfToken })
    },
    credentials: 'include',
    body: JSON.stringify(body)
  });
  
  return response.json();
}

// Get list of available workflows
export async function getWorkflows(): Promise<WorkflowDefinition[]> {
  try {
    const response = await fetch(`${API_URL}/api/workflows/list`, {
      credentials: 'include'
    });
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Failed to fetch workflows');
    }
    
    return data.workflows;
  } catch (error) {
    logger.error('Failed to fetch workflows', { error: (error as Error).message });
    throw error;
  }
}

// AI Influencer Workflow Steps
export async function executeAIInfluencerVoice(
  script: string,
  language: string = 'en',
  auth: { userId?: string; email?: string; walletAddress?: string }
): Promise<WorkflowStepResult> {
  const data = await workflowFetch(`${API_URL}/api/workflows/ai-influencer/voice`, {
    script,
    language,
    ...auth
  });
  logger.info('AI Influencer voice step', { success: data.success });
  return data;
}

export async function executeAIInfluencerLipSync(
  portraitUrl: string,
  voiceUrl: string,
  auth: { userId?: string; email?: string; walletAddress?: string }
): Promise<WorkflowStepResult> {
  const data = await workflowFetch(`${API_URL}/api/workflows/ai-influencer/lipsync`, {
    portraitUrl,
    voiceUrl,
    ...auth
  });
  logger.info('AI Influencer lip sync step', { success: data.success });
  return data;
}

// Music Video Workflow Steps
export async function executeMusicVideoMusic(
  musicPrompt: string,
  duration: number = 30,
  auth: { userId?: string; email?: string; walletAddress?: string }
): Promise<WorkflowStepResult> {
  const data = await workflowFetch(`${API_URL}/api/workflows/music-video/music`, {
    musicPrompt,
    duration,
    ...auth
  });
  logger.info('Music Video music step', { success: data.success });
  return data;
}

export async function executeMusicVideoVideo(
  musicPrompt: string,
  visualPrompt: string | null,
  auth: { userId?: string; email?: string; walletAddress?: string }
): Promise<WorkflowStepResult> {
  const data = await workflowFetch(`${API_URL}/api/workflows/music-video/video`, {
    musicPrompt,
    visualPrompt,
    ...auth
  });
  logger.info('Music Video video step', { success: data.success });
  return data;
}

// Avatar Creator Workflow Steps
export async function executeAvatarCreatorGenerate(
  characterDescription: string,
  auth: { userId?: string; email?: string; walletAddress?: string }
): Promise<WorkflowStepResult> {
  const data = await workflowFetch(`${API_URL}/api/workflows/avatar-creator/generate`, {
    characterDescription,
    ...auth
  });
  logger.info('Avatar Creator generate step', { success: data.success });
  return data;
}

export async function executeAvatarCreatorVariations(
  characterDescription: string,
  baseImageUrl: string,
  poses: string[] = ['smiling', 'serious expression', 'looking to the side'],
  auth: { userId?: string; email?: string; walletAddress?: string }
): Promise<WorkflowStepResult> {
  const data = await workflowFetch(`${API_URL}/api/workflows/avatar-creator/variations`, {
    characterDescription,
    baseImageUrl,
    poses,
    ...auth
  });
  logger.info('Avatar Creator variations step', { success: data.success, variations: Array.isArray(data.variation_urls) ? data.variation_urls.length : 0 });
  return data;
}

// Remix Visualizer Workflow Steps
export async function executeRemixVisualizerSeparate(
  audioUrl: string,
  auth: { userId?: string; email?: string; walletAddress?: string }
): Promise<WorkflowStepResult> {
  const data = await workflowFetch(`${API_URL}/api/workflows/remix-visualizer/separate`, {
    audioUrl,
    ...auth
  });
  logger.info('Remix Visualizer separate step', { success: data.success });
  return data;
}

export async function executeRemixVisualizerVisualize(
  stems: Record<string, string>,
  auth: { userId?: string; email?: string; walletAddress?: string }
): Promise<WorkflowStepResult> {
  const data = await workflowFetch(`${API_URL}/api/workflows/remix-visualizer/visualize`, {
    stems,
    ...auth
  });
  logger.info('Remix Visualizer visualize step', { success: data.success });
  return data;
}

// Full workflow execution (queues entire workflow)
export async function executeFullWorkflow(
  workflowId: string,
  inputs: Record<string, unknown>,
  auth: { userId?: string; email?: string; walletAddress?: string }
): Promise<WorkflowStepResult> {
  const data = await workflowFetch(`${API_URL}/api/workflows/execute-full/${workflowId}`, {
    inputs,
    ...auth
  });
  logger.info('Full workflow execution', { workflowId, success: data.success });
  return data;
}

// Helper: Upload file to FAL storage
export async function uploadWorkflowFile(
  dataUri: string,
  type: 'image' | 'audio'
): Promise<string> {
  const endpoint = type === 'audio' 
    ? `${API_URL}/api/audio/upload`
    : `${API_URL}/api/wan-animate/upload-image`;
  
  const bodyKey = type === 'audio' ? 'audioDataUri' : 'imageDataUri';
  
  const csrfToken = await ensureCSRFToken();
  
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(csrfToken && { 'X-CSRF-Token': csrfToken })
    },
    credentials: 'include',
    body: JSON.stringify({ [bodyKey]: dataUri })
  });
  
  const data = await response.json();
  if (!data.success) {
    throw new Error(data.error || 'Upload failed');
  }
  
  return data.url;
}

// Pre-calculate total credits for a workflow
export function getWorkflowCredits(workflowId: string): number {
  const credits: Record<string, number> = {
    'ai-influencer': 4,
    'music-video': 20,
    'avatar-creator': 3,
    'remix-visualizer': 6
  };
  return credits[workflowId] || 0;
}

export default {
  getWorkflows,
  executeAIInfluencerVoice,
  executeAIInfluencerLipSync,
  executeMusicVideoMusic,
  executeMusicVideoVideo,
  executeAvatarCreatorGenerate,
  executeAvatarCreatorVariations,
  executeRemixVisualizerSeparate,
  executeRemixVisualizerVisualize,
  executeFullWorkflow,
  uploadWorkflowFile,
  getWorkflowCredits
};





