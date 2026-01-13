/**
 * Windows 95 Style UI Components
 * Shared components for the retro Win95 aesthetic used across the app
 */
import React, { memo, type ReactNode, type CSSProperties } from 'react';

// Windows 95 style constants
export const WIN95_COLORS = {
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
} as const;

// CSS variables for Win95 theme (for use in CSS files)
export const WIN95_CSS_VARS = `
  --win95-bg: ${WIN95_COLORS.bg};
  --win95-bg-light: ${WIN95_COLORS.bgLight};
  --win95-bg-dark: ${WIN95_COLORS.bgDark};
  --win95-border-light: ${WIN95_COLORS.border.light};
  --win95-border-dark: ${WIN95_COLORS.border.dark};
  --win95-border-darker: ${WIN95_COLORS.border.darker};
  --win95-text: ${WIN95_COLORS.text};
  --win95-text-disabled: ${WIN95_COLORS.textDisabled};
  --win95-highlight: ${WIN95_COLORS.highlight};
  --win95-highlight-text: ${WIN95_COLORS.highlightText};
  --win95-input-bg: ${WIN95_COLORS.inputBg};
  --win95-button-face: ${WIN95_COLORS.buttonFace};
`;

// Common font family for Win95 components
const WIN95_FONT = 'Tahoma, "MS Sans Serif", sans-serif';

// ============================================
// Win95Button
// ============================================
export interface Win95ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  active?: boolean;
  className?: string;
  style?: CSSProperties;
  type?: 'button' | 'submit' | 'reset';
}

export const Win95Button = memo<Win95ButtonProps>(function Win95Button({ 
  children, 
  onClick, 
  disabled, 
  active, 
  className = '',
  style,
  type = 'button'
}) {
  const buttonStyle: CSSProperties = {
    background: active ? WIN95_COLORS.bgDark : WIN95_COLORS.buttonFace,
    color: disabled ? WIN95_COLORS.textDisabled : (active ? WIN95_COLORS.highlightText : WIN95_COLORS.text),
    border: 'none',
    boxShadow: active 
      ? `inset 1px 1px 0 ${WIN95_COLORS.border.darker}, inset -1px -1px 0 ${WIN95_COLORS.border.light}`
      : disabled
        ? `inset 1px 1px 0 ${WIN95_COLORS.bgLight}, inset -1px -1px 0 ${WIN95_COLORS.bgDark}`
        : `inset 1px 1px 0 ${WIN95_COLORS.border.light}, inset -1px -1px 0 ${WIN95_COLORS.border.darker}, inset 2px 2px 0 ${WIN95_COLORS.bgLight}, inset -2px -2px 0 ${WIN95_COLORS.bgDark}`,
    cursor: disabled ? 'default' : 'pointer',
    fontFamily: WIN95_FONT,
    ...style
  };

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`px-3 py-1 text-[11px] font-bold transition-none select-none ${className}`}
      style={buttonStyle}
    >
      {children}
    </button>
  );
});

// ============================================
// Win95Panel (sunken or raised)
// ============================================
export interface Win95PanelProps {
  children: ReactNode;
  className?: string;
  sunken?: boolean;
  style?: CSSProperties;
}

export const Win95Panel = memo<Win95PanelProps>(function Win95Panel({ 
  children, 
  className = '', 
  sunken = true,
  style 
}) {
  const panelStyle: CSSProperties = {
    background: sunken ? WIN95_COLORS.inputBg : WIN95_COLORS.bg,
    boxShadow: sunken
      ? `inset 1px 1px 0 ${WIN95_COLORS.border.dark}, inset -1px -1px 0 ${WIN95_COLORS.border.light}, inset 2px 2px 0 ${WIN95_COLORS.border.darker}`
      : `inset 1px 1px 0 ${WIN95_COLORS.border.light}, inset -1px -1px 0 ${WIN95_COLORS.border.darker}`,
    ...style
  };

  return (
    <div className={className} style={panelStyle}>
      {children}
    </div>
  );
});

// ============================================
// Win95GroupBox (with blue title bar)
// ============================================
export interface Win95GroupBoxProps {
  title: string;
  children: ReactNode;
  className?: string;
  icon?: ReactNode;
}

