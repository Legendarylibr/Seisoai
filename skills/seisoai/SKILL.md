---
name: seisoai
description: AI image, video, music, audio, 3D, and LLM inference with x402 pay-per-request. Generate images with FLUX/FLUX-2, videos with Veo 3.1/LTX-2, music with CassetteAI, voice clone, lip sync, transcription, and Claude LLM inference. Create custom AI agents. Use when the user wants AI generation, creative content, chat completions, or agentic workflows.
metadata: {"openclaw":{"homepage":"https://seisoai.com","emoji":"🎨"}}
---

# Seisoai

Generate AI images, videos, music, audio, 3D models, and run LLM inference. Pay per request with USDC on Base — no account needed.

## When to use

- **Image generation**: Text-to-image, image editing, multi-image blending, 360° panoramas
- **Video generation**: Text-to-video, image-to-video, first/last frame animation
- **Music generation**: Music from text description with genre/tempo control
- **Sound effects**: Audio effects from text description
- **Audio tools**: Voice cloning, lip sync, audio separation, speech-to-text
- **3D generation**: Image-to-3D model conversion
- **LLM inference**: Chat completions with Claude models (Opus, Sonnet, Haiku)
- **Agent creation**: Build custom AI agents with selected tools
- **API key management**: Create API keys for programmatic access
- **LoRA training**: Fine-tune custom image models
- **Image tools**: Face swap, inpainting, outpainting, background removal
- **Agentic workflows**: Multi-step AI tool orchestration

## Base URL

Default: `https://seisoai.com`

## x402 Payment Flow

All endpoints support x402 pay-per-request. No account or API key needed.

**Pricing includes 30% markup over API costs.** All prices shown are the final x402 price.

1. Make request to endpoint
2. Server returns `HTTP 402` with `PAYMENT-REQUIRED` header (base64 encoded JSON)
3. Decode header to get payment requirements
4. Sign USDC payment on Base (eip155:8453) using wallet
5. Retry request with `PAYMENT-SIGNATURE` header
6. Server verifies via Coinbase CDP, executes, settles payment onchain
7. Response includes `x402.transactionHash` as proof

---

## Pricing Overview (x402 - includes 30% markup)

### Image Generation

| Endpoint | Model | API Cost | x402 Price | USDC Units |
|----------|-------|----------|------------|------------|
| `/api/generate/image` | FLUX Pro | $0.05 | $0.065 | 65000 |
| `/api/generate/image` | FLUX-2 | $0.025 | $0.0325 | 32500 |
| `/api/generate/image` | Nano Banana Pro | $0.25 | $0.325 | 325000 |

### Video Generation

| Endpoint | Model | API Cost | x402 Price | Notes |
|----------|-------|----------|------------|-------|
| `/api/generate/video` | Veo 3.1 | $0.10/sec | $0.13/sec | 4-8s duration |
| `/api/generate/video` | LTX-2 | $0.04/sec | $0.052/sec | 1-10s duration |

### Audio & Music

| Endpoint | Description | API Cost | x402 Price | USDC Units |
|----------|-------------|----------|------------|------------|
| `/api/generate/music` | Music generation | $0.02/min | $0.026/min | ~26000/min |
| `/api/audio/sfx` | Sound effects | $0.03 | $0.039 | 39000 |
| `/api/audio/voice-clone` | Voice clone/TTS | $0.02 | $0.026 | 26000 |
| `/api/audio/transcribe` | Speech-to-text | $0.01 | $0.013 | 13000 |
| `/api/generate/video-to-audio` | Video to audio | $0.05 | $0.065 | 65000 |

### Image Tools

| Endpoint | Description | API Cost | x402 Price | USDC Units |
|----------|-------------|----------|------------|------------|
| `/api/generate/upscale` | Image upscaling | $0.03 | $0.039 | 39000 |
| `/api/image-tools/face-swap` | Face swap | $0.02 | $0.026 | 26000 |
| `/api/image-tools/inpaint` | Inpainting | $0.02 | $0.026 | 26000 |
| `/api/image-tools/outpaint` | Outpainting | $0.02 | $0.026 | 26000 |
| `/api/image-tools/describe` | Image to text | $0.01 | $0.013 | 13000 |
| `/api/image-tools/background-remove` | Remove background | $0.015 | $0.0195 | 19500 |
| `/api/image-tools/depth-map` | Depth map | $0.015 | $0.0195 | 19500 |
| `/api/extract/layers` | Layer extraction | $0.03 | $0.039 | 39000 |

