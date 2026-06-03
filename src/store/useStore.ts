import { create } from 'zustand';
import type { Thread, ThreadMessage, AppPreferences } from '../types';
import { ThreadDB } from '../services/db';

interface AppState {
  threads: Thread[];
  threadMessages: Record<string, ThreadMessage[]>; // Cached messages per thread ID
  activeThreadId: string | null;
  currentChatId: string;
  isWaitingForResponse: boolean;
  activeGeneratingThreadId: string | null;
  settings: AppPreferences;
  
  // Actions
  loadThreads: () => Promise<void>;
  loadSettings: () => Promise<void>;
  updateSettings: (settings: Partial<AppPreferences>) => Promise<void>;
  setActiveThreadId: (id: string | null) => void;
  setCurrentChatId: (chatId: string) => void;
  setWaitingForResponse: (waiting: boolean, threadId: string | null) => void;
  toggleCollapsedThread: (threadId: string) => void;
  
  createThread: (
    chatId: string,
    messageId: string,
    paragraphHash: string,
    selectedText: string,
    parentId?: string | null
  ) => Promise<Thread>;
  
  loadMessages: (threadId: string) => Promise<ThreadMessage[]>;
  addMessage: (threadId: string, role: 'user' | 'assistant', content: string) => Promise<void>;
  updateLastMessage: (threadId: string, content: string) => Promise<void>;
  deleteThread: (threadId: string) => Promise<void>;
}

const DEFAULT_SETTINGS: AppPreferences = {
  theme: 'system',
  sidebarWidth: 380,
  sidebarOpen: false,
  layoutMode: 'pinned',
  collapsedThreads: {},
  promptTemplate: `[SIDETHREAD_ID:{threadId}]
Context: "{selectedText}"

{history}

Question: {message}`,
};

