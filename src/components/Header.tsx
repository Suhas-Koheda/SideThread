import React from 'react';
import { MessageSquare, Settings as SettingsIcon, Moon, Sun, Sparkles } from 'lucide-react';
import { useStore } from '../store/useStore';

interface HeaderProps {
  activeTab: 'threads' | 'settings';
  setActiveTab: (tab: 'threads' | 'settings') => void;
  onClose: () => void;
}

export const Header: React.FC<HeaderProps> = ({ activeTab, setActiveTab, onClose }) => {
  const { settings, updateSettings } = useStore();

  const toggleTheme = () => {
    const nextTheme = settings.theme === 'dark' ? 'light' : 'dark';
    updateSettings({ theme: nextTheme });
    
    // Apply class to HTML tag inside the shadow root or parent document
    const root = document.documentElement;
    if (nextTheme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  };

  return (
    <header className="border-b border-slate-200/80 dark:border-slate-800/80 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md sticky top-0 z-50 px-4 py-3 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-brand-600 to-indigo-500 flex items-center justify-center shadow-md shadow-brand-500/20">
          <Sparkles className="w-4 h-4 text-white animate-pulse" />
        </div>
        <div>
          <h1 className="font-bold text-xs bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-300 bg-clip-text text-transparent leading-none">
            ChatGPT Threads
          </h1>
          <span className="text-[9px] text-slate-400 font-medium">Virtual Context Threads</span>
        </div>
      </div>

      <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg">
        <button
          onClick={() => setActiveTab('threads')}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[10px] font-semibold transition-all duration-200 ${
            activeTab === 'threads'
              ? 'bg-white dark:bg-slate-700 text-brand-600 dark:text-brand-300 shadow-sm'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
          }`}
        >
          <MessageSquare className="w-3 h-3" />
          Threads
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-[10px] font-semibold transition-all duration-200 ${
            activeTab === 'settings'
              ? 'bg-white dark:bg-slate-700 text-brand-600 dark:text-brand-300 shadow-sm'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
          }`}
        >
          <SettingsIcon className="w-3.5 h-3.5" />
          Settings
        </button>
      </div>

      <div className="flex items-center gap-1.5">
        <button
          onClick={toggleTheme}
          className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
          title="Toggle Theme"
        >
          {settings.theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
        </button>
        
        <button
          onClick={onClose}
          className="text-xs font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 px-2 py-1 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
        >
          ✕
        </button>
      </div>
    </header>
  );
};
