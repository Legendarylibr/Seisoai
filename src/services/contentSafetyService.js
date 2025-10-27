// Content Safety Service for CSAM protection only
// Very lax moderation - only blocking CSAM and extreme content

// Blocked keywords and phrases - ONLY CSAM and extreme content
const BLOCKED_KEYWORDS = [
  // CSAM - ZERO TOLERANCE
  'child nsfw', 'children nsfw', 'kid nsfw', 'kids nsfw',
  'teenager nsfw', 'minor nsfw', 'underage nsfw',
  'lolita', 'shota', 'loli',
  
  // Extreme sexual content involving minors
  'csam', 'cp', 'illegal',
  
  // Bestiality/extreme content
  'bestiality', 'zoophilia', 'beastiality'
];

// Blocked image styles - ONLY CSAM-related
const BLOCKED_STYLES = [
  'lolita', 'shota', 'underage nsfw'
];

// Blocked image descriptions - ONLY CSAM-related
const BLOCKED_DESCRIPTIONS = [
  // Minimal blocking - only explicit CSAM phrases
];

// Suspicious patterns - ONLY very explicit CSAM patterns
const SUSPICIOUS_PATTERNS = [
  /\b(child|kid|teen|minor|underage)\s+(nude|naked|sex|nsfw|porn|explicit)\b/i,
  /\b(age)\s*[0-9]{1,2}\s*(year|yr|old)\s+(nude|naked|sex|nsfw|porn|explicit)\b/i,
  /\b(csam|child pornography)\b/i
];

/**
 * Check if a prompt contains blocked keywords
 * @param {string} prompt - The text prompt to check
 * @returns {Object} - { isBlocked: boolean, reason: string, blockedWords: string[] }
 */
export const checkPromptSafety = (prompt) => {
  if (!prompt || typeof prompt !== 'string') {
    return { isBlocked: false, reason: '', blockedWords: [] };
  }

  const lowerPrompt = prompt.toLowerCase();
  const blockedWords = [];
  
  // Check for blocked keywords
  for (const keyword of BLOCKED_KEYWORDS) {
    if (lowerPrompt.includes(keyword.toLowerCase())) {
      blockedWords.push(keyword);
    }
  }
  
  // Check for CSAM-related suspicious patterns - ONLY explicit CSAM
  
  for (const pattern of SUSPICIOUS_PATTERNS) {
    if (pattern.test(lowerPrompt)) {
      blockedWords.push('explicit_csam_pattern');
    }
  }
  
  if (blockedWords.length > 0) {
    return {
      isBlocked: true,
      reason: 'Content contains CSAM-related keywords',
      blockedWords: blockedWords
    };
  }
  
  return { isBlocked: false, reason: '', blockedWords: [] };
};

/**
 * Check if a style is appropriate - Very minimal filtering
 * @param {Object} style - The style object to check
 * @returns {Object} - { isBlocked: boolean, reason: string }
 */
export const checkStyleSafety = (style) => {
  if (!style || !style.name) {
    return { isBlocked: false, reason: '' };
  }
  
  const lowerStyleName = style.name.toLowerCase();
  const lowerDescription = (style.description || '').toLowerCase();
  
  // Only check for explicitly CSAM-related styles
  for (const blockedStyle of BLOCKED_STYLES) {
    if (lowerStyleName.includes(blockedStyle) || lowerDescription.includes(blockedStyle)) {
      return {
        isBlocked: true,
        reason: 'Style contains CSAM-related content'
      };
    }
  }
  
  return { isBlocked: false, reason: '' };
};

/**
 * Check if a reference image description is appropriate - Very minimal filtering
 * @param {string} description - The image description to check
 * @returns {Object} - { isBlocked: boolean, reason: string, blockedWords: string[] }
 */
export const checkImageDescriptionSafety = (description) => {
  if (!description || typeof description !== 'string') {
    return { isBlocked: false, reason: '', blockedWords: [] };
  }
  
  const lowerDescription = description.toLowerCase();
  const blockedWords = [];
  
  // Minimal checks for CSAM only
  const csamKeywords = ['csam', 'child porn', 'underage nsfw'];
  
  for (const keyword of csamKeywords) {
    if (lowerDescription.includes(keyword)) {
      blockedWords.push(keyword);
    }
  }
  
  if (blockedWords.length > 0) {
    return {
      isBlocked: true,
      reason: 'Image description contains CSAM-related content',
      blockedWords: blockedWords
    };
  }
  
  return { isBlocked: false, reason: '', blockedWords: [] };
};

/**
 * Comprehensive content safety check
 * @param {Object} params - { prompt, style, imageDescription }
 * @returns {Object} - { isSafe: boolean, reason: string, details: Object }
 */
export const performContentSafetyCheck = ({ prompt = '', style = null, imageDescription = '' }) => {
  const results = {
    prompt: checkPromptSafety(prompt),
    style: checkStyleSafety(style),
    imageDescription: checkImageDescriptionSafety(imageDescription)
  };
  
  const isSafe = !results.prompt.isBlocked && !results.style.isBlocked && !results.imageDescription.isBlocked;
  
  let reason = '';
  if (!isSafe) {
    const reasons = [];
    if (results.prompt.isBlocked) reasons.push(`Prompt: ${results.prompt.reason}`);
    if (results.style.isBlocked) reasons.push(`Style: ${results.style.reason}`);
    if (results.imageDescription.isBlocked) reasons.push(`Image: ${results.imageDescription.reason}`);
    reason = reasons.join('; ');
  }
  
  return {
    isSafe,
    reason,
    details: results
  };
};

/**
 * Log safety violations for monitoring
 * @param {Object} violation - The safety violation details
 * @param {string} walletAddress - The user's wallet address
 */
export const logSafetyViolation = async (violation, walletAddress) => {
  const logEntry = {
    timestamp: new Date().toISOString(),
    walletAddress: walletAddress?.toLowerCase(),
    violation: violation,
    userAgent: navigator.userAgent,
    url: window.location.href
  };
  
  // Log to console in development
  if (process.env.NODE_ENV === 'development') {
    console.warn('🚨 Content Safety Violation:', logEntry);
  }
  
  // Send to backend for logging and monitoring
  try {
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
    if (apiUrl) {
      await fetch(`${apiUrl}/api/safety/violation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(logEntry)
      });
    }
  } catch (error) {
    console.error('Failed to log safety violation to backend:', error);
  }
};

/**
 * Get safe alternative suggestions
 * @param {string} originalPrompt - The original blocked prompt
 * @returns {string[]} - Array of safe alternative suggestions
 */
export const getSafeAlternatives = (originalPrompt) => {
  const alternatives = [
    'artistic portrait',
    'beautiful landscape',
    'abstract art',
    'fantasy character',
    'sci-fi scene',
    'nature photography',
    'architectural design',
    'vintage illustration',
    'modern art',
    'creative composition'
  ];
  
  return alternatives.slice(0, 3); // Return top 3 alternatives
};