### 3D & Training

| Endpoint | Description | API Cost | x402 Price |
|----------|-------------|----------|------------|
| `/api/model3d/generate` | Image-to-3D (normal) | $0.15 | $0.195 |
| `/api/model3d/generate` | Image-to-3D (geometry) | $0.10 | $0.13 |
| `/api/training/start` | LoRA training | $0.002/step | $0.0026/step |
| `/api/training/inference` | LoRA inference | $0.05 | $0.065 |

### LLM & Prompt Lab

| Endpoint | Description | API Cost | x402 Price |
|----------|-------------|----------|------------|
| `/api/prompt-lab/chat` | Prompt assistance | $0.001 | $0.0013 |
| `/api/chat-assistant/message` | Claude chat | varies | varies |

---

## Image Generation

**Endpoint:** `POST /api/generate/image`

### Request

```json
{
  "prompt": "a sunset over mountains, oil painting style",
  "model": "flux-pro",
  "aspect_ratio": "16:9",
  "num_images": 1
}
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `prompt` | string | Yes | Text description of the image |
| `model` | string | No | `flux-pro` (default), `flux-2`, `nano-banana-pro` |
| `aspect_ratio` | string | No | `1:1`, `16:9`, `9:16`, `4:3`, `3:4` |
| `num_images` | number | No | Number of images (1-4, default 1) |
| `image_url` | string | No | Reference image URL for img2img editing |
| `image_urls` | array | No | Multiple reference images for multi-image editing |
| `seed` | number | No | Seed for reproducibility |
| `is_360` | boolean | No | Generate 360° panorama (forces nano-banana-pro) |
| `optimizePrompt` | boolean | No | LLM-optimize prompt for FLUX-2 |
| `enhancePrompt` | boolean | No | Enhance prompt (default true) |

### Image Models

| Model | x402 Price | Best for |
|-------|------------|----------|
| `flux-pro` | $0.065 | General purpose, fast, default |
| `flux-2` | $0.0325 | Photorealism, text/logos in images |
| `nano-banana-pro` | $0.325 | Premium quality, 360° panoramas |

### Response

```json
{
  "success": true,
  "images": ["https://fal.media/files/..."],
  "remainingCredits": 0,
  "creditsDeducted": 0,
  "x402": {
    "settled": true,
    "transactionHash": "0x..."
  }
}
```

---

## Video Generation

**Endpoint:** `POST /api/generate/video`

### Request

```json
{
  "prompt": "a cat walking through a garden",
  "model": "veo",
  "duration": "6s",
  "quality": "fast",
  "generate_audio": true
}
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `prompt` | string | Yes | Text description of the video |
| `model` | string | No | `veo` (quality) or `ltx` (budget) |
| `duration` | string | No | `4s`, `6s`, `8s` for Veo; 1-10s for LTX |
| `quality` | string | No | `fast` or `quality` |
| `resolution` | string | No | `720p` or `1080p` |
| `aspect_ratio` | string | No | `auto`, `16:9`, `9:16` |
| `generate_audio` | boolean | No | Generate synchronized audio (default true) |
| `generation_mode` | string | No | `text-to-video`, `image-to-video`, `first-last-frame` |
| `first_frame_url` | string | No | Starting frame image URL |
| `last_frame_url` | string | No | Ending frame image URL |

### Video Models

| Model | x402 Price | Best for |
|-------|------------|----------|
| `veo` (Veo 3.1) | $0.13/sec | Cinematic quality, complex scenes |
| `ltx` (LTX-2 19B) | $0.052/sec | Fast, affordable, simple scenes |

### Response

