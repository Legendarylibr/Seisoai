// Content Safety Service for CSAM and inappropriate content protection
// This service implements multiple layers of content filtering

// Blocked keywords and phrases - ZERO TOLERANCE for CSAM only
const BLOCKED_KEYWORDS = [
  // CSAM and age-related inappropriate content - ZERO TOLERANCE
  'child', 'children', 'kid', 'kids', 'teen', 'teenager', 'minor', 'young',
  'baby', 'infant', 'toddler', 'school', 'schoolgirl', 'schoolboy',
  'underage', 'lolita', 'shota', 'loli', 'shota',
  
  // CSAM-related patterns and descriptors
  'innocent', 'pure', 'virgin', 'naive', 'vulnerable', 'little', 'small',
  'young', 'child', 'teen', 'minor', 'underage', 'school', 'student', 'pupil',
  
  // Other inappropriate content that could facilitate CSAM
  'bestiality', 'animal', 'beast', 'zoophilia'
];

// Blocked image styles - ZERO TOLERANCE for CSAM only
const BLOCKED_STYLES = [
  'lolita', 'shota', 'underage', 'child', 'teen'
];

// Blocked image descriptions - ZERO TOLERANCE for CSAM only
const BLOCKED_DESCRIPTIONS = [
  'young', 'child', 'teen', 'minor', 'underage', 'school',
  'innocent', 'pure', 'virgin', 'naive', 'vulnerable', 'little', 'small'
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
  
  // Check for CSAM-related suspicious patterns - ZERO TOLERANCE
  const suspiciousPatterns = [
    /\b(young|little|small)\s+(girl|boy|child|kid|teen|teenager)\b/i,
    /\b(child|kid|teen|teenager|minor|young)\s+(nude|naked|undressed|exposed)\b/i,
    /\b(school|student|pupil)\s+(nude|naked|undressed|exposed)\b/i,
    /\b(innocent|pure|virgin|naive)\s+(child|kid|teen|teenager|girl|boy)\b/i,
    /\b(age|aged)\s*[0-9]{1,2}\s*(year|yr|old)\b/i,
    /\b(underage|minor|young)\s+(adult|mature|grown)\b/i
  ];
  
  for (const pattern of suspiciousPatterns) {
    if (pattern.test(lowerPrompt)) {
      blockedWords.push('suspicious_pattern');
    }
  }
  
  if (blockedWords.length > 0) {
    return {
      isBlocked: true,
      reason: 'Content contains inappropriate or potentially harmful keywords',
      blockedWords: blockedWords
    };
  }
  
  return { isBlocked: false, reason: '', blockedWords: [] };
};

/**
 * Check if a style is appropriate
 * @param {Object} style - The style object to check
 * @returns {Object} - { isBlocked: boolean, reason: string }
 */
export const checkStyleSafety = (style) => {
  if (!style || !style.name) {
    return { isBlocked: false, reason: '' };
  }
  
  const lowerStyleName = style.name.toLowerCase();
  const lowerDescription = (style.description || '').toLowerCase();
  
  for (const blockedStyle of BLOCKED_STYLES) {
    if (lowerStyleName.includes(blockedStyle) || lowerDescription.includes(blockedStyle)) {
      return {
        isBlocked: true,
        reason: 'Style contains inappropriate content descriptors'
      };
    }
  }
  
  return { isBlocked: false, reason: '' };
};

/**
 * Check if a reference image description is appropriate
 * @param {string} description - The image description to check
 * @returns {Object} - { isBlocked: boolean, reason: string, blockedWords: string[] }
 */
export const checkImageDescriptionSafety = (description) => {
  if (!description || typeof description !== 'string') {
    return { isBlocked: false, reason: '', blockedWords: [] };
  }
  
  const lowerDescription = description.toLowerCase();
  const blockedWords = [];
  
  for (const blockedDesc of BLOCKED_DESCRIPTIONS) {
    if (lowerDescription.includes(blockedDesc)) {
      blockedWords.push(blockedDesc);
    }
  }
  
  if (blockedWords.length > 0) {
    return {
      isBlocked: true,
      reason: 'Image description contains inappropriate content',
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
    const apiUrl = import.meta.env.VITE_API_URL;
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
