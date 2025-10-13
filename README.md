# AI Image Generator

A modern, responsive web application for generating AI images using FAL.ai as the backend. Users can select from popular visual styles without typing prompts, and optionally upload ControlNet input images for more control over the generation process.

## 🔒 Security Notice

**CRITICAL**: This application requires proper environment configuration before deployment. See [SECURITY_CHECKLIST.md](./SECURITY_CHECKLIST.md) for complete security setup instructions.

## ⚠️ Before Running

1. **Copy environment files**:
   ```bash
   cp env.example .env
   cp backend/env.example backend/.env
   ```

2. **Configure all required environment variables** (see Security Checklist)

3. **Never commit real API keys or wallet addresses to version control**

## Features

- 🎨 **Style Selection**: Choose from 8 popular visual styles (Cyberpunk, Ghibli, Dark Fantasy, Vaporwave, Anime, etc.)
- 🖼️ **ControlNet Support**: Upload images for pose, depth, scribble, or edge detection control
- 📱 **Responsive Design**: Works perfectly on desktop, tablet, and mobile devices
- ⚡ **Real-time Generation**: Live loading states and smooth transitions
- 💾 **Download & Regenerate**: Save generated images and create variations
- 🎯 **No Prompts Required**: Pre-configured prompts for each style
- 🌟 **Modern UI**: Clean, glass-morphism design with Tailwind CSS

## Tech Stack

- **Frontend**: React 18 with Vite
- **Styling**: Tailwind CSS with custom animations
- **State Management**: React Context API
- **Icons**: Lucide React
- **Backend**: FAL.ai API

## Getting Started

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- FAL.ai API key

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd ai-image-generator
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
Create a `.env` file in the root directory:
```env
VITE_FAL_API_KEY=your_fal_api_key_here
```

4. Start the development server:
```bash
npm run dev
```

5. Open your browser and navigate to `http://localhost:5173`

### Building for Production

```bash
npm run build
```

The built files will be in the `dist` directory.

## Usage

1. **Select a Style**: Choose from the grid of visual styles (Cyberpunk, Ghibli, Dark Fantasy, etc.)
2. **Upload Control Image** (Optional): Select a ControlNet type and upload an image for more control
3. **Generate**: Click the "Generate Image" button to create your AI artwork
4. **Download**: Save your generated image or regenerate with the same settings

## Available Styles

- **Cyberpunk**: Neon-lit futuristic cityscapes
- **Studio Ghibli**: Whimsical animated landscapes
- **Dark Fantasy**: Mysterious magical realms
- **Vaporwave**: Retro-futuristic aesthetics
- **Anime**: Japanese animation style
- **Steampunk**: Victorian-era technology
- **Minimalist**: Clean and simple designs
- **Watercolor**: Soft painted effects

## ControlNet Types

- **Pose**: Human pose detection
- **Depth**: Depth map generation
- **Scribble**: Hand-drawn sketches
- **Canny**: Edge detection

## API Configuration

The application uses FAL.ai's Flux model for image generation. Make sure to:

1. Get your API key from [FAL.ai](https://fal.ai)
2. Add it to your `.env` file as `REACT_APP_FAL_API_KEY`
3. Ensure you have sufficient credits for image generation

## Customization

### Adding New Styles

Edit `src/utils/styles.js` to add new visual styles:

```javascript
{
  id: 'your-style',
  name: 'Your Style',
  description: 'Description of your style',
  emoji: '🎨',
  prompt: 'Your detailed prompt here',
  gradient: 'from-color-500 to-color-600'
}
```

### Modifying Prompts

Each style has a pre-configured prompt that gets sent to the FAL.ai API. You can modify these in the `VISUAL_STYLES` array in `src/utils/styles.js`.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is open source and available under the [MIT License](LICENSE).

## Support

If you encounter any issues or have questions, please open an issue on GitHub.
# Seisoai
