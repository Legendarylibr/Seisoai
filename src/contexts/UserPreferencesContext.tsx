/**
 * UserPreferencesContext
 * Manages user preferences — theme, generation defaults, agent settings.
 * Persists to localStorage and syncs to backend.
 */
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { useSimpleWallet } from './SimpleWalletContext';
import logger from '../utils/logger';
import { API_URL } from '../utils/apiConfig';

// All available features/tabs the user can enable
export const ALL_FEATURES = [
  { id: 'workbench', label: 'Agent Builder', description: 'Build agents, wire capabilities, manage API keys', icon: 'Bot' },
  { id: 'chat', label: 'Chat AI', description: 'Conversational AI assistant', icon: 'MessageCircle' },
  { id: 'generate', label: 'Image Gen', description: 'Generate images with AI', icon: 'Sparkles' },
  { id: 'batch', label: 'Batch', description: 'Generate multiple images at once', icon: 'Layers' },
  { id: 'video', label: 'Video', description: 'Create AI videos', icon: 'Film' },
  { id: 'music', label: 'Music', description: 'Generate music and audio', icon: 'Music' },
  { id: 'training', label: 'Training', description: 'Train custom LoRA models', icon: 'Cpu' },
  { id: 'gallery', label: 'Gallery', description: 'Browse and manage generations', icon: 'Grid' },
] as const;

export const ALL_TAB_IDS = ALL_FEATURES.map((f) => f.id);

export interface UserPreferences {
  // Theme
  theme: 'system' | 'light' | 'dark' | 'high-contrast';
  accentColor: string;

  // UI — which features/tabs are visible
  enabledTabs: string[];

  // Generation defaults
  defaultModel: string | null;
  defaultStyle: string | null;
  defaultAspectRatio: string;
  defaultOptimizePrompt: boolean;

  // Agent preferences
  defaultTab: string;

  // Language
  language: 'en' | 'ja' | 'zh';

  // Whether the user has completed the profile setup
  profileCompleted: boolean;
}

const DEFAULT_PREFERENCES: UserPreferences = {
  theme: 'system',
  accentColor: '#000080', // Win95 blue
  enabledTabs: ['workbench'], // Agent Builder only — users add capabilities via Build Your UI
  defaultModel: null,
  defaultStyle: null,
  defaultAspectRatio: '1:1',
  defaultOptimizePrompt: false,
  defaultTab: 'workbench',
  language: 'en',
  profileCompleted: false,
};

const STORAGE_KEY = 'seiso_preferences';
const PREFS_VERSION_KEY = 'seiso_prefs_version';
// Bump this when a migration needs to force-reset enabledTabs
const CURRENT_PREFS_VERSION = 2;

// Accent color presets
export const ACCENT_COLORS = [
  { name: 'Classic Blue', value: '#000080' },
  { name: 'Teal', value: '#008080' },
  { name: 'Green', value: '#008000' },
  { name: 'Purple', value: '#800080' },
  { name: 'Red', value: '#800000' },
  { name: 'Ocean', value: '#2060a0' },
];

interface UserPreferencesContextValue {
  preferences: UserPreferences;
  updatePreference: <K extends keyof UserPreferences>(key: K, value: UserPreferences[K]) => void;
  resetDefaults: () => void;
  isSettingsOpen: boolean;
  openSettings: () => void;
  closeSettings: () => void;
}

const UserPreferencesContext = createContext<UserPreferencesContextValue>({
  preferences: DEFAULT_PREFERENCES,
  updatePreference: () => {},
  resetDefaults: () => {},
  isSettingsOpen: false,
  openSettings: () => {},
  closeSettings: () => {},
});

export function useUserPreferences(): UserPreferencesContextValue {
  return useContext(UserPreferencesContext);
}

