import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useStore } from '../store/useStore';
import { Header } from '../components/Header';
import { ThreadList } from '../components/ThreadList';
import { Settings } from '../components/Settings';
import { ChatArea } from '../components/ChatArea';
import '../index.css';

// Stable hash function for paragraph text
function generateParagraphHash(text: string): string {
  const clean = text.trim().toLowerCase().replace(/\s+/g, ' ');
  let hash = 0;
  for (let i = 0; i < clean.length; i++) {
    const code = clean.charCodeAt(i);
    hash = (hash << 5) - hash + code;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

const SidePanelApp: React.FC = () => {
  const {
    loadThreads,
    loadSettings,
    settings,
    activeThreadId,
    setActiveThreadId,
    createThread,
    threads,
  } = useStore();

  const [activeTab, setActiveTab] = useState<'threads' | 'settings'>('threads');

  // Load initial settings and threads
  useEffect(() => {
    loadSettings();
    loadThreads();
  }, []);

  // Sync theme
  useEffect(() => {
    const root = document.documentElement;
    const isDark =
      settings.theme === 'dark' ||
      (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [settings.theme]);

  // Listen for messages from content scripts
  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.onMessage) return;

    const handleMessage = async (message: any, sender: any, sendResponse: any) => {
      console.log('Sidepanel received message:', message);
      
      if (message.type === 'OPEN_THREAD' || message.type === 'CREATE_THREAD') {
        const { selectedText, site } = message.data;
        const hash = generateParagraphHash(selectedText);
        const threadId = `thread_${hash}`;
        
        // Check if thread with this ID already exists
        const existingThread = threads.find((t) => t.id === threadId);
        
        if (existingThread) {
          setActiveThreadId(threadId);
          setActiveTab('threads');
        } else {
          // Double check if there's an identical text match to prevent duplicate threads
          const matchByText = threads.find(
            (t) => t.selectedText.trim().toLowerCase() === selectedText.trim().toLowerCase()
          );
          
          if (matchByText) {
            setActiveThreadId(matchByText.id);
            setActiveTab('threads');
          } else {
            try {
              const newThread = await createThread(
                site || 'new-chat',
                'turn_0',
                hash,
                selectedText,
                null
              );
              setActiveThreadId(newThread.id);
              setActiveTab('threads');
            } catch (err) {
              console.error('Failed to create thread from message:', err);
            }
          }
        }
        sendResponse?.({ success: true });
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, [threads]);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-50 transition-colors duration-200">
      <Header activeTab={activeTab} setActiveTab={setActiveTab} onClose={() => {}} />
      
      <main className="flex-1 overflow-hidden flex flex-col">
        {activeThreadId ? (
          <ChatArea />
        ) : activeTab === 'threads' ? (
          <ThreadList />
        ) : (
          <Settings />
        )}
      </main>
    </div>
  );
};

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <SidePanelApp />
    </React.StrictMode>
  );
}
