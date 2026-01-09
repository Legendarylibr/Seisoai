/**
 * Variation prompt templates for randomized batch generation
 * These templates keep character position and identity while varying specific elements
 */

// Clothing variation templates
export const CLOTHING_VARIATIONS = [
  'wearing a sleek black leather jacket',
  'in an elegant white ball gown',
  'sporting a casual hoodie and jeans',
  'dressed in a formal business suit',
  'in a colorful summer dress with floral patterns',
  'wearing futuristic cyberpunk armor',
  'in traditional japanese kimono',
  'sporting athletic sportswear',
  'wearing a cozy oversized sweater',
  'in a vintage 80s style outfit',
  'dressed as a medieval knight in armor',
  'wearing a lab coat like a scientist',
  'in steampunk Victorian attire',
  'sporting streetwear with sneakers',
  'wearing a glamorous evening dress',
  'in a military uniform',
  'dressed as a pirate with a captain\'s coat',
  'wearing neon rave outfit',
  'in a classic trench coat',
  'sporting punk rock style with chains'
];

// Background variation templates
export const BACKGROUND_VARIATIONS = [
  'in a neon-lit cyberpunk city at night',
  'on a serene beach at sunset',
  'in an enchanted magical forest',
  'floating in outer space with stars',
  'in a cozy coffee shop interior',
  'on top of a snowy mountain peak',
  'in a futuristic laboratory',
  'in an ancient temple ruins',
  'underwater with colorful coral reefs',
  'in a busy tokyo street at night',
  'inside a medieval castle throne room',
  'in a flower garden during spring',
  'on a rooftop overlooking a city skyline',
  'in a misty gothic cathedral',
  'inside a colorful arcade',
  'on an alien planet landscape',
  'in a luxury penthouse apartment',
  'in a dense bamboo forest',
  'inside a library with endless books',
  'at a music festival stage'
];

// Object/prop variation templates
export const OBJECT_VARIATIONS = [
  'holding a glowing magical sword',
  'with butterfly wings on their back',
  'surrounded by floating crystals',
  'holding a cup of steaming coffee',
  'with a loyal wolf companion',
  'carrying a mystical staff',
  'with mechanical robot arms',
  'holding a bouquet of roses',
  'with angel wings glowing softly',
  'surrounded by cherry blossom petals',
  'holding an ancient spellbook',
  'with a phoenix perched on shoulder',
  'carrying a guitar',
  'with demon horns and a tail',
  'holding a katana in battle stance',
  'surrounded by floating data streams',
  'with a futuristic drone companion',
  'holding a glowing lantern',
  'with fairy companions around them',
  'carrying a high-tech weapon'
];

// Lighting/mood variation templates
export const LIGHTING_VARIATIONS = [
  'bathed in golden hour sunlight',
  'illuminated by dramatic rim lighting',
  'in moody blue cinematic lighting',
  'lit by colorful neon lights',
  'in ethereal soft bokeh lighting',
  'with dramatic chiaroscuro shadows',
  'glowing with magical aura light',
  'in harsh noir style lighting',
  'with dreamy pastel colored lights',
  'illuminated by firelight glow',
  'in cool moonlight atmosphere',
  'with vibrant rainbow lighting',
  'backlit with silhouette effect',
  'in warm candlelight ambiance',
  'with stormy dramatic sky lighting'
];

// Style/aesthetic variation templates
export const STYLE_VARIATIONS = [
  'in anime art style',
  'rendered as a digital painting',
  'in photorealistic style',
  'as a watercolor illustration',
  'in comic book art style',
  'rendered in 3D CGI style',
  'as a vintage oil painting',
  'in pixel art style',
  'as a cyberpunk illustration',
  'in art nouveau style',
  'rendered as a fashion photograph',
  'in ukiyo-e japanese art style',
  'as a movie poster',
  'in impressionist painting style',
  'rendered with cel-shaded look'
];

// Pose/action variation templates
export const POSE_VARIATIONS = [
  'in a powerful action pose',
  'sitting relaxed and casual',
  'in an elegant standing pose',
  'mid-motion running forward',
  'in a mystical meditation pose',
  'dancing gracefully',
  'in a fighting stance ready for battle',
  'leaning against a wall coolly',
  'sitting on a throne regally',
  'jumping through the air',
  'crouching in stealth position',
  'with arms crossed confidently',
  'reaching toward the viewer',
  'looking over their shoulder mysteriously',
  'in a peaceful sleeping pose'
];