function migratePreferences(prefs: UserPreferences): UserPreferences {
  // Migrate "marketplace" → "workbench" (v2026.02 rename)
  if (prefs.enabledTabs?.includes('marketplace')) {
    prefs.enabledTabs = prefs.enabledTabs.map(t => t === 'marketplace' ? 'workbench' : t);
    prefs.enabledTabs = [...new Set(prefs.enabledTabs)];
  }
  // Ensure workbench is always in enabledTabs if missing
  if (prefs.enabledTabs && !prefs.enabledTabs.includes('workbench')) {
    prefs.enabledTabs = ['workbench', ...prefs.enabledTabs];
  }
  if ((prefs as unknown as Record<string, unknown>).defaultTab === 'marketplace') {
    prefs.defaultTab = 'workbench';
  }

  // v2 migration: reset to workbench-only (UI builder is now the entry point)
  const savedVersion = parseInt(localStorage.getItem(PREFS_VERSION_KEY) || '0', 10);
  if (savedVersion < CURRENT_PREFS_VERSION) {
    prefs.enabledTabs = ['workbench'];
    prefs.defaultTab = 'workbench';
    localStorage.setItem(PREFS_VERSION_KEY, String(CURRENT_PREFS_VERSION));
  }

  return prefs;
}

function loadPreferences(): UserPreferences {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return migratePreferences({ ...DEFAULT_PREFERENCES, ...parsed });
    }
  } catch (error) {
    logger.warn('Failed to load preferences from localStorage', { error });
  }
  return { ...DEFAULT_PREFERENCES };
}

function savePreferences(prefs: UserPreferences): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch (error) {
    logger.warn('Failed to save preferences to localStorage', { error });
  }
}

function applyTheme(theme: UserPreferences['theme']): void {
  const root = document.documentElement;
  // Remove all theme classes
  root.classList.remove('theme-light', 'theme-dark', 'theme-high-contrast');

  if (theme === 'light') {
    root.classList.add('theme-light');
  } else if (theme === 'dark') {
    root.classList.add('theme-dark');
  } else if (theme === 'high-contrast') {
    root.classList.add('theme-high-contrast');
  }
  // 'system' = no class override, uses prefers-color-scheme
}

function applyAccentColor(color: string): void {
  document.documentElement.style.setProperty('--win95-highlight', color);
}

export function UserPreferencesProvider({ children }: { children: ReactNode }): JSX.Element {
  const [preferences, setPreferences] = useState<UserPreferences>(loadPreferences);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const { address, isConnected } = useSimpleWallet();

  // Apply theme and accent on mount and change
  useEffect(() => {
    applyTheme(preferences.theme);
  }, [preferences.theme]);

  useEffect(() => {
    applyAccentColor(preferences.accentColor);
  }, [preferences.accentColor]);

  // Sync to backend when connected
  useEffect(() => {
    if (isConnected && address) {
      // Async sync to backend — fire and forget
      fetch(`${API_URL}/api/users/${address}/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ preferences }),
      }).catch(() => {
        // Silent fail — localStorage is the primary store
      });
    }
  }, [preferences, isConnected, address]);

  const updatePreference = useCallback(<K extends keyof UserPreferences>(
    key: K,
    value: UserPreferences[K]
  ) => {
    setPreferences((prev) => {
      const next = { ...prev, [key]: value };
      savePreferences(next);
      return next;
    });
  }, []);

  const resetDefaults = useCallback(() => {
    setPreferences({ ...DEFAULT_PREFERENCES });
    savePreferences(DEFAULT_PREFERENCES);
  }, []);

  const openSettings = useCallback(() => setIsSettingsOpen(true), []);
  const closeSettings = useCallback(() => setIsSettingsOpen(false), []);

  return (
    <UserPreferencesContext.Provider
      value={{
        preferences,
        updatePreference,
        resetDefaults,
        isSettingsOpen,
        openSettings,
        closeSettings,
      }}
    >
      {children}
    </UserPreferencesContext.Provider>
  );
}

export default UserPreferencesContext;