export const useStore = create<AppState>((set, get) => ({
  threads: [],
  threadMessages: {},
  activeThreadId: null,
  currentChatId: '',
  isWaitingForResponse: false,
  activeGeneratingThreadId: null,
  settings: DEFAULT_SETTINGS,

  loadThreads: async () => {
    try {
      const threads = await ThreadDB.getAllThreads();
      set({ threads });
    } catch (e) {
      console.error('Error loading threads:', e);
    }
  },

  loadSettings: async () => {
    try {
      const dbTheme = await ThreadDB.getPreference('theme');
      const dbWidth = await ThreadDB.getPreference('sidebarWidth');
      const dbOpen = await ThreadDB.getPreference('sidebarOpen');
      const dbMode = await ThreadDB.getPreference('layoutMode');
      const dbCollapsed = await ThreadDB.getPreference('collapsedThreads');
      const dbTemplate = await ThreadDB.getPreference('promptTemplate');

      const loadedSettings: AppPreferences = {
        theme: dbTheme ?? DEFAULT_SETTINGS.theme,
        sidebarWidth: dbWidth ?? DEFAULT_SETTINGS.sidebarWidth,
        sidebarOpen: dbOpen ?? DEFAULT_SETTINGS.sidebarOpen,
        layoutMode: dbMode ?? DEFAULT_SETTINGS.layoutMode,
        collapsedThreads: dbCollapsed ?? DEFAULT_SETTINGS.collapsedThreads,
        promptTemplate: dbTemplate ?? DEFAULT_SETTINGS.promptTemplate,
      };

      set({ settings: loadedSettings });
    } catch (e) {
      console.warn('Failed to load settings from IndexedDB, falling back to local:', e);
      // Fallback to local storage if IndexedDB is not ready yet
      const local = localStorage.getItem('sidethead_settings');
      if (local) {
        set({ settings: { ...DEFAULT_SETTINGS, ...JSON.parse(local) } });
      }
    }
  },

  updateSettings: async (newSettings) => {
    const updated = { ...get().settings, ...newSettings };
    set({ settings: updated });
    
    try {
      // Save all properties to IndexedDB
      const keys = Object.keys(newSettings) as Array<keyof AppPreferences>;
      for (const key of keys) {
        if (newSettings[key] !== undefined) {
          await ThreadDB.savePreference(key, newSettings[key]!);
        }
      }
      // Also fallback to localStorage for redundancy
      localStorage.setItem('sidethead_settings', JSON.stringify(updated));

      // Broadcast update to sync other extension contexts
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ type: 'THREADS_MUTATED' }).catch(() => {});
      }
    } catch (e) {
      console.error('Failed to save settings:', e);
    }
  },

  setActiveThreadId: (id) => {
    set({ activeThreadId: id });
    if (id) {
      get().loadMessages(id);
    }
  },

  setCurrentChatId: (chatId) => {
    set({ currentChatId: chatId });
  },

  setWaitingForResponse: (waiting, threadId) => {
    set({ isWaitingForResponse: waiting, activeGeneratingThreadId: threadId });
  },

  toggleCollapsedThread: (threadId) => {
    const collapsed = { ...get().settings.collapsedThreads };
    collapsed[threadId] = !collapsed[threadId];
    get().updateSettings({ collapsedThreads: collapsed });
  },

  createThread: async (chatId, messageId, paragraphHash, selectedText, parentId = null) => {
    const threadId = `thread_${paragraphHash}`;
    console.log('SideThread Store: createThread starting:', { chatId, threadId, messageId, selectedTextLen: selectedText.length });
    
    // Check if it already exists
    const existing = get().threads.find((t) => t.id === threadId);
    if (existing) {
      console.log('SideThread Store: Thread already exists. Activating thread:', threadId);
      if (parentId && existing.parentId !== parentId) {
        const updated = { ...existing, parentId, updatedAt: Date.now() };
        // Save in background
        ThreadDB.saveThread(updated).catch(e => console.error('SideThread DB: Failed to save parent update:', e));
        set((state) => ({
          threads: state.threads.map((t) => (t.id === threadId ? updated : t)),
        }));
      }
      set({ activeThreadId: threadId });
      get().updateSettings({ sidebarOpen: true });
      return existing;
    }

    // Generate local title (first 5 words)
    const cleanText = selectedText.replace(/[\r\n\t]+/g, ' ').trim();
    const words = cleanText.split(/\s+/);
    const threadTitle = words.slice(0, 5).join(' ') + (words.length > 5 ? '...' : '');

    const newThread: Thread = {
      id: threadId,
      chatId,
      messageId,
      paragraphHash,
      selectedText,
      title: threadTitle,
      parentId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    console.log('SideThread Store: Creating new thread and updating state synchronously:', newThread);

    // Save to IndexedDB in background
    ThreadDB.saveThread(newThread).catch(e => console.error('SideThread DB: Failed to save new thread:', e));

    set((state) => ({
      threads: [newThread, ...state.threads],
      activeThreadId: threadId,
    }));
    
    get().updateSettings({ sidebarOpen: true });
    get().loadMessages(threadId);

    return newThread;
  },

  loadMessages: async (threadId) => {
    try {
      const messages = await ThreadDB.getMessages(threadId);
      set((state) => ({
        threadMessages: {
          ...state.threadMessages,
          [threadId]: messages,
        },
      }));
      return messages;
    } catch (e) {
      console.error('Failed to load messages for thread:', threadId, e);
      return [];
    }
  },

  addMessage: async (threadId, role, content) => {
    console.log('SideThread Store: addMessage starting:', { threadId, role, contentLen: content.length });
    const thread = get().threads.find((t) => t.id === threadId);
    if (!thread) {
      console.warn('SideThread Store: addMessage failed, thread not found:', threadId);
      return;
    }

    const newMessage: ThreadMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      threadId,
      role,
      content,
      timestamp: Date.now(),
    };

    const updatedThread: Thread = {
      ...thread,
      updatedAt: Date.now(),
    };

    console.log('SideThread Store: Updating state synchronously for message:', newMessage.id);

    // 1. Update state synchronously first
    set((state) => {
      const currentMsgs = state.threadMessages[threadId] || [];
      return {
        threads: state.threads.map((t) => (t.id === threadId ? updatedThread : t)),
        threadMessages: {
          ...state.threadMessages,
          [threadId]: [...currentMsgs, newMessage],
        },
      };
    });

    // 2. Perform DB operations in background
    ThreadDB.saveThread(updatedThread).catch(e => console.error('SideThread DB: Failed to save thread on addMessage:', e));
    ThreadDB.saveMessage(newMessage).catch(e => console.error('SideThread DB: Failed to save message on addMessage:', e));

    // 3. Broadcast change to synchronize other extension contexts
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      console.log('SideThread Store: Broadcasting THREADS_MUTATED for new message');
      chrome.runtime.sendMessage({ type: 'THREADS_MUTATED' }).catch(() => {});
    }
  },

  updateLastMessage: (threadId, content) => {
    console.log(`SideThread Store: updateLastMessage called (thread: ${threadId}, len: ${content.length})`);
    const thread = get().threads.find((t) => t.id === threadId);
    if (!thread) {
      console.warn('SideThread Store: updateLastMessage failed, thread not found:', threadId);
      return;
    }

    const currentMsgs = [...(get().threadMessages[threadId] || [])];
    const lastMsg = currentMsgs[currentMsgs.length - 1];

    const updatedThread: Thread = {
      ...thread,
      updatedAt: Date.now(),
    };

    // Save to database asynchronously in the background
    ThreadDB.saveThread(updatedThread).catch(err => {
      console.error('Failed to save thread update in updateLastMessage:', err);
    });

    if (lastMsg && lastMsg.role === 'assistant') {
      const updatedMsg = {
        ...lastMsg,
        content,
        timestamp: Date.now(),
      };
      
      ThreadDB.saveMessage(updatedMsg).catch(err => {
        console.error('Failed to save message update in updateLastMessage:', err);
      });
      
      currentMsgs[currentMsgs.length - 1] = updatedMsg;
      set((state) => ({
        threads: state.threads.map((t) => (t.id === threadId ? updatedThread : t)),
        threadMessages: {
          ...state.threadMessages,
          [threadId]: currentMsgs,
        },
      }));
    } else {
      const newMessage: ThreadMessage = {
        id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        threadId,
        role: 'assistant',
        content,
        timestamp: Date.now(),
      };
      
      ThreadDB.saveMessage(newMessage).catch(err => {
        console.error('Failed to save new message in updateLastMessage:', err);
      });
      
      set((state) => ({
        threads: state.threads.map((t) => (t.id === threadId ? updatedThread : t)),
        threadMessages: {
          ...state.threadMessages,
          [threadId]: [...currentMsgs, newMessage],
        },
      }));
    }
  },

  deleteThread: async (threadId) => {
    try {
      await ThreadDB.deleteThread(threadId);
      set((state) => {
        const nextMessages = { ...state.threadMessages };
        delete nextMessages[threadId];
        return {
          threads: state.threads.filter((t) => t.id !== threadId),
          threadMessages: nextMessages,
          activeThreadId: state.activeThreadId === threadId ? null : state.activeThreadId,
        };
      });

      // Broadcast update to sync other extension contexts
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({ type: 'THREADS_MUTATED' }).catch(() => {});
      }
    } catch (e) {
      console.error('Failed to delete thread:', e);
    }
  },
}));

