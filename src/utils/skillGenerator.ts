/**
 * SKILL.md Generator
 * Generates Cursor-compatible SKILL.md files from agent definitions.
 * All generated skills route through Seiso's API with x402 payment.
 */

export interface AgentToolDef {
  id: string;
  name: string;
  description: string;
  category: string;
  endpoint: string;
  method: string;
  usdcUnits: number;
  usdPrice: string;
  params: ToolParam[];
  responseExample: string;
}

interface ToolParam {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

// Master tool catalog — maps tool IDs to Seiso API endpoint details
const TOOL_CATALOG: Record<string, AgentToolDef> = {
  'image.generate.flux-pro-kontext': {
    id: 'image.generate.flux-pro-kontext',
    name: 'Image Generation (Flux Pro Kontext)',
    description: 'Generate images using Flux Pro Kontext model — fast, general-purpose',
    category: 'image-generation',
    endpoint: 'POST /api/generate/image',
    method: 'POST',
    usdcUnits: 65000,
    usdPrice: '$0.065',
    params: [
      { name: 'prompt', type: 'string', required: true, description: 'Text description of the image' },
      { name: 'model', type: 'string', required: false, description: 'Set to "flux-pro"' },
      { name: 'aspect_ratio', type: 'string', required: false, description: '"1:1", "16:9", "9:16", "4:3", "3:4"' },
      { name: 'num_images', type: 'number', required: false, description: 'Number of images (1-4)' },
    ],
    responseExample: '{\n  "success": true,\n  "images": ["https://fal.media/files/..."],\n  "x402": { "settled": true, "transactionHash": "0x..." }\n}',
  },
  'image.generate.flux-2': {
    id: 'image.generate.flux-2',
    name: 'Image Generation (Flux 2)',
    description: 'Generate photorealistic images and text/logos in images',
    category: 'image-generation',
    endpoint: 'POST /api/generate/image',
    method: 'POST',
    usdcUnits: 32500,
    usdPrice: '$0.0325',
    params: [
      { name: 'prompt', type: 'string', required: true, description: 'Text description of the image' },
      { name: 'model', type: 'string', required: false, description: 'Set to "flux-2"' },
      { name: 'aspect_ratio', type: 'string', required: false, description: '"1:1", "16:9", "9:16", "4:3", "3:4"' },
      { name: 'image_url', type: 'string', required: false, description: 'Reference image URL for img2img editing' },
    ],
    responseExample: '{\n  "success": true,\n  "images": ["https://fal.media/files/..."],\n  "x402": { "settled": true, "transactionHash": "0x..." }\n}',
  },
  'image.generate.nano-banana-pro': {
    id: 'image.generate.nano-banana-pro',
    name: 'Image Generation (Nano Banana Pro)',
    description: 'Premium quality images and 360° panoramas',
    category: 'image-generation',
    endpoint: 'POST /api/generate/image',
    method: 'POST',
    usdcUnits: 325000,
    usdPrice: '$0.325',
    params: [
      { name: 'prompt', type: 'string', required: true, description: 'Text description of the image' },
      { name: 'model', type: 'string', required: false, description: 'Set to "nano-banana-pro"' },
      { name: 'is_360', type: 'boolean', required: false, description: 'Generate 360° panorama' },
    ],
    responseExample: '{\n  "success": true,\n  "images": ["https://fal.media/files/..."],\n  "x402": { "settled": true, "transactionHash": "0x..." }\n}',
  },
  'image.upscale': {
    id: 'image.upscale',
    name: 'Image Upscaling',
    description: 'Upscale and enhance image resolution',
    category: 'image-processing',
    endpoint: 'POST /api/generate/upscale',
    method: 'POST',
    usdcUnits: 39000,
    usdPrice: '$0.039',
    params: [
      { name: 'image_url', type: 'string', required: true, description: 'URL of image to upscale' },
      { name: 'scale', type: 'number', required: false, description: '2 (default) or 4' },
    ],
    responseExample: '{\n  "success": true,\n  "image_url": "https://fal.media/files/...",\n  "x402": { "settled": true, "transactionHash": "0x..." }\n}',
  },
  'video.generate.veo3': {
    id: 'video.generate.veo3',
    name: 'Video Generation (Veo 3.1)',
    description: 'Generate short cinematic videos from text prompts',
    category: 'video-generation',
    endpoint: 'POST /api/generate/video',
    method: 'POST',
    usdcUnits: 650000,
    usdPrice: '$0.65',
    params: [
      { name: 'prompt', type: 'string', required: true, description: 'Text description of the video' },
      { name: 'duration', type: 'string', required: false, description: '"4s", "6s", or "8s"' },
      { name: 'image_url', type: 'string', required: false, description: 'Starting frame image URL' },
      { name: 'generate_audio', type: 'boolean', required: false, description: 'Generate synchronized audio' },
    ],
    responseExample: '{\n  "success": true,\n  "video": { "url": "https://fal.media/files/...", "content_type": "video/mp4" },\n  "x402": { "settled": true, "transactionHash": "0x..." }\n}',
  },
  'music.generate': {
    id: 'music.generate',
    name: 'Music Generation',
    description: 'Generate music and audio from text descriptions',
    category: 'music-generation',
    endpoint: 'POST /api/generate/music',
    method: 'POST',
    usdcUnits: 26000,
    usdPrice: '$0.026',
    params: [
      { name: 'prompt', type: 'string', required: true, description: 'Description of the music' },
      { name: 'duration', type: 'number', required: false, description: 'Duration in seconds (10-180)' },
    ],
    responseExample: '{\n  "success": true,\n  "audio_file": { "url": "https://fal.media/files/...", "content_type": "audio/wav" },\n  "x402": { "settled": true, "transactionHash": "0x..." }\n}',
  },
  'audio.sfx': {
    id: 'audio.sfx',
    name: 'Sound Effects',
    description: 'Generate sound effects from text descriptions',
    category: 'audio-generation',
    endpoint: 'POST /api/audio/sfx',
    method: 'POST',
    usdcUnits: 39000,
    usdPrice: '$0.039',
    params: [
      { name: 'prompt', type: 'string', required: true, description: 'Description of sound effect' },
      { name: 'duration', type: 'number', required: false, description: 'Duration in seconds (1-30)' },
    ],
    responseExample: '{\n  "success": true,\n  "audio_url": "https://fal.media/files/...",\n  "x402": { "settled": true, "transactionHash": "0x..." }\n}',
  },
  'text.llm': {
    id: 'text.llm',
    name: 'Prompt Lab (Chat)',
    description: 'AI assistance for crafting prompts and creative planning',
    category: 'text-generation',
    endpoint: 'POST /api/prompt-lab/chat',
    method: 'POST',
    usdcUnits: 1300,
    usdPrice: '$0.0013',
    params: [
      { name: 'message', type: 'string', required: true, description: 'Your question or request' },
      { name: 'context.mode', type: 'string', required: false, description: '"image", "video", "music"' },
    ],
    responseExample: '{\n  "success": true,\n  "response": "Here\'s a prompt...",\n  "x402": { "settled": true, "transactionHash": "0x..." }\n}',
  },
};

// Predefined tool sets by agent type
export const AGENT_TYPE_TOOLS: Record<string, string[]> = {
  'Image Generation': [
    'image.generate.flux-pro-kontext',
    'image.generate.flux-2',
    'image.generate.nano-banana-pro',
    'image.upscale',
  ],
  'Video Generation': ['video.generate.veo3'],
  'Music Generation': ['music.generate', 'audio.sfx'],
  'Chat/Assistant': ['text.llm'],
  'Multi-Modal': [
    'image.generate.flux-pro-kontext',
    'image.generate.flux-2',
    'video.generate.veo3',
    'music.generate',
    'audio.sfx',
    'text.llm',
  ],
  'Custom': [],
};

// Get available tool IDs
export function getAvailableTools(): AgentToolDef[] {
  return Object.values(TOOL_CATALOG);
}

// Get tool details by ID
export function getToolById(toolId: string): AgentToolDef | undefined {
  return TOOL_CATALOG[toolId];
}

// Get default tools for an agent type
export function getDefaultToolsForType(agentType: string): string[] {
  return AGENT_TYPE_TOOLS[agentType] || [];
}

export interface SkillAgentInput {
  name: string;
  description: string;
  type: string;
  tools: string[];
  baseUrl?: string;
}

/**
 * Generate a SKILL.md file from an agent definition.
 * All endpoints route through Seiso's API with x402 payment.
 */
export function generateSkillMd(agent: SkillAgentInput): string {
  const baseUrl = agent.baseUrl || 'https://seisoai.com';
  const slugName = agent.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const selectedTools = agent.tools
    .map((id) => TOOL_CATALOG[id])
    .filter(Boolean);

  // Build "When to use" section
  const whenToUse = selectedTools.map((tool) => {
    return `- **${tool.name}**: ${tool.description}`;
  });

  // Build endpoints table
  const endpointsTable = selectedTools.map((tool) => {
    return `| \`${tool.endpoint}\` | ${tool.name} | ${tool.usdcUnits} | ${tool.usdPrice} |`;
  });

  // Build per-tool documentation sections
  const toolSections = selectedTools.map((tool) => {
    const paramsTable = tool.params
      .map((p) => `| \`${p.name}\` | ${p.type} | ${p.required ? 'Yes' : 'No'} | ${p.description} |`)
      .join('\n');

    const requestBody: Record<string, unknown> = {};
    tool.params.forEach((p) => {
      if (p.required) {
        if (p.type === 'string') requestBody[p.name] = p.name === 'prompt' ? `a sample ${tool.category} prompt` : 'value';
        else if (p.type === 'number') requestBody[p.name] = 1;
        else if (p.type === 'boolean') requestBody[p.name] = true;
      }
    });

    return `
## ${tool.name}

**Endpoint:** \`${tool.endpoint}\`

### Request

\`\`\`json
${JSON.stringify(requestBody, null, 2)}
\`\`\`

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
${paramsTable}

### Response

\`\`\`json
${tool.responseExample}
\`\`\`
`;
  });

  return `---
name: ${slugName}
description: ${agent.description}
metadata: {"openclaw":{"homepage":"${baseUrl}","emoji":"🤖"}}
---

# ${agent.name}

${agent.description}

## When to use

${whenToUse.join('\n')}

## Base URL

Default: \`${baseUrl}\`

Override via config: \`skills.entries.${slugName}.config.apiUrl\`

## x402 Payment Flow

All endpoints require x402 payment. No account or API key needed.

1. Make request to endpoint
2. Server returns \`HTTP 402\` with \`PAYMENT-REQUIRED\` header
3. Decode base64 header to get payment requirements
4. Sign USDC payment on Base (eip155:8453) using wallet
5. Retry same request with \`PAYMENT-SIGNATURE\` header
6. Server verifies, executes, settles payment onchain
7. Response includes \`x402.transactionHash\` as proof

## Endpoints

| Endpoint | Description | USDC Units | USD |
|----------|-------------|------------|-----|
${endpointsTable.join('\n')}

---
${toolSections.join('\n---\n')}

## Error Handling

### HTTP 402 - Payment Required

Normal response when payment is needed. Decode \`PAYMENT-REQUIRED\` header and retry with payment.

### HTTP 400 - Bad Request

\`\`\`json
{
  "success": false,
  "error": "prompt is required"
}
\`\`\`

### HTTP 500 - Server Error

\`\`\`json
{
  "success": false,
  "error": "Generation failed",
  "creditsRefunded": 0
}
\`\`\`

---

## Config

\`\`\`json
{
  "skills": {
    "entries": {
      "${slugName}": {
        "enabled": true,
        "config": {
          "apiUrl": "${baseUrl}"
        }
      }
    }
  }
}
\`\`\`
`;
}
