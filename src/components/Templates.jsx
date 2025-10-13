import React, { useState } from 'react';
import { useImageGenerator } from '../contexts/ImageGeneratorContext';
import { Sparkles, Copy, Download, Star, Clock, Zap } from 'lucide-react';

const Templates = () => {
  const { selectStyle, setControlNetType } = useImageGenerator();
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState('All');

  const templates = [
    {
      id: 'professional-headshot',
      name: 'Professional Headshot',
      description: 'High-quality business portrait',
      category: 'Professional',
      emoji: '👔',
      style: {
        id: 'portrait',
        name: 'Portrait',
        emoji: '👤',
        prompt: 'professional portrait photography, studio lighting, sharp focus, detailed facial features, high quality, commercial photography style',
        category: 'Photorealistic'
      },
      settings: {
        guidanceScale: 8.0,
        numInferenceSteps: 30,
        imageSize: 'portrait_4_3',
        controlNetType: 'pose'
      },
      prompt: 'professional business headshot, clean background, confident expression, corporate attire',
      popularity: 95,
      timeEstimate: '2-3 min'
    },
    {
      id: 'product-photography',
      name: 'Product Photography',
      description: 'E-commerce product shots',
      category: 'Professional',
      emoji: '📦',
      style: {
        id: 'product',
        name: 'Product',
        emoji: '📦',
        prompt: 'product photography, commercial product shot, clean white background, professional lighting, product showcase, e-commerce photography',
        category: 'Professional'
      },
      settings: {
        guidanceScale: 7.5,
        numInferenceSteps: 25,
        imageSize: 'square',
        controlNetType: 'canny'
      },
      prompt: 'product on white background, professional lighting, clean composition, commercial photography',
      popularity: 88,
      timeEstimate: '1-2 min'
    },
    {
      id: 'cyberpunk-cityscape',
      name: 'Cyberpunk Cityscape',
      description: 'Futuristic neon-lit city',
      category: 'Artistic',
      emoji: '🌃',
      style: {
        id: 'cyberpunk',
        name: 'Cyberpunk',
        emoji: '🌃',
        prompt: 'cyberpunk cityscape, neon lights, futuristic architecture, dark atmosphere, rain-soaked streets, glowing signs, high-tech low-life aesthetic, vibrant colors, detailed digital art',
        category: 'Artistic'
      },
      settings: {
        guidanceScale: 7.0,
        numInferenceSteps: 28,
        imageSize: 'landscape_16_9',
        controlNetType: 'depth'
      },
      prompt: 'cyberpunk city at night, neon lights, rain, futuristic buildings, atmospheric lighting',
      popularity: 92,
      timeEstimate: '3-4 min'
    },
    {
      id: 'anime-character',
      name: 'Anime Character',
      description: 'Japanese animation style character',
      category: 'Artistic',
      emoji: '🌸',
      style: {
        id: 'anime',
        name: 'Anime',
        emoji: '🌸',
        prompt: 'anime style, manga art, vibrant colors, clean line art, expressive characters, detailed backgrounds, Japanese animation aesthetic, high quality digital art',
        category: 'Artistic'
      },
      settings: {
        guidanceScale: 6.5,
        numInferenceSteps: 25,
        imageSize: 'portrait_4_3',
        controlNetType: 'openpose'
      },
      prompt: 'anime character, detailed face, expressive eyes, colorful hair, dynamic pose',
      popularity: 90,
      timeEstimate: '2-3 min'
    },
    {
      id: 'fantasy-landscape',
      name: 'Fantasy Landscape',
      description: 'Magical fantasy world',
      category: 'Creative',
      emoji: '🏰',
      style: {
        id: 'dark-fantasy',
        name: 'Dark Fantasy',
        emoji: '🖤',
        prompt: 'dark fantasy art, gothic architecture, mysterious forest, magical creatures, ethereal lighting, dramatic shadows, mystical atmosphere, fantasy world, detailed digital painting',
        category: 'Artistic'
      },
      settings: {
        guidanceScale: 7.5,
        numInferenceSteps: 30,
        imageSize: 'landscape_16_9',
        controlNetType: 'depth'
      },
      prompt: 'fantasy landscape, magical forest, ancient castle, mystical atmosphere, dramatic lighting',
      popularity: 85,
      timeEstimate: '3-4 min'
    },
    {
      id: 'abstract-art',
      name: 'Abstract Art',
      description: 'Modern abstract composition',
      category: 'Creative',
      emoji: '🌀',
      style: {
        id: 'abstract',
        name: 'Abstract',
        emoji: '🌀',
        prompt: 'abstract art, non-representational, geometric shapes, bold colors, artistic composition, modern abstract painting, creative expression',
        category: 'Creative'
      },
      settings: {
        guidanceScale: 6.0,
        numInferenceSteps: 20,
        imageSize: 'square',
        controlNetType: 'scribble'
      },
      prompt: 'abstract geometric composition, bold colors, modern art, creative expression',
      popularity: 78,
      timeEstimate: '1-2 min'
    },
    {
      id: 'nature-landscape',
      name: 'Nature Landscape',
      description: 'Breathtaking natural scenery',
      category: 'Nature',
      emoji: '🏔️',
      style: {
        id: 'landscape',
        name: 'Landscape',
        emoji: '🏔️',
        prompt: 'landscape photography, golden hour lighting, wide angle view, natural colors, high resolution, sharp details, dramatic sky, professional nature photography',
        category: 'Photorealistic'
      },
      settings: {
        guidanceScale: 7.0,
        numInferenceSteps: 25,
        imageSize: 'landscape_16_9',
        controlNetType: 'depth'
      },
      prompt: 'mountain landscape, golden hour, dramatic clouds, natural lighting, peaceful atmosphere',
      popularity: 89,
      timeEstimate: '2-3 min'
    },
    {
      id: 'food-photography',
      name: 'Food Photography',
      description: 'Delicious culinary shots',
      category: 'Professional',
      emoji: '🍽️',
      style: {
        id: 'food',
        name: 'Food Photography',
        emoji: '🍽️',
        prompt: 'food photography, professional food styling, appetizing presentation, natural lighting, shallow depth of field, commercial food photography, high quality',
        category: 'Professional'
      },
      settings: {
        guidanceScale: 7.5,
        numInferenceSteps: 28,
        imageSize: 'square',
        controlNetType: 'canny'
      },
      prompt: 'delicious food presentation, professional lighting, appetizing colors, commercial food photography',
      popularity: 82,
      timeEstimate: '2-3 min'
    },
    {
      id: 'architectural-photography',
      name: 'Architectural Photography',
      description: 'Modern building designs',
      category: 'Professional',
      emoji: '🏢',
      style: {
        id: 'architecture',
        name: 'Architecture',
        emoji: '🏢',
        prompt: 'architectural photography, modern building, clean lines, geometric composition, professional architectural shot, dramatic lighting, urban design',
        category: 'Professional'
      },
      settings: {
        guidanceScale: 8.0,
        numInferenceSteps: 30,
        imageSize: 'landscape_16_9',
        controlNetType: 'canny'
      },
      prompt: 'modern architecture, clean geometric lines, dramatic lighting, urban environment',
      popularity: 76,
      timeEstimate: '3-4 min'
    },
    {
      id: 'fashion-portrait',
      name: 'Fashion Portrait',
      description: 'Stylish fashion photography',
      category: 'Professional',
      emoji: '👗',
      style: {
        id: 'fashion',
        name: 'Fashion',
        emoji: '👗',
        prompt: 'fashion photography, stylish portrait, professional fashion shoot, elegant styling, dramatic lighting, high-end fashion, commercial photography',
        category: 'Professional'
      },
      settings: {
        guidanceScale: 7.5,
        numInferenceSteps: 28,
        imageSize: 'portrait_4_3',
        controlNetType: 'pose'
      },
      prompt: 'fashion model, elegant styling, professional lighting, high-end fashion photography',
      popularity: 87,
      timeEstimate: '2-3 min'
    },
    {
      id: 'sci-fi-scene',
      name: 'Sci-Fi Scene',
      description: 'Futuristic science fiction',
      category: 'Artistic',
      emoji: '🚀',
      style: {
        id: 'sci-fi',
        name: 'Sci-Fi',
        emoji: '🚀',
        prompt: 'science fiction art, futuristic technology, space exploration, advanced machinery, glowing effects, high-tech aesthetic, detailed sci-fi illustration',
        category: 'Artistic'
      },
      settings: {
        guidanceScale: 7.0,
        numInferenceSteps: 30,
        imageSize: 'landscape_16_9',
        controlNetType: 'depth'
      },
      prompt: 'futuristic space station, advanced technology, glowing lights, sci-fi atmosphere',
      popularity: 84,
      timeEstimate: '3-4 min'
    },
    {
      id: 'watercolor-painting',
      name: 'Watercolor Painting',
      description: 'Soft watercolor artwork',
      category: 'Artistic',
      emoji: '🎨',
      style: {
        id: 'watercolor',
        name: 'Watercolor',
        emoji: '🎨',
        prompt: 'watercolor painting, soft brushstrokes, flowing colors, artistic watercolor technique, delicate details, traditional painting style',
        category: 'Artistic'
      },
      settings: {
        guidanceScale: 6.5,
        numInferenceSteps: 25,
        imageSize: 'square',
        controlNetType: 'scribble'
      },
      prompt: 'watercolor painting, soft colors, flowing brushstrokes, artistic composition',
      popularity: 79,
      timeEstimate: '2-3 min'
    },
    {
      id: 'vintage-photography',
      name: 'Vintage Photography',
      description: 'Retro nostalgic style',
      category: 'Creative',
      emoji: '📷',
      style: {
        id: 'vintage',
        name: 'Vintage',
        emoji: '📷',
        prompt: 'vintage photography, retro style, nostalgic atmosphere, film grain, aged look, classic photography aesthetic, sepia tones',
        category: 'Creative'
      },
      settings: {
        guidanceScale: 6.0,
        numInferenceSteps: 22,
        imageSize: 'square',
        controlNetType: 'canny'
      },
      prompt: 'vintage style, nostalgic atmosphere, retro aesthetic, classic photography',
      popularity: 73,
      timeEstimate: '1-2 min'
    },
    {
      id: 'wildlife-photography',
      name: 'Wildlife Photography',
      description: 'Animal portraits in nature',
      category: 'Nature',
      emoji: '🦁',
      style: {
        id: 'wildlife',
        name: 'Wildlife',
        emoji: '🦁',
        prompt: 'wildlife photography, animal portrait, natural habitat, professional nature photography, detailed animal features, natural lighting, wildlife documentary style',
        category: 'Photorealistic'
      },
      settings: {
        guidanceScale: 8.0,
        numInferenceSteps: 30,
        imageSize: 'portrait_4_3',
        controlNetType: 'pose'
      },
      prompt: 'wildlife animal portrait, natural habitat, detailed features, professional wildlife photography',
      popularity: 91,
      timeEstimate: '3-4 min'
    },
    {
      id: 'steampunk-art',
      name: 'Steampunk Art',
      description: 'Victorian-era technology',
      category: 'Artistic',
      emoji: '⚙️',
      style: {
        id: 'steampunk',
        name: 'Steampunk',
        emoji: '⚙️',
        prompt: 'steampunk art, Victorian era technology, brass and copper machinery, gears and cogs, industrial aesthetic, retro-futuristic design, detailed mechanical elements',
        category: 'Artistic'
      },
      settings: {
        guidanceScale: 7.5,
        numInferenceSteps: 28,
        imageSize: 'square',
        controlNetType: 'canny'
      },
      prompt: 'steampunk machinery, brass gears, Victorian technology, industrial aesthetic',
      popularity: 77,
      timeEstimate: '3-4 min'
    },
    {
      id: 'minimalist-design',
      name: 'Minimalist Design',
      description: 'Clean simple compositions',
      category: 'Creative',
      emoji: '⚪',
      style: {
        id: 'minimalist',
        name: 'Minimalist',
        emoji: '⚪',
        prompt: 'minimalist design, clean composition, simple elements, negative space, modern minimalist art, geometric shapes, monochromatic palette',
        category: 'Creative'
      },
      settings: {
        guidanceScale: 5.5,
        numInferenceSteps: 18,
        imageSize: 'square',
        controlNetType: 'scribble'
      },
      prompt: 'minimalist composition, clean lines, simple elements, modern design',
      popularity: 71,
      timeEstimate: '1-2 min'
    },
    {
      id: 'macro-photography',
      name: 'Macro Photography',
      description: 'Close-up detailed shots',
      category: 'Nature',
      emoji: '🔍',
      style: {
        id: 'macro',
        name: 'Macro',
        emoji: '🔍',
        prompt: 'macro photography, extreme close-up, detailed textures, shallow depth of field, professional macro lens, sharp focus, natural lighting',
        category: 'Photorealistic'
      },
      settings: {
        guidanceScale: 8.5,
        numInferenceSteps: 32,
        imageSize: 'square',
        controlNetType: 'canny'
      },
      prompt: 'macro photography, extreme close-up, detailed textures, sharp focus',
      popularity: 86,
      timeEstimate: '3-4 min'
    },
    {
      id: 'oil-painting',
      name: 'Oil Painting',
      description: 'Classical oil painting style',
      category: 'Artistic',
      emoji: '🖼️',
      style: {
        id: 'oil-painting',
        name: 'Oil Painting',
        emoji: '🖼️',
        prompt: 'oil painting, classical art style, rich colors, brushstroke texture, traditional painting technique, artistic masterpiece, detailed oil painting',
        category: 'Artistic'
      },
      settings: {
        guidanceScale: 7.0,
        numInferenceSteps: 30,
        imageSize: 'portrait_4_3',
        controlNetType: 'scribble'
      },
      prompt: 'oil painting style, rich colors, classical art technique, artistic composition',
      popularity: 83,
      timeEstimate: '3-4 min'
    },
    {
      id: 'street-photography',
      name: 'Street Photography',
      description: 'Urban candid moments',
      category: 'Creative',
      emoji: '🏙️',
      style: {
        id: 'street',
        name: 'Street',
        emoji: '🏙️',
        prompt: 'street photography, urban life, candid moments, documentary style, natural lighting, authentic street scenes, photojournalistic approach',
        category: 'Photorealistic'
      },
      settings: {
        guidanceScale: 6.5,
        numInferenceSteps: 25,
        imageSize: 'landscape_16_9',
        controlNetType: 'canny'
      },
      prompt: 'street photography, urban environment, candid moments, documentary style',
      popularity: 75,
      timeEstimate: '2-3 min'
    },
    {
      id: 'fantasy-creature',
      name: 'Fantasy Creature',
      description: 'Mythical fantasy beings',
      category: 'Creative',
      emoji: '🐉',
      style: {
        id: 'fantasy-creature',
        name: 'Fantasy Creature',
        emoji: '🐉',
        prompt: 'fantasy creature, mythical being, detailed fantasy art, magical creature design, fantasy illustration, imaginative character, fantasy world',
        category: 'Artistic'
      },
      settings: {
        guidanceScale: 7.5,
        numInferenceSteps: 28,
        imageSize: 'portrait_4_3',
        controlNetType: 'pose'
      },
      prompt: 'fantasy creature, mythical being, detailed design, magical atmosphere',
      popularity: 88,
      timeEstimate: '3-4 min'
    }
  ];

  const categories = ['All', 'Professional', 'Artistic', 'Creative', 'Nature'];

  const handleUseTemplate = (template) => {
    selectStyle(template.style);
    setControlNetType(template.settings.controlNetType);
    setSelectedTemplate(template);
  };

  const handleCopyPrompt = (prompt) => {
    navigator.clipboard.writeText(prompt);
    // You could add a toast notification here
  };

  const filteredTemplates = selectedCategory === 'All' 
    ? templates 
    : templates.filter(template => template.category === selectedCategory);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="flex items-center justify-center gap-3 mb-4">
          <Sparkles className="w-8 h-8 text-purple-400" />
          <h1 className="text-3xl font-bold gradient-text">Templates & Presets</h1>
        </div>
        <p className="text-gray-300 max-w-2xl mx-auto">
          Use pre-configured templates for quick generation. Each template includes optimized settings and prompts.
        </p>
      </div>

      {/* Category Filter */}
      <div className="flex flex-wrap gap-2 justify-center">
        {categories.map((category) => (
          <button
            key={category}
            onClick={() => setSelectedCategory(category)}
            className={`
              px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200
              ${selectedCategory === category
                ? 'bg-purple-500 text-white'
                : 'bg-white/10 text-gray-300 hover:bg-white/20'
              }
            `}
          >
            {category}
          </button>
        ))}
      </div>

      {/* Templates Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredTemplates.map((template) => (
          <div
            key={template.id}
            className="glass-effect rounded-xl p-6 hover:shadow-lg hover:shadow-purple-500/10 transition-all duration-300"
          >
            <div className="flex items-start gap-4 mb-4">
              <div className="text-3xl">{template.emoji}</div>
              <div className="flex-1">
                <h3 className="font-semibold text-lg mb-1">{template.name}</h3>
                <p className="text-gray-400 text-sm mb-2">{template.description}</p>
                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <div className="flex items-center gap-1">
                    <Star className="w-3 h-3" />
                    {template.popularity}% popular
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {template.timeEstimate}
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <h4 className="text-sm font-medium text-gray-300 mb-2">Prompt Preview:</h4>
                <p className="text-sm text-gray-400 bg-white/5 p-3 rounded-lg">
                  {template.prompt}
                </p>
              </div>

              <div>
                <h4 className="text-sm font-medium text-gray-300 mb-2">Style:</h4>
                <div className="flex items-center gap-2">
                  <span className="text-lg">{template.style.emoji}</span>
                  <span className="text-sm text-gray-400">{template.style.name}</span>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => handleUseTemplate(template)}
                  className="btn-primary flex-1 flex items-center justify-center gap-2"
                >
                  <Zap className="w-4 h-4" />
                  Use Template
                </button>
                <button
                  onClick={() => handleCopyPrompt(template.prompt)}
                  className="btn-secondary flex items-center gap-2"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Selected Template Info */}
      {selectedTemplate && (
        <div className="glass-effect rounded-xl p-6 bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/20">
          <div className="flex items-center gap-3 mb-4">
            <div className="text-2xl">{selectedTemplate.emoji}</div>
            <div>
              <h4 className="font-semibold text-purple-300">{selectedTemplate.name}</h4>
              <p className="text-sm text-gray-400">Template selected and ready to use</p>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-gray-400">Style:</span>
              <div className="font-medium">{selectedTemplate.style.name}</div>
            </div>
            <div>
              <span className="text-gray-400">ControlNet:</span>
              <div className="font-medium">{selectedTemplate.settings.controlNetType}</div>
            </div>
            <div>
              <span className="text-gray-400">Image Size:</span>
              <div className="font-medium">{selectedTemplate.settings.imageSize}</div>
            </div>
            <div>
              <span className="text-gray-400">Guidance:</span>
              <div className="font-medium">{selectedTemplate.settings.guidanceScale}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Templates;