// Listen for cross-context synchronization messages (e.g. from Content Script to Side Panel)
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  console.log('SideThread Store: Registered runtime message listener for synchronization.');
  chrome.runtime.onMessage.addListener((message) => {
    // Avoid spamming full logs for streaming, but log the message type
    if (message.type === 'STREAMING_UPDATE') {
      console.log(`SideThread Store Sync: Received STREAMING_UPDATE for thread ${message.threadId} (isWaiting: ${message.isWaiting}, len: ${message.content.length})`);
    } else {
      console.log('SideThread Store Sync: Received runtime message:', message);
    }
    
    const store = useStore.getState();
    
    if (message.type === 'STREAMING_UPDATE') {
      const { threadId, content, isWaiting } = message;
      
      // Update waiting state
      store.setWaitingForResponse(isWaiting, isWaiting ? threadId : null);
      
      // Update message text
      const currentMsgs = [...(store.threadMessages[threadId] || [])];
      const lastMsg = currentMsgs[currentMsgs.length - 1];
      
      if (lastMsg && lastMsg.role === 'assistant') {
        currentMsgs[currentMsgs.length - 1] = {
          ...lastMsg,
          content,
          timestamp: Date.now(),
        };
        useStore.setState({
          threadMessages: {
            ...store.threadMessages,
            [threadId]: currentMsgs,
          }
        });
      } else {
        const newMessage: ThreadMessage = {
          id: `msg_sync_${Date.now()}`,
          threadId,
          role: 'assistant',
          content,
          timestamp: Date.now(),
        };
        useStore.setState({
          threadMessages: {
            ...store.threadMessages,
            [threadId]: [...currentMsgs, newMessage],
          }
        });
      }
    } else if (message.type === 'THREADS_MUTATED') {
      console.log('SideThread Store Sync: THREADS_MUTATED received, reloading threads, settings, and messages.');
      // Reload threads and settings
      store.loadThreads();
      store.loadSettings();
      if (store.activeThreadId) {
        store.loadMessages(store.activeThreadId);
      }
    }
  });
}