```json
{
  "success": true,
  "video": {
    "url": "https://fal.media/files/...",
    "content_type": "video/mp4"
  },
  "x402": {
    "settled": true,
    "transactionHash": "0x..."
  }
}
```

---

## Music Generation

**Endpoint:** `POST /api/generate/music`

### Request

```json
{
  "prompt": "upbeat jazz with piano and drums, Key: C Major, Tempo: 120 BPM",
  "duration": 60,
  "selectedGenre": "jazz",
  "optimizePrompt": true
}
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `prompt` | string | Yes | Description of the music (include genre, instruments, mood, tempo) |
| `duration` | number | No | Duration in seconds (10-180, default 60) |
| `selectedGenre` | string | No | Genre hint (lo-fi, electronic, orchestral, rock, jazz) |
| `optimizePrompt` | boolean | No | LLM-optimize the prompt |

### Pricing

- Base: $0.02/minute API cost
- x402: $0.026/minute (30% markup)
- 60 seconds = ~$0.026

---

## Sound Effects

**Endpoint:** `POST /api/audio/sfx`

### Request

```json
{
  "prompt": "thunder rumbling in the distance",
  "duration": 5
}
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `prompt` | string | Yes | Description of sound effect |
| `duration` | number | No | Duration in seconds (1-30, default 5) |

---

## Voice Clone / Text-to-Speech

**Endpoint:** `POST /api/audio/voice-clone`

Clone a voice from reference audio and generate speech.

### Request

```json
{
  "text": "Hello, this is a test of voice cloning.",
  "voice_url": "https://example.com/reference-voice.wav",
  "language": "en"
}
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `text` | string | Yes | Text to speak (max 5000 chars) |
| `voice_url` | string | No | Reference audio URL for cloning |
| `language` | string | No | Language code (default: `en`) |

---

## Lip Sync

**Endpoint:** `POST /api/audio/lip-sync`

Animate a portrait image to speak along with audio.

### Request

```json
{
  "image_url": "https://example.com/portrait.jpg",
  "audio_url": "https://example.com/speech.wav",
  "expression_scale": 1.0
}
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `image_url` | string | Yes | Portrait image URL (front-facing face) |
| `audio_url` | string | Yes | Audio file URL (speech) |
| `expression_scale` | number | No | Expressiveness (0.0-1.0, default 1.0) |

---

## Audio Separation (Stem Extraction)

**Endpoint:** `POST /api/audio/separate`

Separate audio into stems: vocals, drums, bass, other.

### Request

```json
{
  "audio_url": "https://example.com/song.mp3"
}
```

### Response

```json
{
  "success": true,
  "stems": {
    "vocals": "https://fal.media/files/vocals.wav",
    "drums": "https://fal.media/files/drums.wav",
    "bass": "https://fal.media/files/bass.wav",
    "other": "https://fal.media/files/other.wav"
  }
}
```

---

## Speech-to-Text (Transcription)

**Endpoint:** `POST /api/audio/transcribe`

Transcribe audio or video to text using Whisper.

### Request

```json
{
  "audio_url": "https://example.com/speech.mp3",
  "language": "en",
  "task": "transcribe",
  "chunk_level": "segment"
}
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `audio_url` | string | Yes | URL of audio/video file |
| `language` | string | No | Language code hint (auto-detected if omitted) |
| `task` | string | No | `transcribe` (default) or `translate` (to English) |
| `chunk_level` | string | No | `segment` (default) or `word` for word-level timestamps |

---

## Image Tools

### Face Swap

**Endpoint:** `POST /api/image-tools/face-swap`

```json
{
  "source_image_url": "https://example.com/face.jpg",
  "target_image_url": "https://example.com/target.jpg"
}
```

### Inpainting

**Endpoint:** `POST /api/image-tools/inpaint`

```json
{
  "image_url": "https://example.com/image.jpg",
  "mask_url": "https://example.com/mask.png",
  "prompt": "a red sports car"
}
```

### Outpainting

**Endpoint:** `POST /api/image-tools/outpaint`

```json
{
  "image_url": "https://example.com/image.jpg",
  "prompt": "extend the landscape",
  "direction": "all",
  "expansion_ratio": 1.5
}
```

### Image Description

**Endpoint:** `POST /api/image-tools/describe`

```json
{
  "image_url": "https://example.com/image.jpg",
  "detail_level": "detailed"
}
```

---

## 3D Model Generation

**Endpoint:** `POST /api/model3d/generate`

Convert an image to a 3D model (GLB format) using Hunyuan3D V3.

### Request

```json
{
  "image_url": "https://example.com/object.jpg",
  "generate_type": "Normal"
}
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `image_url` | string | Yes | URL of source image |
| `generate_type` | string | No | `Normal` ($0.195), `Geometry` ($0.13), `LowPoly` ($0.104) |

