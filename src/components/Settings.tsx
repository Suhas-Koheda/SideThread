import React, { useState } from 'react';
import { Save, HelpCircle, RotateCcw } from 'lucide-react';
import { useStore } from '../store/useStore';

export const Settings: React.FC = () => {
  const { settings, updateSettings } = useStore();
  const [theme, setTheme] = useState(settings.theme);
  const [layoutMode, setLayoutMode] = useState(settings.layoutMode || 'pinned');
  const [promptTemplate, setPromptTemplate] = useState(settings.promptTemplate);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const DEFAULT_TEMPLATE = `[SIDETHREAD_ID:{threadId}]
Context: "{selectedText}"

{history}

Question: {message}`;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await updateSettings({
      theme,
      layoutMode,
      promptTemplate,
    });
    
    // Apply theme
    const root = document.documentElement;
    const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  const handleResetTemplate = () => {
    setPromptTemplate(DEFAULT_TEMPLATE);
  };

  return (
    <div className="p-4 space-y-5 overflow-y-auto h-full flex-1">
      <div>
        <h2 className="font-bold text-sm text-slate-800 dark:text-slate-200">Extension Settings</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">Configure how threads behave and appear in your browser.</p>
      </div>

      <form onSubmit={handleSave} className="space-y-4 text-xs">
        {/* Theme Settings */}
        <div className="space-y-1.5">
          <label className="font-semibold text-slate-700 dark:text-slate-300">
            UI Theme
          </label>
          <select
            value={theme}
            onChange={(e: any) => setTheme(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all text-slate-800 dark:text-slate-100"
          >
            <option value="light">Light Mode</option>
            <option value="dark">Dark Mode</option>
            <option value="system">System Default</option>
          </select>
        </div>

        {/* Sidebar layout mode */}
        <div className="space-y-1.5">
          <label className="font-semibold text-slate-700 dark:text-slate-300">
            Sidebar Mode
          </label>
          <select
            value={layoutMode}
            onChange={(e: any) => setLayoutMode(e.target.value as any)}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all text-slate-800 dark:text-slate-100"
          >
            <option value="pinned">Pinned (Split screen: pushes ChatGPT content left)</option>
            <option value="floating">Floating (Overlay: floats over ChatGPT content)</option>
          </select>
        </div>

        {/* Prompt Template Settings */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1">
              ChatGPT Injection Template
            </label>
            <button
              type="button"
              onClick={handleResetTemplate}
              className="text-[10px] text-brand-600 dark:text-brand-400 flex items-center gap-0.5 hover:underline font-medium"
            >
              <RotateCcw className="w-2.5 h-2.5" />
              Reset Default
            </button>
          </div>
          
          <textarea
            value={promptTemplate}
            onChange={(e) => setPromptTemplate(e.target.value)}
            rows={7}
            className="w-full p-2.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all font-mono text-[10px] text-slate-800 dark:text-slate-100 resize-none leading-relaxed"
            placeholder={DEFAULT_TEMPLATE}
            required
          />
          
          {/* Legend helper */}
          <div className="bg-slate-50 dark:bg-slate-900/30 rounded-xl p-3 border border-slate-200/50 dark:border-slate-850 space-y-2 text-[10px] leading-relaxed">
            <h4 className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
              <HelpCircle className="w-3 h-3 text-slate-400" />
              Template Placeholders:
            </h4>
            <ul className="list-disc pl-4 text-slate-500 dark:text-slate-400 space-y-1 font-medium">
              <li><code className="bg-slate-150 dark:bg-slate-800 px-1 rounded font-mono text-[9px] text-brand-500">{`{threadId}`}</code> - Gets replaced by the thread ID identifier. Must be present in the prompt to route responses!</li>
              <li><code className="bg-slate-150 dark:bg-slate-800 px-1 rounded font-mono text-[9px] text-brand-500">{`{selectedText}`}</code> - Gets replaced by the selected paragraph/context content.</li>
              <li><code className="bg-slate-150 dark:bg-slate-800 px-1 rounded font-mono text-[9px] text-brand-500">{`{history}`}</code> - Formats previous thread QA messages to keep ChatGPT aware of the conversation thread context.</li>
              <li><code className="bg-slate-150 dark:bg-slate-800 px-1 rounded font-mono text-[9px] text-brand-500">{`{message}`}</code> - Represents your current follow-up question.</li>
            </ul>
          </div>
        </div>

        {/* Save button */}
        <button
          type="submit"
          className="w-full flex items-center justify-center gap-1.5 bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-700 hover:to-indigo-700 text-white font-semibold py-2 px-4 rounded-xl shadow-md shadow-brand-500/10 active:scale-95 transition-all text-xs"
        >
          <Save className="w-3.5 h-3.5" />
          {saveSuccess ? 'Saved Settings!' : 'Save Settings'}
        </button>
      </form>
    </div>
  );
};
