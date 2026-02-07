---
name: seisoai
description: AI media generation. Images, videos, music, audio, 3D. x402 pay-per-request on Base.
metadata: {"openclaw":{"homepage":"https://seisoai.com","emoji":"🎨"}}
---

# Seisoai

**Base:** `https://seisoai.com`  
**Endpoint:** `POST /api/gateway/invoke/{toolId}`  
**Auth:** `X-API-Key: sk_live_...` or x402 payment

---

## Quick Start

```http
POST https://seisoai.com/api/gateway/invoke/image.generate.flux-2
Content-Type: application/json
X-API-Key: sk_live_xxx

{"prompt": "a sunset over mountains"}
```

That's it. Just `prompt` and you get an image.

---

## Tools

| Task | toolId | Just need |
|------|--------|-----------|
| Image | `image.generate.flux-2` | `prompt` |
| Video | `video.generate.veo3` | `prompt` |
| Music | `music.generate` | `prompt` |
| Sound FX | `audio.sfx` | `prompt` |
| Edit image | `image.generate.flux-pro-kontext` | `prompt` + `image_url` |
| Animate image | `video.generate.veo3-image-to-video` | `prompt` + `image_url` |
| Voice clone | `audio.tts` | `text` + `voice_url` |
| Transcribe | `audio.transcribe` | `audio_url` |
| Face swap | `image.face-swap` | `source_image_url` + `target_image_url` |
| Remove BG | `image.extract-layer` | `image_url` |
| Upscale | `image.upscale` | `image_url` |
| 3D model | `3d.image-to-3d` | `image_url` |

---

## Flexible Input

The API normalizes your input automatically:

| You send | We accept |
|----------|-----------|
| `"imageUrl"` | → `image_url` |
| `"sourceImageUrl"` | → `source_image_url` |
| `"numImages"` | → `num_images` |
| `"generateAudio"` | → `generate_audio` |
| `"duration": "60"` | → `60` (number) |
| `"duration": 60` | → `"60s"` (string, for video) |
| `"num_images": "2"` | → `2` (number) |
| `"generate_audio": "true"` | → `true` (boolean) |

**camelCase or snake_case** — both work.  
**Strings or numbers** — we coerce to the right type.  
**Missing defaults** — we apply them from the schema.

---

## Common Options

**Image:** `image_size` (square, landscape_16_9, portrait_16_9), `num_images` (1-4)

**Video:** `duration` (4s, 6s, 8s for veo; 1-10s for ltx), `generate_audio` (true/false)

**Music:** `duration` (10-180 seconds)

---

## Response

```json
{
  "success": true,
  "result": {
    "images": [{"url": "https://..."}]
  }
}
```

- Images: `result.images[0].url`
- Video: `result.video.url`
- Audio/Music: `result.audio_file.url`

---

## Auth Options

**API Key** (easiest): Get at `https://seisoai.com/settings/api-keys`, add header `X-API-Key: sk_live_...`

**x402**: No key needed. First call returns 402, sign USDC on Base, retry with signature.

---

## Errors

| Code | Meaning |
|------|---------|
| 400 | Missing required field (usually just `prompt`) |
| 402 | Add API key or sign payment |
| 500 | Retry |

---

## Discovery

```
GET /api/gateway/tools
```

Returns all tools with schemas. But usually just `prompt` is enough.
