import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  // Optimize for production - remove unused styles
  future: {
    hoverOnlyWhenSupported: true, // Reduces CSS for touch devices
  },
  theme: {
    extend: {
      height: {
        'dvh': '100dvh',
        'svh': '100svh',
      },
      minHeight: {
        'dvh': '100dvh',
        'svh': '100svh',
      },
      maxHeight: {
        'dvh': '100dvh',
        'svh': '100svh',
      },
      colors: {
        primary: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
        },
        secondary: {
          50: '#fdf4ff',
          100: '#fae8ff',
          200: '#f5d0fe',
          300: '#f0abfc',
          400: '#e879f9',
          500: '#d946ef',
          600: '#c026d3',
          700: '#a21caf',
          800: '#86198f',
          900: '#701a75',
        }
      },
      animation: {
        'pulse-slow': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      /* Note: fadeIn and slideUp animations are defined in index.css */
      scale: {
        '102': '1.02',
      }
    },
  },
  plugins: [],
};

export default config;