export const Win95GroupBox = memo<Win95GroupBoxProps>(function Win95GroupBox({ 
  title, 
  children, 
  className = '', 
  icon 
}) {
  return (
    <div 
      className={`flex flex-col ${className}`}
      style={{
        background: WIN95_COLORS.bg,
        boxShadow: `inset 1px 1px 0 ${WIN95_COLORS.border.light}, inset -1px -1px 0 ${WIN95_COLORS.border.darker}, inset 2px 2px 0 ${WIN95_COLORS.bgLight}, inset -2px -2px 0 ${WIN95_COLORS.bgDark}, 2px 2px 0 rgba(0,0,0,0.15)`
      }}
    >
      {/* Blue title bar */}
      <div 
        className="flex items-center gap-1.5 px-2 py-1"
        style={{ 
          background: 'linear-gradient(90deg, #000080 0%, #1084d0 100%)',
          color: '#ffffff'
        }}
      >
        {icon}
        <span className="text-[10px] font-bold" style={{ fontFamily: WIN95_FONT }}>
          {title}
        </span>
      </div>
      {/* Content */}
      <div className="relative flex-1 p-2">
        {children}
      </div>
    </div>
  );
});

// ============================================
// Win95Window (full window with title bar and controls)
// ============================================
export interface Win95WindowProps {
  title: string;
  children: ReactNode;
  className?: string;
  icon?: ReactNode;
  onClose?: () => void;
  onMinimize?: () => void;
  onMaximize?: () => void;
}

export const Win95Window = memo<Win95WindowProps>(function Win95Window({
  title,
  children,
  className = '',
  icon,
  onClose,
  onMinimize,
  onMaximize
}) {
  return (
    <div
      className={`flex flex-col ${className}`}
      style={{
        background: WIN95_COLORS.bg,
        boxShadow: `inset 1px 1px 0 ${WIN95_COLORS.border.light}, inset -1px -1px 0 ${WIN95_COLORS.border.darker}, 2px 2px 4px rgba(0,0,0,0.3)`
      }}
    >
      {/* Title bar */}
      <div
        className="flex items-center justify-between px-1 py-0.5"
        style={{
          background: 'linear-gradient(90deg, #000080 0%, #1084d0 100%)',
          color: '#ffffff'
        }}
      >
        <div className="flex items-center gap-1">
          {icon}
          <span className="text-[11px] font-bold" style={{ fontFamily: WIN95_FONT }}>
            {title}
          </span>
        </div>
        <div className="flex gap-0.5">
          {onMinimize && (
            <button
              onClick={onMinimize}
              className="w-4 h-4 flex items-center justify-center text-[10px]"
              style={{
                background: WIN95_COLORS.bg,
                boxShadow: `inset 1px 1px 0 ${WIN95_COLORS.border.light}, inset -1px -1px 0 ${WIN95_COLORS.border.darker}`
              }}
            >
              _
            </button>
          )}
          {onMaximize && (
            <button
              onClick={onMaximize}
              className="w-4 h-4 flex items-center justify-center text-[10px]"
              style={{
                background: WIN95_COLORS.bg,
                boxShadow: `inset 1px 1px 0 ${WIN95_COLORS.border.light}, inset -1px -1px 0 ${WIN95_COLORS.border.darker}`
              }}
            >
              □
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="w-4 h-4 flex items-center justify-center text-[10px] font-bold"
              style={{
                background: WIN95_COLORS.bg,
                boxShadow: `inset 1px 1px 0 ${WIN95_COLORS.border.light}, inset -1px -1px 0 ${WIN95_COLORS.border.darker}`
              }}
            >
              ×
            </button>
          )}
        </div>
      </div>
      {/* Content */}
      <div className="flex-1 p-1">
        {children}
      </div>
    </div>
  );
});

// ============================================
// Win95Input
// ============================================
export interface Win95InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  containerClassName?: string;
}

