// Enhanced visual styles optimized for FAL.ai models
export const VISUAL_STYLES = [
  // Photorealistic Styles
  {
    id: 'photorealistic',
    name: 'Photorealistic',
    description: 'Ultra-realistic photography',
    emoji: '📸',
    prompt: 'photorealistic, ultra detailed, high resolution, professional photography, sharp focus, realistic lighting, natural colors',
    gradient: 'from-gray-400 to-gray-600',
    category: 'Photorealistic'
  },
  {
    id: 'portrait',
    name: 'Portrait',
    description: 'Professional headshots',
    emoji: '👤',
    prompt: 'professional portrait photography, studio lighting, shallow depth of field, high resolution, sharp focus, natural skin tones',
    gradient: 'from-amber-400 to-orange-500',
    category: 'Photorealistic'
  },
  {
    id: 'landscape',
    name: 'Landscape',
    description: 'Natural scenery',
    emoji: '🏔️',
    prompt: 'landscape photography, golden hour lighting, wide angle view, natural colors, high resolution, sharp details, dramatic sky',
    gradient: 'from-green-400 to-blue-500',
    category: 'Photorealistic'
  },

  // Artistic Styles
  {
    id: 'cyberpunk',
    name: 'Cyberpunk',
    description: 'Neon-lit futuristic cityscapes',
    emoji: '🌃',
    prompt: 'cyberpunk aesthetic, neon lights, futuristic cityscape, atmospheric lighting, electric blue and purple lighting, high contrast, digital art style, vibrant neon glow',
    gradient: 'from-blue-500 to-purple-600',
    category: 'Artistic'
  },
  {
    id: 'ghibli',
    name: 'Studio Ghibli',
    description: 'Whimsical animated landscapes',
    emoji: '🌿',
    prompt: 'studio ghibli art style, hand-drawn animation, soft pastel colors, whimsical atmosphere, detailed nature scenes, magical realism',
    gradient: 'from-green-400 to-blue-500',
    category: 'Artistic'
  },
  {
    id: 'dark-fantasy',
    name: 'Dark Fantasy',
    description: 'Mysterious magical realms',
    emoji: '🖤',
    prompt: 'dark fantasy art, gothic atmosphere, mysterious lighting, magical elements, dramatic shadows, deep purples and blues, fantasy illustration, mystical glow',
    gradient: 'from-purple-600 to-indigo-700',
    category: 'Artistic'
  },
  {
    id: 'vaporwave',
    name: 'Vaporwave',
    description: 'Retro-futuristic aesthetics',
    emoji: '🌴',
    prompt: 'vaporwave aesthetic, retro-futuristic, neon pink and purple, 80s synthwave, palm trees, grid patterns, digital glitch effects',
    gradient: 'from-pink-500 to-purple-500',
    category: 'Artistic'
  },
  {
    id: 'anime',
    name: 'Anime',
    description: 'Japanese animation style',
    emoji: '🌸',
    prompt: 'anime art style, manga illustration, vibrant colors, clean line art, expressive characters, Japanese animation aesthetic',
    gradient: 'from-pink-400 to-orange-400',
    category: 'Artistic'
  },
  {
    id: 'steampunk',
    name: 'Steampunk',
    description: 'Victorian-era technology',
    emoji: '⚙️',
    prompt: 'steampunk aesthetic, Victorian era, brass and copper machinery, steam-powered technology, industrial design, vintage mechanical elements',
    gradient: 'from-yellow-600 to-orange-700',
    category: 'Artistic'
  },
  {
    id: 'minimalist',
    name: 'Minimalist',
    description: 'Clean and simple designs',
    emoji: '⚪',
    prompt: 'minimalist design, clean composition, simple shapes, monochromatic palette, negative space, modern aesthetic, geometric forms',
    gradient: 'from-gray-300 to-gray-600',
    category: 'Artistic'
  },
  {
    id: 'watercolor',
    name: 'Watercolor',
    description: 'Soft painted effects',
    emoji: '🎨',
    prompt: 'watercolor painting, soft brushstrokes, translucent colors, organic textures, artistic medium, hand-painted aesthetic, flowing pigments',
    gradient: 'from-blue-300 to-green-300',
    category: 'Artistic'
  },

  // Professional Styles
  {
    id: 'corporate',
    name: 'Corporate',
    description: 'Business and professional',
    emoji: '💼',
    prompt: 'corporate photography, professional business setting, clean modern office, formal attire, professional lighting, high-end commercial style',
    gradient: 'from-slate-500 to-slate-700',
    category: 'Professional'
  },
  {
    id: 'fashion',
    name: 'Fashion',
    description: 'High-end fashion photography',
    emoji: '👗',
    prompt: 'high-end fashion photography, editorial style, professional model, studio lighting, luxury fashion, artistic composition, commercial fashion',
    gradient: 'from-rose-400 to-pink-500',
    category: 'Professional'
  },
  {
    id: 'product',
    name: 'Product',
    description: 'Commercial product shots',
    emoji: '📦',
    prompt: 'product photography, commercial product shot, clean white background, professional lighting, high resolution, commercial advertising style',
    gradient: 'from-indigo-400 to-purple-500',
    category: 'Professional'
  },

  // Creative Styles
  {
    id: 'abstract',
    name: 'Abstract',
    description: 'Non-representational art',
    emoji: '🌀',
    prompt: 'abstract art, non-representational, geometric shapes, bold colors, modern art, contemporary abstract painting, artistic composition',
    gradient: 'from-purple-400 to-pink-400',
    category: 'Creative'
  },
  {
    id: 'surreal',
    name: 'Surreal',
    description: 'Dreamlike and fantastical',
    emoji: '🌌',
    prompt: 'surreal art, dreamlike imagery, fantastical elements, impossible scenes, surrealist painting, magical realism, otherworldly atmosphere',
    gradient: 'from-indigo-500 to-purple-600',
    category: 'Creative'
  },
  {
    id: 'vintage',
    name: 'Vintage',
    description: 'Retro and nostalgic',
    emoji: '📷',
    prompt: 'vintage photography, retro aesthetic, nostalgic atmosphere, aged film look, classic photography style, timeless quality, historical feel',
    gradient: 'from-amber-500 to-orange-600',
    category: 'Creative'
  },
  {
    id: 'noir',
    name: 'Film Noir',
    description: 'Black and white dramatic',
    emoji: '🎭',
    prompt: 'film noir style, pure black and white photography, no color, monochrome only, dramatic lighting, high contrast, moody atmosphere, classic Hollywood, cinematic shadows',
    gradient: 'from-gray-500 to-gray-700',
    category: 'Creative'
  },
  {
    id: 'pop-art',
    name: 'Pop Art',
    description: 'Bold and colorful graphic style',
    emoji: '🎨',
    prompt: 'pop art style, bold colors, graphic design, comic book aesthetic, vibrant palette, commercial art, Andy Warhol inspired',
    gradient: 'from-yellow-400 to-red-500',
    category: 'Creative'
  },
  {
    id: 'fantasy',
    name: 'Fantasy',
    description: 'Magical and enchanting',
    emoji: '🧙‍♀️',
    prompt: 'fantasy art, magical atmosphere, enchanting lighting, mystical elements, fantasy illustration, magical realism, otherworldly beauty',
    gradient: 'from-purple-400 to-pink-400',
    category: 'Artistic'
  },
  {
    id: 'sci-fi',
    name: 'Sci-Fi',
    description: 'Futuristic and technological',
    emoji: '🚀',
    prompt: 'sci-fi art, futuristic technology, space age design, advanced machinery, technological aesthetic, space exploration, futuristic atmosphere',
    gradient: 'from-blue-500 to-cyan-400',
    category: 'Artistic'
  },
  {
    id: 'horror',
    name: 'Horror',
    description: 'Dark and terrifying',
    emoji: '👻',
    prompt: 'horror art, atmospheric lighting, supernatural elements, gothic horror, eerie atmosphere, dramatic shadows, horror movie aesthetic, mysterious glow',
    gradient: 'from-red-600 to-gray-800',
    category: 'Artistic'
  },
  {
    id: 'nature',
    name: 'Nature',
    description: 'Natural and organic',
    emoji: '🌿',
    prompt: 'nature photography, natural lighting, organic textures, environmental beauty, wildlife photography, natural colors, outdoor scenery',
    gradient: 'from-green-400 to-emerald-500',
    category: 'Photorealistic'
  },
  {
    id: 'urban',
    name: 'Urban',
    description: 'City and street photography',
    emoji: '🏙️',
    prompt: 'urban photography, city street photography, architectural photography, urban landscape, city life, street art, metropolitan atmosphere',
    gradient: 'from-gray-500 to-blue-600',
    category: 'Photorealistic'
  },
  {
    id: 'macro',
    name: 'Macro',
    description: 'Close-up detailed shots',
    emoji: '🔍',
    prompt: 'macro photography, extreme close-up, detailed textures, shallow depth of field, high magnification, intricate details, macro lens photography',
    gradient: 'from-green-500 to-yellow-400',
    category: 'Photorealistic'
  },
  {
    id: 'black-white',
    name: 'Black & White',
    description: 'Classic monochrome',
    emoji: '⚫',
    prompt: 'black and white photography, pure monochrome, no color, only black and white tones, high contrast, classic photography, timeless aesthetic, dramatic lighting, grayscale only',
    gradient: 'from-gray-300 to-gray-600',
    category: 'Photorealistic'
  },
  {
    id: 'sepia',
    name: 'Sepia',
    description: 'Warm vintage tones',
    emoji: '📜',
    prompt: 'sepia tone photography, vintage aesthetic, warm brown tones, aged photograph, nostalgic atmosphere, classic photography, historical feel',
    gradient: 'from-amber-600 to-orange-700',
    category: 'Creative'
  },
  {
    id: 'hdr',
    name: 'HDR',
    description: 'High dynamic range',
    emoji: '☀️',
    prompt: 'HDR photography, high dynamic range, enhanced contrast, vivid colors, dramatic lighting, tone mapping, enhanced details',
    gradient: 'from-yellow-400 to-orange-500',
    category: 'Photorealistic'
  },
  {
    id: 'bokeh',
    name: 'Bokeh',
    description: 'Shallow depth of field',
    emoji: '✨',
    prompt: 'bokeh photography, shallow depth of field, blurred background, soft focus, artistic blur, portrait photography, selective focus',
    gradient: 'from-pink-300 to-purple-400',
    category: 'Photorealistic'
  },
  {
    id: 'double-exposure',
    name: 'Double Exposure',
    description: 'Layered artistic effect',
    emoji: '👥',
    prompt: 'double exposure photography, layered imagery, artistic composition, multiple exposures, creative photography technique, surreal layering',
    gradient: 'from-blue-400 to-purple-500',
    category: 'Creative'
  },
  {
    id: 'infrared',
    name: 'Infrared',
    description: 'Surreal color-shifted',
    emoji: '🌡️',
    prompt: 'infrared photography, false color infrared, surreal color palette, otherworldly atmosphere, unique color spectrum, infrared film effect',
    gradient: 'from-pink-400 to-red-500',
    category: 'Creative'
  },
  {
    id: 'tilt-shift',
    name: 'Tilt-Shift',
    description: 'Miniature effect',
    emoji: '🏗️',
    prompt: 'tilt-shift photography, miniature effect, selective focus, shallow depth of field, toy-like appearance, creative blur technique',
    gradient: 'from-cyan-400 to-blue-500',
    category: 'Creative'
  },
  {
    id: 'fisheye',
    name: 'Fisheye',
    description: 'Ultra-wide perspective',
    emoji: '🐠',
    prompt: 'fisheye photography, ultra-wide angle, distorted perspective, 180-degree view, curved horizon, extreme wide angle lens',
    gradient: 'from-blue-400 to-green-400',
    category: 'Creative'
  },
  {
    id: 'lomography',
    name: 'Lomography',
    description: 'Vintage film aesthetic',
    emoji: '📸',
    prompt: 'lomography style, vintage film aesthetic, lo-fi photography, analog film look, retro colors, imperfect photography, film grain',
    gradient: 'from-orange-400 to-red-500',
    category: 'Creative'
  },
  {
    id: 'cross-process',
    name: 'Cross-Process',
    description: 'Color-shifted film',
    emoji: '🎞️',
    prompt: 'cross-process photography, color-shifted film, experimental color palette, unique color grading, alternative processing, artistic color shift',
    gradient: 'from-yellow-400 to-green-500',
    category: 'Creative'
  },
  {
    id: 'polaroid',
    name: 'Polaroid',
    description: 'Instant film look',
    emoji: '📷',
    prompt: 'polaroid photography, instant film aesthetic, square format, vintage instant camera, retro instant photo, nostalgic instant film',
    gradient: 'from-yellow-300 to-orange-400',
    category: 'Creative'
  },
  {
    id: 'holga',
    name: 'Holga',
    description: 'Lo-fi plastic camera',
    emoji: '📹',
    prompt: 'holga photography, lo-fi plastic camera, toy camera aesthetic, soft focus, vignetting, analog imperfections, plastic lens effect',
    gradient: 'from-gray-400 to-gray-600',
    category: 'Creative'
  },
  {
    id: 'generative-art',
    name: 'Generative Art',
    description: 'Algorithmic digital patterns',
    emoji: '🔢',
    prompt: 'generative art, algorithmic patterns, mathematical beauty, digital geometry, procedural generation, abstract digital art, code-based art, computational aesthetics',
    gradient: 'from-purple-500 to-pink-500',
    category: 'Creative'
  },
  {
    id: 'glitch-art',
    name: 'Glitch Art',
    description: 'Digital corruption aesthetics',
    emoji: '💾',
    prompt: 'glitch art, digital corruption, pixel sorting, data bending, digital artifacts, broken aesthetics, cyberpunk glitch, corrupted digital art',
    gradient: 'from-red-500 to-purple-600',
    category: 'Creative'
  },
  {
    id: 'pixel-art',
    name: 'Pixel Art',
    description: 'Classic 16-bit graphics',
    emoji: '🎮',
    prompt: 'pixel art, 16-bit graphics, retro gaming aesthetic, blocky pixels, classic video game style, digital pixel art, nostalgic gaming graphics',
    gradient: 'from-green-500 to-blue-600',
    category: 'Creative'
  },
  {
    id: 'low-poly',
    name: 'Low Poly',
    description: 'Geometric 3D style',
    emoji: '🔺',
    prompt: 'low poly art, geometric 3D style, angular shapes, flat shading, minimalist 3D, polygonal design, geometric art, digital sculpture',
    gradient: 'from-orange-400 to-red-500',
    category: 'Creative'
  },
  {
    id: 'fractal-art',
    name: 'Fractal Art',
    description: 'Mathematical beauty patterns',
    emoji: '🌀',
    prompt: 'fractal art, mathematical patterns, infinite detail, recursive geometry, psychedelic fractals, mathematical beauty, complex patterns',
    gradient: 'from-purple-600 to-pink-500',
    category: 'Creative'
  },
  {
    id: 'data-visualization',
    name: 'Data Visualization',
    description: 'Information as art',
    emoji: '📊',
    prompt: 'data visualization art, information graphics, data-driven art, statistical beauty, infographic aesthetics, data patterns, visual analytics',
    gradient: 'from-blue-500 to-green-500',
    category: 'Creative'
  },
  {
    id: 'digital-collage',
    name: 'Digital Collage',
    description: 'Mixed media digital art',
    emoji: '🎭',
    prompt: 'digital collage, mixed media digital art, layered composition, digital montage, artistic collage, creative digital assembly, multimedia art',
    gradient: 'from-yellow-400 to-red-500',
    category: 'Creative'
  },
  {
    id: 'data-stream',
    name: 'Data Stream',
    description: 'Flowing digital information',
    emoji: '📡',
    prompt: 'data stream art, flowing digital information, streaming data visualization, digital flow, information streams, data rivers, flowing code',
    gradient: 'from-blue-600 to-green-500',
    category: 'Creative'
  },
  {
    id: 'neon-sign',
    name: 'Neon Sign',
    description: 'Vibrant neon lighting',
    emoji: '💡',
    prompt: 'neon sign art, glowing neon lights, electric colors, night city atmosphere, retro neon aesthetic, bright glowing text, urban neon art',
    gradient: 'from-cyan-400 to-pink-500',
    category: 'Artistic'
  },
  {
    id: 'holographic',
    name: 'Holographic',
    description: 'Futuristic hologram effect',
    emoji: '✨',
    prompt: 'holographic art, futuristic hologram, iridescent colors, rainbow reflections, 3D holographic effect, sci-fi aesthetic, prismatic light',
    gradient: 'from-blue-400 to-purple-500',
    category: 'Artistic'
  },
  {
    id: 'cyber-grunge',
    name: 'Cyber Grunge',
    description: 'Raw digital punk aesthetic',
    emoji: '⚡',
    prompt: 'cyber grunge, digital punk aesthetic, raw digital art, chaotic composition, aggressive colors, underground digital culture, punk digital art',
    gradient: 'from-red-600 to-black',
    category: 'Artistic'
  },
  {
    id: 'synthwave',
    name: 'Synthwave',
    description: '80s retro-futuristic',
    emoji: '🌆',
    prompt: 'synthwave art, 80s retro-futuristic, neon grid, sunset colors, palm trees, retro wave aesthetic, nostalgic future, 80s cyberpunk',
    gradient: 'from-pink-500 to-purple-600',
    category: 'Artistic'
  },
  {
    id: 'liquid-art',
    name: 'Liquid Art',
    description: 'Fluid organic shapes',
    emoji: '🌊',
    prompt: 'liquid art, fluid organic shapes, flowing forms, liquid metal, mercury-like textures, organic digital art, fluid dynamics, liquid sculpture',
    gradient: 'from-blue-500 to-cyan-400',
    category: 'Artistic'
  },
  {
    id: 'neon-noir',
    name: 'Neon Noir',
    description: 'Dark cyberpunk atmosphere',
    emoji: '🌃',
    prompt: 'neon noir, dark cyberpunk atmosphere, neon lights in darkness, urban night scene, moody lighting, cyberpunk noir, dark futuristic city',
    gradient: 'from-purple-700 to-blue-800',
    category: 'Artistic'
  },
  {
    id: 'crypto-gothic',
    name: 'Crypto Gothic',
    description: 'Dark digital architecture',
    emoji: '🏰',
    prompt: 'crypto gothic, dark digital architecture, gothic cyberpunk, dark futuristic buildings, gothic technology, dark digital cathedral, cyber gothic',
    gradient: 'from-gray-700 to-purple-800',
    category: 'Artistic'
  },
  {
    id: 'hologram-portrait',
    name: 'Hologram Portrait',
    description: 'Futuristic digital portraits',
    emoji: '👤',
    prompt: 'hologram portrait, futuristic digital portrait, holographic face, digital human, cyber portrait, futuristic identity, digital avatar',
    gradient: 'from-cyan-400 to-blue-600',
    category: 'Photorealistic'
  },
  {
    id: 'neon-geometric',
    name: 'Neon Geometric',
    description: 'Bright geometric patterns',
    emoji: '🔷',
    prompt: 'neon geometric art, bright geometric patterns, electric shapes, glowing geometry, neon polygons, digital geometric art, electric forms',
    gradient: 'from-pink-400 to-purple-500',
    category: 'Artistic'
  },
  {
    id: 'cyber-flora',
    name: 'Cyber Flora',
    description: 'Digital plant life',
    emoji: '🌱',
    prompt: 'cyber flora, digital plant life, futuristic vegetation, cyberpunk nature, digital garden, electronic plants, synthetic nature, cyber botany',
    gradient: 'from-green-500 to-cyan-400',
    category: 'Artistic'
  }
];