---

## LoRA Training

**Endpoint:** `POST /api/training/submit`

Train custom LoRA models.

### Request

```json
{
  "trainer": "flux-lora-fast",
  "images_data_url": "https://example.com/training-images.zip",
  "trigger_word": "mystyle",
  "steps": 1000,
  "walletAddress": "0x..."
}
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `trainer` | string | Yes | `flux-lora-fast` or `flux-2-trainer` |
| `images_data_url` | string | Yes | URL to zip archive with training images |
| `trigger_word` | string | No | Trigger word for the LoRA |
| `steps` | number | No | Training steps (100-10000, default 1000) |

### Pricing

- FLUX LoRA Fast: $0.0026/step (1000 steps = $2.60)
- FLUX 2 Trainer: $0.0104/step (1000 steps = $10.40)

---

## Custom Agent Creation

**Endpoint:** `POST /api/agents/create`

Create a custom AI agent with selected tools.

### Request

```json
{
  "name": "My Image Agent",
  "description": "Generates high-quality images",
  "type": "Image Generation",
  "tools": ["image.generate.flux-pro", "image.generate.flux-2"],
  "walletAddress": "0x..."
}
```

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `name` | string | Yes | Agent name (1-64 chars) |
| `description` | string | Yes | Agent description (1-256 chars) |
| `type` | string | Yes | `Image Generation`, `Video Generation`, `Music Generation`, `Chat/Assistant`, `Multi-Modal`, `Custom` |
| `tools` | array | Yes | Array of tool IDs from the tool registry |
| `walletAddress` | string | Yes | Owner wallet address |
| `systemPrompt` | string | No | Custom system prompt for the agent |
| `skillMd` | string | No | Custom skill markdown |

### Response

```json
{
  "success": true,
  "agent": {
    "agentId": "custom-abc123-1707234567890",
    "name": "My Image Agent",
    "description": "Generates high-quality images",
    "type": "Image Generation",
    "tools": ["image.generate.flux-pro", "image.generate.flux-2"],
    "owner": "0x...",
    "agentURI": "data:application/json;base64,...",
    "invokeUrl": "https://seisoai.com/api/gateway/agent/custom-abc123/invoke"
  }
}
```

### Other Agent Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/agents/list` | GET | List all custom agents |
| `/api/agents/custom/:address` | GET | Get agents owned by address |
| `/api/agents/:agentId` | GET | Get agent by ID |
| `/api/agents/custom/:agentId` | DELETE | Delete a custom agent |

---

## API Key Management

Create API keys for programmatic access with credit allocation.

### Create API Key

**Endpoint:** `POST /api/api-keys`

```json
{
  "name": "My Agent Key",
  "credits": 100,
  "rateLimitPerMinute": 60,
  "rateLimitPerDay": 10000,
  "allowedTools": ["image.generate.flux-pro"],
  "webhookUrl": "https://my-app.com/webhook"
}
```

### Response

```json
{
  "success": true,
  "apiKey": {
    "key": "sk_live_abc123...",
    "keyPrefix": "sk_live_abc",
    "name": "My Agent Key",
    "credits": 100
  }
}
```

**Important:** The full API key is only returned once at creation time.

