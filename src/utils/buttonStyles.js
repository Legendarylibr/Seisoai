// Windows 95 style constants - shared across all components
export const WIN95 = {
  bg: '#c0c0c0',
  bgLight: '#dfdfdf',
  bgDark: '#808080',
  border: {
    light: '#ffffff',
    dark: '#404040',
    darker: '#000000'
  },
  text: '#000000',
  textDisabled: '#808080',
  highlight: '#000080',
  highlightText: '#ffffff',
  inputBg: '#ffffff',
  buttonFace: '#c0c0c0'
};

export const BTN = {
  base: {
    background: WIN95.buttonFace,
    border: 'none',
    boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}, inset 2px 2px 0 ${WIN95.bgLight}, inset -2px -2px 0 ${WIN95.bgDark}`,
    color: WIN95.text,
    fontFamily: 'Tahoma, "MS Sans Serif", sans-serif',
    cursor: 'pointer'
  },
  hover: {
    background: '#d0d0d0',
    border: 'none',
    boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}, inset 2px 2px 0 #e8e8e8, inset -2px -2px 0 ${WIN95.bgDark}`,
    color: WIN95.text
  },
  active: {
    background: WIN95.bgDark,
    border: 'none',
    boxShadow: `inset 1px 1px 0 ${WIN95.border.darker}, inset -1px -1px 0 ${WIN95.border.light}`,
    color: WIN95.text
  },
  disabled: {
    background: WIN95.buttonFace,
    border: 'none',
    boxShadow: `inset 1px 1px 0 ${WIN95.bgLight}, inset -1px -1px 0 ${WIN95.bgDark}`,
    color: WIN95.textDisabled,
    cursor: 'default'
  },
  small: {
    background: WIN95.buttonFace,
    border: 'none',
    boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}`,
    fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
  }
};

export const PANEL = {
  base: {
    background: WIN95.bg,
    boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}`
  },
  sunken: {
    background: WIN95.inputBg,
    boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}, inset 2px 2px 0 ${WIN95.border.darker}`
  },
  card: {
    background: WIN95.bg,
    border: `1px solid ${WIN95.border.darker}`,
    boxShadow: `2px 2px 0 ${WIN95.border.darker}`
  },
  window: {
    background: WIN95.bg,
    boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}, inset 2px 2px 0 ${WIN95.bgLight}, inset -2px -2px 0 ${WIN95.bgDark}`
  }
};

export const TITLEBAR = {
  active: {
    background: 'linear-gradient(90deg, #000080, #1084d0)',
    color: '#ffffff',
    fontFamily: 'Tahoma, "MS Sans Serif", sans-serif',
    fontWeight: 'bold'
  },
  inactive: {
    background: 'linear-gradient(90deg, #808080, #a0a0a0)',
    color: '#c0c0c0',
    fontFamily: 'Tahoma, "MS Sans Serif", sans-serif',
    fontWeight: 'bold'
  }
};

export const TEXT = {
  primary: { color: WIN95.text, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' },
  secondary: { color: '#404040', fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' },
  muted: { color: WIN95.textDisabled, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' },
  highlight: { color: WIN95.highlight, fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }
};

export const INPUT = {
  base: {
    background: WIN95.inputBg,
    boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}, inset 2px 2px 0 ${WIN95.border.darker}`,
    border: 'none',
    color: WIN95.text,
    fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
  }
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
