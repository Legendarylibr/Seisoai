/**
 * SettingsPanel — Win95 modal for user preferences
 * Features toggle, theme, generation defaults, agent settings
 */
import { useState, useCallback, memo } from 'react';
import {
  Settings, X, Monitor, Sun, Moon, Eye, RotateCcw, Palette, Sliders, Bot,
  MessageCircle, Sparkles, Layers, Film, Music, Cpu, Grid, LayoutGrid
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { WIN95, BTN, hoverHandlers } from '../utils/buttonStyles';
import { useUserPreferences, ACCENT_COLORS, ALL_FEATURES } from '../contexts/UserPreferencesContext';
import { useLanguage } from '../i18n';

const font = 'Tahoma, "MS Sans Serif", sans-serif';

const ICON_MAP: Record<string, LucideIcon> = {
  MessageCircle, Sparkles, Layers, Film, Music, Cpu, Bot, Grid,
};

const THEMES = [
  { id: 'system' as const, label: 'System', icon: Monitor, description: 'Follow OS setting' },
  { id: 'light' as const, label: 'Light', icon: Sun, description: 'Classic Win95' },
  { id: 'dark' as const, label: 'Dark', icon: Moon, description: 'Dark theme' },
  { id: 'high-contrast' as const, label: 'High Contrast', icon: Eye, description: 'Accessibility' },
];

const MODELS = [
  { id: null, label: 'None (use default)' },
  { id: 'flux-pro', label: 'Flux Pro — General purpose' },
  { id: 'flux-2', label: 'Flux 2 — Photorealistic' },
  { id: 'nano-banana-pro', label: 'Nano Banana Pro — Premium' },
];

const ASPECT_RATIOS = [
  { id: '1:1', label: '1:1 Square' },
  { id: '16:9', label: '16:9 Wide' },
  { id: '9:16', label: '9:16 Portrait' },
  { id: '4:3', label: '4:3 Standard' },
  { id: '3:4', label: '3:4 Tall' },
];

type SettingsTab = 'features' | 'appearance' | 'generation' | 'agent';

const SettingsPanel = memo(function SettingsPanel() {
  const { preferences, updatePreference, resetDefaults, isSettingsOpen, closeSettings } = useUserPreferences();
  const { setLanguage } = useLanguage();
  const [activeTab, setActiveTab] = useState<SettingsTab>('features');

  const toggleTab = useCallback((tabId: string) => {
    const current = preferences.enabledTabs;
    if (current.includes(tabId)) {
      if (current.length <= 1) return;
      updatePreference('enabledTabs', current.filter((t) => t !== tabId));
      if (preferences.defaultTab === tabId) {
        const remaining = current.filter((t) => t !== tabId);
        updatePreference('defaultTab', remaining[0]);
      }
    } else {
      updatePreference('enabledTabs', [...current, tabId]);
    }
  }, [preferences.enabledTabs, preferences.defaultTab, updatePreference]);

  if (!isSettingsOpen) return null;

  const settingsTabs = [
    { id: 'features' as const, label: 'Features', icon: <LayoutGrid size={12} /> },
    { id: 'appearance' as const, label: 'Appearance', icon: <Palette size={12} /> },
    { id: 'generation' as const, label: 'Defaults', icon: <Sliders size={12} /> },
    { id: 'agent' as const, label: 'Agent', icon: <Bot size={12} /> },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.4)' }}
      onClick={(e) => { if (e.target === e.currentTarget) closeSettings(); }}
    >
      <div
        className="w-full max-w-md max-h-[85vh] flex flex-col win95-window-open"
        style={{
          background: WIN95.bg,
          boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}, inset 2px 2px 0 ${WIN95.bgLight}, inset -2px -2px 0 ${WIN95.bgDark}, 4px 4px 8px rgba(0,0,0,0.4)`,
        }}
      >
        {/* Title Bar */}
        <div
          className="flex items-center gap-2 px-3 py-2 flex-shrink-0"
          style={{ background: 'var(--win95-active-title)', color: '#ffffff', fontFamily: font }}
        >
          <Settings className="w-4 h-4" />
          <span className="text-[12px] font-bold flex-1">Settings</span>
          <button
            onClick={closeSettings}
            className="w-5 h-5 flex items-center justify-center text-[10px] font-bold"
            style={{
              background: WIN95.buttonFace,
              boxShadow: `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}`,
              color: WIN95.text, border: 'none', cursor: 'pointer',
            }}
          >
            <X className="w-3 h-3" />
          </button>
        </div>

        {/* Tab Bar */}
        <div className="flex gap-0 px-2 pt-1 flex-shrink-0 overflow-x-auto">
          {settingsTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-bold whitespace-nowrap"
              style={{
                background: activeTab === tab.id ? WIN95.bg : WIN95.bgDark,
                color: activeTab === tab.id ? WIN95.text : WIN95.textDisabled,
                boxShadow: activeTab === tab.id
                  ? `inset 1px 1px 0 ${WIN95.border.light}, inset -1px 0 0 ${WIN95.border.darker}`
                  : `inset 1px 1px 0 ${WIN95.border.light}, inset -1px -1px 0 ${WIN95.border.darker}`,
                border: 'none', cursor: 'pointer', fontFamily: font,
                marginBottom: activeTab === tab.id ? '-1px' : '0',
              }}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 min-h-0">

          {/* ===== FEATURES TAB ===== */}
          {activeTab === 'features' && (
            <div className="space-y-4">
              <p className="text-[10px]" style={{ fontFamily: font, color: WIN95.textDisabled }}>
                Toggle which features appear in your toolbar. Double-click any feature to set it as your home page.
              </p>

              <div className="grid grid-cols-2 gap-2">
                {ALL_FEATURES.map((feature) => {
                  const enabled = preferences.enabledTabs.includes(feature.id);
                  const isDefault = preferences.defaultTab === feature.id;
                  const Icon = ICON_MAP[feature.icon] || Bot;
                  return (
                    <button
                      key={feature.id}
                      onClick={() => toggleTab(feature.id)}
                      onDoubleClick={() => {
                        if (!preferences.enabledTabs.includes(feature.id)) {
                          updatePreference('enabledTabs', [...preferences.enabledTabs, feature.id]);
                        }
                        updatePreference('defaultTab', feature.id);
                      }}
                      className="p-2.5 text-left flex items-start gap-2"
                      style={{
                        background: enabled ? 'var(--win95-info-green)' : WIN95.inputBg,
                        boxShadow: enabled
                          ? `inset 1px 1px 0 ${WIN95.border.darker}, inset -1px -1px 0 ${WIN95.border.light}`
                          : `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`,
                        border: 'none', cursor: 'pointer', fontFamily: font,
                        opacity: enabled ? 1 : 0.6,
                      }}
                    >
                      <Icon
                        className="w-4 h-4 flex-shrink-0 mt-0.5"
                        style={{ color: enabled ? 'var(--win95-success-text)' : WIN95.textDisabled }}
                      />
                      <div className="min-w-0">
                        <div className="text-[11px] font-bold flex items-center gap-1" style={{ color: WIN95.text }}>
                          {feature.label}
                          {isDefault && (
                            <span className="text-[8px] px-1 py-0" style={{ background: WIN95.bgDark, color: WIN95.highlightText }}>HOME</span>
                          )}
                        </div>
                        <div className="text-[9px]" style={{ color: WIN95.textDisabled }}>
                          {feature.description}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <p className="text-[9px]" style={{ fontFamily: font, color: WIN95.textDisabled }}>
                {preferences.enabledTabs.length}/{ALL_FEATURES.length} features enabled. At least one must stay on.
              </p>
            </div>
          )}

          {/* ===== APPEARANCE TAB ===== */}
          {activeTab === 'appearance' && (
            <div className="space-y-5">
              {/* Theme */}
              <div>
                <label className="block text-[11px] font-bold mb-2" style={{ fontFamily: font, color: WIN95.text }}>
                  Theme
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {THEMES.map((theme) => {
                    const Icon = theme.icon;
                    const isActive = preferences.theme === theme.id;
                    return (
                      <button
                        key={theme.id}
                        onClick={() => updatePreference('theme', theme.id)}
                        className="p-2 text-left"
                        style={{
                          background: isActive ? 'var(--win95-info-green)' : WIN95.inputBg,
                          boxShadow: isActive
                            ? `inset 1px 1px 0 ${WIN95.border.darker}, inset -1px -1px 0 ${WIN95.border.light}`
                            : `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`,
                          border: 'none', cursor: 'pointer', fontFamily: font,
                        }}
                      >
                        <div className="flex items-center gap-2">
                          <Icon className="w-4 h-4" style={{ color: isActive ? 'var(--win95-success-text)' : WIN95.text }} />
                          <span className="text-[11px] font-bold" style={{ color: WIN95.text }}>{theme.label}</span>
                        </div>
                        <p className="text-[9px] mt-0.5" style={{ color: WIN95.textDisabled }}>{theme.description}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Accent Color */}
              <div>
                <label className="block text-[11px] font-bold mb-2" style={{ fontFamily: font, color: WIN95.text }}>
                  Accent Color
                </label>
                <div className="flex gap-2 flex-wrap">
                  {ACCENT_COLORS.map((color) => (
                    <button
                      key={color.value}
                      onClick={() => updatePreference('accentColor', color.value)}
                      className="w-8 h-8 flex items-center justify-center"
                      style={{
                        background: color.value,
                        boxShadow: preferences.accentColor === color.value
                          ? `0 0 0 2px ${WIN95.text}, inset 1px 1px 0 rgba(255,255,255,0.3)`
                          : `inset 1px 1px 0 rgba(255,255,255,0.3), inset -1px -1px 0 rgba(0,0,0,0.3)`,
                        border: 'none', cursor: 'pointer',
                      }}
                      title={color.name}
                    >
                      {preferences.accentColor === color.value && (
                        <span className="text-white text-[10px] font-bold">✓</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Language */}
              <div>
                <label className="block text-[11px] font-bold mb-2" style={{ fontFamily: font, color: WIN95.text }}>
                  Language
                </label>
                <div className="flex gap-2">
                  {[
                    { id: 'en' as const, label: 'English', flag: '🇺🇸' },
                    { id: 'ja' as const, label: '日本語', flag: '🇯🇵' },
                    { id: 'zh' as const, label: '中文', flag: '🇨🇳' },
                  ].map((lang) => (
                    <button
                      key={lang.id}
                      onClick={() => {
                        updatePreference('language', lang.id);
                        setLanguage(lang.id);
                      }}
                      className="flex items-center gap-1 px-3 py-1 text-[11px] font-bold"
                      style={{
                        ...(preferences.language === lang.id
                          ? { background: WIN95.bgDark, color: WIN95.highlightText, boxShadow: `inset 1px 1px 0 ${WIN95.border.darker}, inset -1px -1px 0 ${WIN95.border.light}` }
                          : BTN.base),
                        fontFamily: font, border: 'none', cursor: 'pointer',
                      }}
                    >
                      {lang.flag} {lang.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ===== GENERATION DEFAULTS TAB ===== */}
          {activeTab === 'generation' && (
            <div className="space-y-5">
              <div>
                <label className="block text-[11px] font-bold mb-1" style={{ fontFamily: font, color: WIN95.text }}>
                  Default Image Model
                </label>
                <select
                  value={preferences.defaultModel || ''}
                  onChange={(e) => updatePreference('defaultModel', e.target.value || null)}
                  className="w-full p-2 text-[11px]"
                  style={{
                    background: WIN95.inputBg,
                    boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`,
                    border: 'none', color: WIN95.text, fontFamily: font, outline: 'none',
                  }}
                >
                  {MODELS.map((m) => (
                    <option key={m.id || 'none'} value={m.id || ''}>{m.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold mb-2" style={{ fontFamily: font, color: WIN95.text }}>
                  Default Aspect Ratio
                </label>
                <div className="flex flex-wrap gap-1">
                  {ASPECT_RATIOS.map((ar) => (
                    <button
                      key={ar.id}
                      onClick={() => updatePreference('defaultAspectRatio', ar.id)}
                      className="px-3 py-1 text-[10px] font-bold"
                      style={{
                        ...(preferences.defaultAspectRatio === ar.id
                          ? { background: WIN95.bgDark, color: WIN95.highlightText, boxShadow: `inset 1px 1px 0 ${WIN95.border.darker}, inset -1px -1px 0 ${WIN95.border.light}` }
                          : BTN.base),
                        fontFamily: font, border: 'none', cursor: 'pointer',
                      }}
                    >
                      {ar.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label
                  className="flex items-center gap-2 cursor-pointer select-none"
                  onClick={() => updatePreference('defaultOptimizePrompt', !preferences.defaultOptimizePrompt)}
                >
                  <div
                    className="w-3.5 h-3.5 flex items-center justify-center"
                    style={{
                      background: WIN95.inputBg,
                      boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}, inset 2px 2px 0 ${WIN95.bgDark}`,
                    }}
                  >
                    {preferences.defaultOptimizePrompt && (
                      <span className="text-[10px] font-bold" style={{ color: WIN95.text }}>✓</span>
                    )}
                  </div>
                  <span className="text-[11px] font-bold" style={{ fontFamily: font, color: WIN95.text }}>
                    Enable AI prompt optimization by default
                  </span>
                </label>
                <p className="text-[9px] mt-1 ml-6" style={{ color: WIN95.textDisabled, fontFamily: font }}>
                  Automatically enhance prompts with AI for better results
                </p>
              </div>
            </div>
          )}

          {/* ===== AGENT TAB ===== */}
          {activeTab === 'agent' && (
            <div className="space-y-5">
              <div>
                <label className="block text-[11px] font-bold mb-1" style={{ fontFamily: font, color: WIN95.text }}>
                  Default Tab on Launch
                </label>
                <select
                  value={preferences.defaultTab}
                  onChange={(e) => updatePreference('defaultTab', e.target.value)}
                  className="w-full p-2 text-[11px]"
                  style={{
                    background: WIN95.inputBg,
                    boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`,
                    border: 'none', color: WIN95.text, fontFamily: font, outline: 'none',
                  }}
                >
                  {ALL_FEATURES.filter((f) => preferences.enabledTabs.includes(f.id)).map((t) => (
                    <option key={t.id} value={t.id}>{t.label}</option>
                  ))}
                </select>
              </div>

              <div
                className="p-3"
                style={{
                  background: 'var(--win95-info-yellow)',
                  boxShadow: `inset 1px 1px 0 ${WIN95.border.dark}, inset -1px -1px 0 ${WIN95.border.light}`,
                }}
              >
                <h3 className="text-[11px] font-bold mb-1" style={{ fontFamily: font, color: WIN95.text }}>
                  Agent Personality
                </h3>
                <p className="text-[10px]" style={{ fontFamily: font, color: WIN95.textDisabled }}>
                  Custom system prompts and agent behavior configuration coming soon.
                  You'll be able to define how your AI agents communicate and prioritize tasks.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between px-4 py-3 flex-shrink-0"
          style={{ borderTop: `1px solid ${WIN95.bgDark}` }}
        >
          <button
            onClick={resetDefaults}
            className="flex items-center gap-1 px-3 py-1 text-[11px] font-bold"
            style={{ ...BTN.base, fontFamily: font }}
            {...hoverHandlers}
          >
            <RotateCcw className="w-3 h-3" />
            Reset Defaults
          </button>
          <button
            onClick={closeSettings}
            className="flex items-center gap-1 px-4 py-1 text-[11px] font-bold"
            style={{ ...BTN.base, fontFamily: font }}
            {...hoverHandlers}
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
});

export default SettingsPanel;