export const Win95Input = memo<Win95InputProps>(function Win95Input({
  className = '',
  containerClassName = '',
  style,
  ...props
}) {
  return (
    <div
      className={containerClassName}
      style={{
        background: WIN95_COLORS.inputBg,
        boxShadow: `inset 1px 1px 0 ${WIN95_COLORS.border.dark}, inset -1px -1px 0 ${WIN95_COLORS.border.light}, inset 2px 2px 0 ${WIN95_COLORS.border.darker}`
      }}
    >
      <input
        className={`w-full p-1 text-[11px] focus:outline-none ${className}`}
        style={{
          background: 'transparent',
          color: WIN95_COLORS.text,
          fontFamily: WIN95_FONT,
          ...style
        }}
        {...props}
      />
    </div>
  );
});

// ============================================
// Win95Textarea
// ============================================
export interface Win95TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  containerClassName?: string;
}

export const Win95Textarea = memo<Win95TextareaProps>(function Win95Textarea({
  className = '',
  containerClassName = '',
  style,
  ...props
}) {
  return (
    <div
      className={containerClassName}
      style={{
        background: WIN95_COLORS.inputBg,
        boxShadow: `inset 1px 1px 0 ${WIN95_COLORS.border.dark}, inset -1px -1px 0 ${WIN95_COLORS.border.light}, inset 2px 2px 0 ${WIN95_COLORS.border.darker}`
      }}
    >
      <textarea
        className={`w-full p-1 resize-none text-[11px] focus:outline-none ${className}`}
        style={{
          background: 'transparent',
          color: WIN95_COLORS.text,
          fontFamily: WIN95_FONT,
          ...style
        }}
        {...props}
      />
    </div>
  );
});

// ============================================
// Win95Checkbox
// ============================================
export interface Win95CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
}

export const Win95Checkbox = memo<Win95CheckboxProps>(function Win95Checkbox({
  checked,
  onChange,
  label,
  disabled,
  className = ''
}) {
  return (
    <label
      onClick={() => !disabled && onChange(!checked)}
      className={`flex items-center gap-1.5 cursor-pointer select-none ${disabled ? 'opacity-50' : ''} ${className}`}
      style={{ fontFamily: WIN95_FONT }}
    >
      <div
        className="w-3.5 h-3.5 flex items-center justify-center"
        style={{
          background: WIN95_COLORS.inputBg,
          boxShadow: `inset 1px 1px 0 ${WIN95_COLORS.border.dark}, inset -1px -1px 0 ${WIN95_COLORS.border.light}, inset 2px 2px 0 ${WIN95_COLORS.bgDark}`
        }}
      >
        {checked && (
          <span className="text-[10px] font-bold" style={{ color: WIN95_COLORS.text }}>✓</span>
        )}
      </div>
      {label && (
        <span className="text-[10px]" style={{ color: disabled ? WIN95_COLORS.textDisabled : WIN95_COLORS.text }}>
          {label}
        </span>
      )}
    </label>
  );
});

// ============================================
// Win95StatusBar
// ============================================
export interface Win95StatusBarProps {
  children: ReactNode;
  className?: string;
}

export const Win95StatusBar = memo<Win95StatusBarProps>(function Win95StatusBar({
  children,
  className = ''
}) {
  return (
    <div
      className={`flex items-center px-1 lg:px-2 py-0.5 text-[9px] flex-shrink-0 ${className}`}
      style={{
        background: WIN95_COLORS.bg,
        borderTop: `1px solid ${WIN95_COLORS.border.light}`,
        color: WIN95_COLORS.text,
        fontFamily: WIN95_FONT
      }}
    >
      {children}
    </div>
  );
});

// ============================================
// Win95StatusBarItem
// ============================================
export interface Win95StatusBarItemProps {
  children: ReactNode;
  className?: string;
}

export const Win95StatusBarItem = memo<Win95StatusBarItemProps>(function Win95StatusBarItem({
  children,
  className = ''
}) {
  return (
    <Win95Panel sunken className={`px-1 lg:px-2 py-0.5 ${className}`}>
      {children}
    </Win95Panel>
  );
});

// Export all components
export default {
  Button: Win95Button,
  Panel: Win95Panel,
  GroupBox: Win95GroupBox,
  Window: Win95Window,
  Input: Win95Input,
  Textarea: Win95Textarea,
  Checkbox: Win95Checkbox,
  StatusBar: Win95StatusBar,
  StatusBarItem: Win95StatusBarItem,
  COLORS: WIN95_COLORS
};
