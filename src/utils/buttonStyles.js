// Shared button and UI element styles
// Eliminates repetitive inline styling across components

export const BTN = {
  base: {
    background: 'linear-gradient(to bottom, #f0f0f0, #e0e0e0, #d8d8d8)',
    border: '2px outset #f0f0f0',
    boxShadow: 'inset 2px 2px 0 rgba(255,255,255,1), inset -2px -2px 0 rgba(0,0,0,0.4), 0 2px 4px rgba(0,0,0,0.2)',
    color: '#000',
    textShadow: '1px 1px 0 rgba(255,255,255,0.8)'
  },
  hover: {
    background: 'linear-gradient(to bottom, #f8f8f8, #e8e8e8, #e0e0e0)',
    border: '2px outset #f8f8f8',
    boxShadow: 'inset 2px 2px 0 rgba(255,255,255,1), inset -2px -2px 0 rgba(0,0,0,0.3), 0 3px 6px rgba(0,0,0,0.25)'
  },
  active: {
    background: 'linear-gradient(to bottom, #d0d0d0, #c0c0c0, #b0b0b0)',
    border: '2px inset #c0c0c0',
    boxShadow: 'inset 3px 3px 0 rgba(0,0,0,0.25), inset -1px -1px 0 rgba(255,255,255,0.5)',
    color: '#000',
    textShadow: '1px 1px 0 rgba(255,255,255,0.6)'
  },
  disabled: {
    background: 'linear-gradient(to bottom, #c8c8c8, #b0b0b0)',
    border: '2px inset #b8b8b8',
    boxShadow: 'inset 3px 3px 0 rgba(0,0,0,0.25)',
    color: '#666',
    textShadow: '1px 1px 0 rgba(255,255,255,0.5)',
    cursor: 'not-allowed'
  },
  small: {
    background: 'linear-gradient(to bottom, #f0f0f0, #e0e0e0)',
    border: '2px outset #f0f0f0',
    boxShadow: 'inset 1px 1px 0 rgba(255,255,255,0.9), inset -1px -1px 0 rgba(0,0,0,0.3)'
  }
};

export const PANEL = {
  base: {
    background: 'linear-gradient(to bottom, #f5f5f5, #eeeeee)',
    border: '1px solid #d0d0d0'
  },
  card: {
    background: 'linear-gradient(to bottom, #f0f0f0, #e0e0e0)',
    border: '2px outset #e8e8e8',
    boxShadow: 'inset 2px 2px 0 rgba(255,255,255,1), inset -2px -2px 0 rgba(0,0,0,0.4), 0 4px 8px rgba(0,0,0,0.3)'
  }
};

export const TEXT = {
  primary: { color: '#000', textShadow: '1px 1px 0 rgba(255,255,255,0.8)' },
  secondary: { color: '#1a1a1a', textShadow: '1px 1px 0 rgba(255,255,255,0.6)' },
  muted: { color: '#666' }
};

// Apply hover effect to button element
export const applyHover = (e) => {
  Object.assign(e.currentTarget.style, BTN.hover);
};

// Remove hover effect from button element  
export const removeHover = (e) => {
  Object.assign(e.currentTarget.style, BTN.base);
};

// Apply active/pressed effect
export const applyActive = (e) => {
  Object.assign(e.currentTarget.style, BTN.active);
};

// Handlers object for easy spreading
export const hoverHandlers = {
  onMouseEnter: applyHover,
  onMouseLeave: removeHover
};

export const pressHandlers = {
  onMouseEnter: applyHover,
  onMouseLeave: removeHover,
  onMouseDown: applyActive,
  onMouseUp: removeHover
};

