---
name: seisoai
description: AI image, music, video, and sound effects generation with x402 pay-per-request.
metadata: {"openclaw":{"homepage":"https://seisoai.com","emoji":"🎨"}}
---

# Seisoai

Generate AI images, music, videos, and sound effects. Pay per request with USDC on Base — no account needed.

## When to use

- **Image generation**: User wants pictures from a text prompt
- **Music generation**: User wants music or audio from a description
- **Video generation**: User wants short video from a prompt or image
- **Sound effects**: User wants audio effects from a description
- **Prompt help**: User wants help brainstorming or refining prompts

## Base URL

Default: `https://seisoai.com`

Override via config: `SEISOAI_API_URL` or `skills.entries.seisoai.config.apiUrl`

## Endpoints

All endpoints use x402 payment. Make request → get 402 → sign USDC payment → retry with `PAYMENT-SIGNATURE` header.

| Endpoint | Description | Price (USDC) |
|----------|-------------|--------------|
| `POST /api/generate/image` | Generate image (Flux Pro) | $0.065 |
| `POST /api/generate/image` | Generate image (Flux 2) | $0.033 |
| `POST /api/generate/image` | Generate image (Nano Banana) | $0.325 |
| `POST /api/generate/video` | Generate video (~5 sec) | $0.65 |
| `POST /api/generate/music` | Generate music (1 min) | $0.026 |
| `POST /api/generate/upscale` | Upscale an image | $0.039 |
| `POST /api/audio/sfx` | Generate sound effects | $0.039 |
| `POST /api/prompt-lab/chat` | Prompt brainstorming | $0.0013 |

Prices are 30% above Fal.ai API costs. Image price varies by model (pass `model` in body). Payments settle on Base mainnet.

## How to invoke

### Image generation

```
POST {base}/api/generate/image
Content-Type: application/json

{"prompt": "a sunset over mountains", "model": "flux-pro"}
```

Models: `flux-pro` (default, $0.065), `flux-2` ($0.033), `nano-banana-pro` ($0.325)

Response: `{"requestId": "abc123"}` — then poll status.

### Poll for result

```
GET {base}/api/generate/status/{requestId}
GET {base}/api/generate/result/{requestId}
```

### x402 payment flow

1. Call endpoint without auth
2. Server returns `HTTP 402` with `PAYMENT-REQUIRED` header (base64 JSON with payment details)
3. Sign USDC payment on Base using your wallet
4. Retry same request with `PAYMENT-SIGNATURE` header containing signed payment
5. Server verifies, settles payment, executes request

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