export interface VariationCategory {
  id: string;
  name: string;
  icon: string;
  templates: string[];
  description: string;
}

export const VARIATION_CATEGORIES: VariationCategory[] = [
  {
    id: 'clothing',
    name: 'Clothes',
    icon: '👔',
    templates: CLOTHING_VARIATIONS,
    description: 'Change outfits and attire'
  },
  {
    id: 'background',
    name: 'Background',
    icon: '🏞️',
    templates: BACKGROUND_VARIATIONS,
    description: 'Change scene and location'
  },
  {
    id: 'objects',
    name: 'Objects',
    icon: '✨',
    templates: OBJECT_VARIATIONS,
    description: 'Add props and accessories'
  },
  {
    id: 'lighting',
    name: 'Lighting',
    icon: '💡',
    templates: LIGHTING_VARIATIONS,
    description: 'Change mood and atmosphere'
  },
  {
    id: 'style',
    name: 'Style',
    icon: '🎨',
    templates: STYLE_VARIATIONS,
    description: 'Change art style'
  },
  {
    id: 'pose',
    name: 'Pose',
    icon: '🏃',
    templates: POSE_VARIATIONS,
    description: 'Change character pose'
  }
];

/**
 * Get a random item from an array
 */
function getRandomItem<T>(array: T[]): T {
  return array[Math.floor(Math.random() * array.length)];
}

/**
 * Shuffle an array using Fisher-Yates algorithm
 */
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Generate a randomized variation prompt based on selected categories
 * @param basePrompt - The base prompt describing the character
 * @param enabledCategories - Array of category IDs to include
 * @param usedVariations - Map of variations already used (to avoid duplicates)
 * @returns The combined variation prompt
 */
export function generateVariationPrompt(
  basePrompt: string,
  enabledCategories: string[],
  usedVariations?: Map<string, Set<string>>
): { prompt: string; variations: Record<string, string> } {
  const variations: Record<string, string> = {};
  const parts: string[] = [basePrompt];
  
  // For each enabled category, pick a random template
  for (const categoryId of enabledCategories) {
    const category = VARIATION_CATEGORIES.find(c => c.id === categoryId);
    if (!category) continue;
    
    let availableTemplates = category.templates;
    
    // If tracking used variations, filter them out
    if (usedVariations && usedVariations.has(categoryId)) {
      const used = usedVariations.get(categoryId)!;
      availableTemplates = category.templates.filter(t => !used.has(t));
      
      // If all used, reset and use all templates
      if (availableTemplates.length === 0) {
        availableTemplates = category.templates;
      }
    }
    
    const variation = getRandomItem(availableTemplates);
    variations[categoryId] = variation;
    parts.push(variation);
  }
  
  // Build the final prompt
  // Structure: "[base prompt], [variation 1], [variation 2], ..."
  const prompt = parts.join(', ');
  
  return { prompt, variations };
}

/**
 * Generate multiple unique variation prompts for batch processing
 * @param basePrompt - The base prompt describing the character
 * @param enabledCategories - Array of category IDs to include
 * @param count - Number of unique variations to generate
 * @returns Array of variation prompts
 */
export function generateBatchVariations(
  basePrompt: string,
  enabledCategories: string[],
  count: number
): Array<{ prompt: string; variations: Record<string, string> }> {
  const results: Array<{ prompt: string; variations: Record<string, string> }> = [];
  const usedVariations = new Map<string, Set<string>>();
  
  // Initialize used variation tracking
  for (const categoryId of enabledCategories) {
    usedVariations.set(categoryId, new Set());
  }
  
  for (let i = 0; i < count; i++) {
    const result = generateVariationPrompt(basePrompt, enabledCategories, usedVariations);
    results.push(result);
    
    // Track used variations
    for (const [categoryId, variation] of Object.entries(result.variations)) {
      usedVariations.get(categoryId)?.add(variation);
    }
  }
  
  return results;
}

/**
 * Get a preview of what variations might look like
 * @param basePrompt - The base prompt
 * @param enabledCategories - Array of category IDs
 * @returns Sample prompt preview
 */
export function getVariationPreview(
  basePrompt: string,
  enabledCategories: string[]
): string {
  if (enabledCategories.length === 0) {
    return basePrompt;
  }
  
  const categoryNames = enabledCategories
    .map(id => VARIATION_CATEGORIES.find(c => c.id === id)?.name)
    .filter(Boolean)
    .join(' + ');
  
  return `"${basePrompt}" + random ${categoryNames}`;
}

