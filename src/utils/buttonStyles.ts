// Windows 95 style button utilities

// Windows 95 style constants - shared across all components
// Now using CSS variables for automatic dark mode support
export interface Win95Colors {
  bg: string;
  bgLight: string;
  bgDark: string;
  border: {
    light: string;
    dark: string;
    darker: string;
  };
  text: string;
  textDisabled: string;
  highlight: string;
  highlightText: string;
  inputBg: string;
  buttonFace: string;
}

export interface ButtonStyle {
  background: string;
  border: string;
  boxShadow: string;
  color?: string;
  fontFamily?: string;
  cursor?: string;
}

export interface PanelStyle {
  background: string;
  boxShadow?: string;
  border?: string;
}

export interface TitlebarStyle {
  background: string;
  color: string;
  fontFamily: string;
  fontWeight: string;
}

export interface TextStyle {
  color: string;
  fontFamily: string;
}

export interface InputStyle {
  background: string;
  boxShadow: string;
  border: string;
  color: string;
  fontFamily: string;
}

// CSS variable references - automatically adapt to dark mode
export const WIN95: Win95Colors & {
  panelBg: string;
  windowContentBg: string;
  errorBg: string;
  errorText: string;
  successText: string;
  warningText: string;
  activeTitle: string;
  inactiveTitle: string;
} = {
  bg: 'var(--win95-bg)',
  bgLight: 'var(--win95-bg-light)',
  bgDark: 'var(--win95-bg-dark)',
  border: {
    light: 'var(--win95-border-light)',
    dark: 'var(--win95-border-dark)',
    darker: 'var(--win95-border-darker)'
  },
  text: 'var(--win95-text)',
  textDisabled: 'var(--win95-text-disabled)',
  highlight: 'var(--win95-highlight)',
  highlightText: 'var(--win95-highlight-text)',
  inputBg: 'var(--win95-input-bg)',
  buttonFace: 'var(--win95-button-face)',
  // New dark mode aware colors
  panelBg: 'var(--win95-panel-bg)',
  windowContentBg: 'var(--win95-window-content-bg)',
  errorBg: 'var(--win95-error-bg)',
  errorText: 'var(--win95-error-text)',
  successText: 'var(--win95-success-text)',
  warningText: 'var(--win95-warning-text)',
  activeTitle: 'var(--win95-active-title)',
  inactiveTitle: 'var(--win95-inactive-title)'
};

export const BTN: Record<string, ButtonStyle> = {
  base: {
    background: 'var(--win95-button-face)',
    border: 'none',
    boxShadow: 'inset 1px 1px 0 var(--win95-border-light), inset -1px -1px 0 var(--win95-border-darker), inset 2px 2px 0 var(--win95-bg-light), inset -2px -2px 0 var(--win95-bg-dark)',
    color: 'var(--win95-text)',
    fontFamily: 'Tahoma, "MS Sans Serif", sans-serif',
    cursor: 'pointer'
  },
  hover: {
    background: 'var(--win95-bg-light)',
    border: 'none',
    boxShadow: 'inset 1px 1px 0 var(--win95-border-light), inset -1px -1px 0 var(--win95-border-darker), inset 2px 2px 0 var(--win95-bg-light), inset -2px -2px 0 var(--win95-bg-dark)',
    color: 'var(--win95-text)'
  },
  active: {
    background: 'var(--win95-bg-dark)',
    border: 'none',
    boxShadow: 'inset 1px 1px 0 var(--win95-border-darker), inset -1px -1px 0 var(--win95-border-light)',
    color: 'var(--win95-text)'
  },
  disabled: {
    background: 'var(--win95-button-face)',
    border: 'none',
    boxShadow: 'inset 1px 1px 0 var(--win95-bg-light), inset -1px -1px 0 var(--win95-bg-dark)',
    color: 'var(--win95-text-disabled)',
    cursor: 'default'
  },
  small: {
    background: 'var(--win95-button-face)',
    border: 'none',
    boxShadow: 'inset 1px 1px 0 var(--win95-border-light), inset -1px -1px 0 var(--win95-border-darker)',
    fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
  }
};

export const PANEL: Record<string, PanelStyle> = {
  base: {
    background: 'var(--win95-bg)',
    boxShadow: 'inset 1px 1px 0 var(--win95-border-light), inset -1px -1px 0 var(--win95-border-darker)'
  },
  sunken: {
    background: 'var(--win95-input-bg)',
    boxShadow: 'inset 1px 1px 0 var(--win95-border-dark), inset -1px -1px 0 var(--win95-border-light), inset 2px 2px 0 var(--win95-border-darker)'
  },
  card: {
    background: 'var(--win95-bg)',
    border: '1px solid var(--win95-border-darker)',
    boxShadow: '2px 2px 0 var(--win95-border-darker)'
  },
  window: {
    background: 'var(--win95-bg)',
    boxShadow: 'inset 1px 1px 0 var(--win95-border-light), inset -1px -1px 0 var(--win95-border-darker), inset 2px 2px 0 var(--win95-bg-light), inset -2px -2px 0 var(--win95-bg-dark)'
  }
};

export const TITLEBAR: Record<string, TitlebarStyle> = {
  active: {
    background: 'var(--win95-active-title)',
    color: '#ffffff',
    fontFamily: 'Tahoma, "MS Sans Serif", sans-serif',
    fontWeight: 'bold'
  },
  inactive: {
    background: 'var(--win95-inactive-title)',
    color: 'var(--win95-text-disabled)',
    fontFamily: 'Tahoma, "MS Sans Serif", sans-serif',
    fontWeight: 'bold'
  }
};

// Standard window title bar style (use instead of hardcoded gradients)
export const WINDOW_TITLE_STYLE = {
  background: 'var(--win95-active-title)',
  color: '#ffffff',
  fontFamily: 'Tahoma, "MS Sans Serif", sans-serif',
  fontWeight: 'bold' as const
};

export const TEXT: Record<string, TextStyle> = {
  primary: { color: 'var(--win95-text)', fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' },
  secondary: { color: 'var(--win95-border-dark)', fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' },
  muted: { color: 'var(--win95-text-disabled)', fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' },
  highlight: { color: 'var(--win95-highlight)', fontFamily: 'Tahoma, "MS Sans Serif", sans-serif' }
};

export const INPUT: Record<string, InputStyle> = {
  base: {
    background: 'var(--win95-input-bg)',
    boxShadow: 'inset 1px 1px 0 var(--win95-border-dark), inset -1px -1px 0 var(--win95-border-light), inset 2px 2px 0 var(--win95-border-darker)',
    border: 'none',
    color: 'var(--win95-text)',
    fontFamily: 'Tahoma, "MS Sans Serif", sans-serif'
  }
};

// Apply hover effect to button element
export const applyHover = (e: React.MouseEvent<HTMLElement>): void => {
  Object.assign(e.currentTarget.style, BTN.hover);
};

// Remove hover effect from button element  
export const removeHover = (e: React.MouseEvent<HTMLElement>): void => {
  Object.assign(e.currentTarget.style, BTN.base);
};

// Apply active/pressed effect
export const applyActive = (e: React.MouseEvent<HTMLElement>): void => {
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

