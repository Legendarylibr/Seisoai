# SeisoAI Discord Bot 🤖

A Discord bot that brings all of SeisoAI's AI generation capabilities directly to Discord. Generate images, videos, music, and 3D models using simple slash commands.

## Features

- 🖼️ **Image Generation** - Create stunning AI images with FLUX models
- 🎬 **Video Generation** - Generate AI videos with Veo 3.1 (4-8 seconds)
- 🎵 **Music Generation** - Create original AI music with CassetteAI
- 📦 **3D Model Generation** - Convert images to 3D models with Hunyuan3D V3
- 💰 **Credit System** - Integrated credit management synced with website
- 🔗 **Account Linking** - Connect Discord to SeisoAI accounts
- 🏠 **Private Channels** - Optional private generation spaces for users

## Commands

| Command | Description | Cost |
|---------|-------------|------|
| `/imagine` | Generate AI images | 1-4 credits |
| `/video` | Generate AI videos | 4-10 credits |
| `/music` | Generate AI music | 1-4 credits |
| `/3d` | Create 3D models from images | 2-3 credits |
| `/credits` | Check credit balance | Free |
| `/link` | Link SeisoAI account | Free |
| `/help` | Get help with commands | Free |
| `/admin` | Bot administration (admin only) | Free |

## Quick Start

### 1. Create a Discord Application

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application" and give it a name
3. Go to "Bot" section and click "Add Bot"
4. Copy the bot token (you'll need this later)
5. Enable these Privileged Gateway Intents:
   - `PRESENCE INTENT`
   - `SERVER MEMBERS INTENT`
   - `MESSAGE CONTENT INTENT`

### 2. Set Up OAuth2

1. Go to "OAuth2" > "URL Generator"
2. Select these scopes:
   - `bot`
   - `applications.commands`
3. Select these bot permissions:
   - Send Messages
   - Send Messages in Threads
   - Create Public Threads
   - Create Private Threads
   - Embed Links
   - Attach Files
   - Read Message History
   - Use Slash Commands
   - Manage Channels (for private channels feature)
4. Copy the generated URL and use it to invite the bot to your server

### 3. Configure Environment

```bash
cd discord-bot
cp env.example .env
```

Edit `.env` with your credentials:

```env
# Discord Bot Configuration
DISCORD_TOKEN=your_discord_bot_token
DISCORD_CLIENT_ID=your_discord_client_id
DISCORD_GUILD_ID=your_guild_id_for_testing  # Optional: for faster command deployment

# MongoDB Connection (same as main backend)
MONGODB_URI=mongodb://localhost:27017/seisoai

# FAL.ai API Key (same as main backend)
FAL_API_KEY=your_fal_api_key

# Bot Settings
PRIVATE_CHANNEL_CATEGORY_ID=  # Optional: category ID for private channels

# Website URL
WEBSITE_URL=https://your-seisoai-domain.com
```

### 4. Install Dependencies

```bash
npm install
```

### 5. Deploy Commands

Deploy slash commands to Discord:

```bash
npm run deploy-commands
```

> Note: Global commands can take up to 1 hour to propagate. Guild-specific commands (if `DISCORD_GUILD_ID` is set) are instant.

### 6. Start the Bot

Development mode (with hot reload):
```bash
npm run dev
```

Production mode:
```bash
npm run build
npm start
```

## Project Structure

```
discord-bot/
├── src/
│   ├── commands/          # Slash command handlers
│   │   ├── imagine.ts     # /imagine command
│   │   ├── video.ts       # /video command
│   │   ├── music.ts       # /music command
│   │   ├── 3d.ts          # /3d command
│   │   ├── credits.ts     # /credits command
│   │   ├── link.ts        # /link command
│   │   ├── help.ts        # /help command
│   │   ├── admin.ts       # /admin command (server admins)
│   │   └── index.ts       # Command registry
│   ├── config/
│   │   └── index.ts       # Configuration loader
│   ├── database/
│   │   ├── models/
│   │   │   └── DiscordUser.ts  # Discord user model
│   │   └── index.ts       # Database connection
│   ├── services/
│   │   ├── fal.ts         # FAL.ai API service
│   │   ├── channels.ts    # Private channel management
│   │   └── management.ts  # Bot management (rate limits, permissions)
│   ├── utils/
│   │   ├── logger.ts      # Winston logger
│   │   ├── logSanitizer.ts # Log sanitization for security
│   │   └── encryption.ts  # Field-level encryption utilities
│   ├── deploy-commands.ts # Command deployment script
│   └── index.ts           # Main entry point
├── env.example
├── package.json
├── tsconfig.json
└── README.md
```

## Usage Examples

### Generate an Image
```
/imagine prompt:a beautiful sunset over mountains style:cinematic aspect:16:9
```

### Generate a Video
```
/video prompt:a cat playing piano duration:8s resolution:720p audio:true
```

### Generate Music
```
/music prompt:upbeat electronic dance track genre:electronic duration:60
```

### Create a 3D Model
```
/3d image:[attach your image] type:Normal faces:500000 pbr:true
```

## Credit Costs

### Images
- 1 credit per image
- Multiple images: 1 credit each (up to 4)

### Videos
- 4s: 4 credits
- 6s: 6 credits
- 8s: 8 credits
- +2 credits if audio is enabled

### Music
- ≤30s: 1 credit
- ≤60s: 2 credits
- ≤120s: 3 credits
- ≤180s: 4 credits

### 3D Models
- Normal/LowPoly: 3 credits
- Geometry (no texture): 2 credits

## Integration with Main Backend

The Discord bot uses the same database as the main SeisoAI backend. Users can:

1. **Link Accounts**: Use `/link email` or `/link wallet` to connect their SeisoAI account
2. **Sync Credits**: Credits are synced between Discord and the website
3. **Shared History**: Generations appear in both platforms

## Deployment

### Using PM2

```bash
npm run build
pm2 start dist/index.js --name seisoai-discord-bot
```

### Using Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
CMD ["node", "dist/index.js"]
```

### Environment Variables for Production

```env
NODE_ENV=production
LOG_LEVEL=info
```

## Troubleshooting

### Commands not appearing
- Run `npm run deploy-commands` to register commands
- Global commands take up to 1 hour to appear
- For instant testing, set `DISCORD_GUILD_ID` in your .env

### "Unknown interaction" errors
- Ensure the bot has proper permissions in the server
- Check that commands are deployed correctly

### Database connection issues
- Verify `MONGODB_URI` is correct
- Ensure MongoDB is running and accessible

### Generation timeouts
- Video generation can take up to 10 minutes
- 3D model generation can take up to 7 minutes
- The bot will show progress updates during long generations

## Support

For issues or questions:
- Create an issue on GitHub
- Visit our website: https://seisoai.com
- Join our Discord community

## License

MIT License - See LICENSE file for details