### Other API Key Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/api-keys` | GET | List all API keys |
| `/api/api-keys/:keyId` | GET | Get API key details |
| `/api/api-keys/:keyId` | PUT | Update API key settings |
| `/api/api-keys/:keyId/top-up` | POST | Add credits to API key |
| `/api/api-keys/:keyId` | DELETE | Revoke API key (returns remaining credits) |

---

## LLM Chat (Claude Inference)

**Endpoint:** `POST /api/chat-assistant/message`

Chat with Claude models for conversational AI and content generation assistance.

### Request

```json
{
  "message": "Help me create a prompt for a fantasy landscape",
  "history": [],
  "model": "claude-sonnet-4-5",
  "referenceImage": "https://example.com/ref.jpg"
}
```

### Available Claude Models

| Model | Description |
|-------|-------------|
| `claude-haiku-4-5` | Fast, simple tasks |
| `claude-sonnet-4-5` | Balanced speed/quality (default) |
| `claude-opus-4-6` | Complex reasoning, agentic tasks |

### Response

```json
{
  "success": true,
  "response": "Here's a prompt for a fantasy landscape...",
  "action": {
    "action": "generate_image",
    "params": {
      "prompt": "Mystical floating islands...",
      "model": "flux-pro"
    },
    "estimatedCredits": 0.5
  },
  "model": "claude-sonnet-4-5"
}
```

---

## Agentic Chat (Autonomous AI)

**Endpoint:** `POST /api/chat-assistant/agent-message`

Autonomous agent that uses tools to accomplish creative tasks.

### Request

```json
{
  "message": "Create a music video: generate an image of a sunset, animate it, add music",
  "model": "claude-sonnet-4-5",
  "autonomous": true,
  "maxIterations": 5
}
```

Supports SSE streaming for real-time progress updates.

---

## Agentic Gateway

Unified API for AI agents to discover and invoke all SeisoAI tools.

### Tool Discovery

**Endpoint:** `GET /api/gateway/tools`

Returns all available tools with pricing and schemas.

### Tool Invocation

**Endpoint:** `POST /api/gateway/invoke/:toolId`

```json
{
  "prompt": "A beautiful sunset over mountains",
  "num_images": 1
}
```

### Orchestration

**Endpoint:** `POST /api/gateway/orchestrate`

```json
{
  "goal": "Create a music video: generate an image, animate it, add music",
  "planOnly": false
}
```

### Agent-Scoped Invocation

**Endpoint:** `POST /api/gateway/agent/:agentId/invoke/:toolId`

Invoke tools through a specific custom agent.

---

## Workflows

Pre-built multi-step AI pipelines.

### Available Workflows

| Workflow | Description | Credits |
|----------|-------------|---------|
| `ai-influencer` | Portrait + Script → Voice → Lip Sync | 4 |
| `music-video` | Describe → Music → Video → Combine | 20 |
| `avatar-creator` | Describe → Generate → Variations | 3 |
| `remix-visualizer` | Upload → Separate Stems → Mix | 2 |

**Endpoint:** `GET /api/workflows/list`
**Endpoint:** `POST /api/workflows/{workflow-id}`

---

## Error Handling

### HTTP 402 - Payment Required

Normal response when x402 payment is needed. The `PAYMENT-REQUIRED` header contains base64-encoded payment requirements.

```json
{
  "x402Version": 2,
  "error": "Payment required",
  "resource": {
    "url": "https://seisoai.com/api/generate/image",
    "description": "Generate an AI image"
  },
  "accepts": [{
    "scheme": "exact",
    "network": "eip155:8453",
    "maxAmountRequired": "65000",
    "asset": "USDC",
    "payTo": "0x...",
    "extra": {
      "priceUsd": "$0.0650"
    }
  }]
}
```

### HTTP 400 - Bad Request

```json
{
  "success": false,
  "error": "prompt is required"
}
```

### HTTP 500 - Server Error

```json
{
  "success": false,
  "error": "Image generation failed",
  "creditsRefunded": 0
}
```

---

## Config

```json
{
  "skills": {
    "entries": {
      "seisoai": {
        "enabled": true,
        "config": {
          "apiUrl": "https://seisoai.com"
        }
      }
    }
  }
}
```
