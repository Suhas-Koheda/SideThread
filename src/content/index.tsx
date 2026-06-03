import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { useStore } from '../store/useStore';
import { Header } from '../components/Header';
import { ThreadList } from '../components/ThreadList';
import { Settings } from '../components/Settings';
import { ChatArea } from '../components/ChatArea';
import type { Thread } from '../types';
import { submitPromptToChatGPT } from './actions';
import './styles.css';

console.log('SideThread: Content script loaded and evaluating.');

// Root elements
let sidebarContainer: HTMLDivElement | null = null;
let shadowRoot: ShadowRoot | null = null;

// Extractor for ChatGPT Chat ID from URL
const getChatIdFromURL = () => {
  const path = window.location.pathname;
  const match = path.match(/\/c\/([a-f0-9-]+)/);
  return match ? match[1] : 'new-chat';
};

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

// Side Panel wrapper inside content script
const SidebarApp: React.FC = () => {
  const {
    settings,
    activeThreadId,
    setActiveThreadId,
    loadThreads,
    loadSettings,
    setCurrentChatId,
  } = useStore();

  const [activeTab, setActiveTab] = useState<'threads' | 'settings'>('threads');

  // Load store data
  useEffect(() => {
    loadSettings();
    loadThreads();
    setCurrentChatId(getChatIdFromURL());
  }, []);

  // Sync theme inside Shadow DOM
  useEffect(() => {
    if (!shadowRoot) return;
    const isDark =
      settings.theme === 'dark' ||
      (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    
    const container = shadowRoot.querySelector('.sidebar-content-wrapper');
    if (container) {
      if (isDark) {
        container.classList.add('dark');
      } else {
        container.classList.remove('dark');
      }
    }
  }, [settings.theme, settings.sidebarOpen]);

  if (!settings.sidebarOpen) return null;

  return (
    <div
      className="sidebar-content-wrapper flex flex-col h-full bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-50 border-l border-slate-200 dark:border-slate-800 transition-colors duration-200 select-none shadow-2xl overflow-hidden"
      style={{ width: `${settings.sidebarWidth}px` }}
    >
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onClose={() => useStore.getState().updateSettings({ sidebarOpen: false })}
      />
      <main className="flex-1 overflow-hidden flex flex-col min-w-0">
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

// Adjust ChatGPT layout to make room for resizable sidebar (split-screen effect)
function updatePageLayout(isOpen: boolean, width: number, mode: 'pinned' | 'floating') {
  const main = document.querySelector('main');
  if (main) {
    if (isOpen && mode === 'pinned') {
      main.style.marginRight = `${width}px`;
      main.style.transition = 'margin-right 150ms ease';
    } else {
      main.style.marginRight = '0';
      main.style.transition = 'margin-right 200ms ease';
    }
  }
}

// Adjust Sidebar position and borders dynamically based on Pinned vs Floating
function updateSidebarStyle(isOpen: boolean, width: number, mode: 'pinned' | 'floating') {
  if (!sidebarContainer) return;
  
  if (isOpen) {
    sidebarContainer.style.display = 'flex';
    if (mode === 'floating') {
      sidebarContainer.style.top = '20px';
      sidebarContainer.style.right = '20px';
      sidebarContainer.style.height = 'calc(100vh - 40px)';
      sidebarContainer.style.borderRadius = '16px';
      sidebarContainer.style.boxShadow = '0 12px 40px rgba(0, 0, 0, 0.25)';
      sidebarContainer.style.border = '1px solid rgba(139, 92, 246, 0.3)';
      sidebarContainer.style.overflow = 'hidden';
    } else {
      sidebarContainer.style.top = '0';
      sidebarContainer.style.right = '0';
      sidebarContainer.style.height = '100vh';
      sidebarContainer.style.borderRadius = '0';
      sidebarContainer.style.boxShadow = 'none';
      sidebarContainer.style.border = 'none';
      sidebarContainer.style.overflow = 'visible';
    }
  } else {
    sidebarContainer.style.display = 'none';
  }
}

// Initialize Sidebar DOM container
function initSidebar() {
  if (sidebarContainer) return;
  console.log('SideThread: Initializing sidebar DOM container...');

  sidebarContainer = document.createElement('div');
  sidebarContainer.id = 'chatgpt-threads-sidebar-root';
  sidebarContainer.style.position = 'fixed';
  sidebarContainer.style.zIndex = '99999';
  sidebarContainer.style.display = 'none';
  document.body.appendChild(sidebarContainer);

  shadowRoot = sidebarContainer.attachShadow({ mode: 'open' });

  // Inject Stylesheet link
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = chrome.runtime.getURL('content.css');
  shadowRoot.appendChild(link);

  // Fallback / Instant styling: Fetch and inline the CSS text directly into a style tag inside the Shadow DOM
  fetch(chrome.runtime.getURL('content.css'))
    .then(response => response.text())
    .then(css => {
      const style = document.createElement('style');
      style.className = 'sidethread-injected-style';
      style.textContent = css;
      shadowRoot?.appendChild(style);
    })
    .catch(err => {
      console.warn('Failed to inline stylesheet, using link tag only:', err);
    });

  // Inject Resizer Bar (rendered inside Shadow DOM for easy mouse tracking)
  const resizer = document.createElement('div');
  resizer.className = 'sidebar-resizer';
  resizer.style.width = '6px';
  resizer.style.height = '100%';
  resizer.style.cursor = 'col-resize';
  resizer.style.position = 'absolute';
  resizer.style.left = '0';
  resizer.style.top = '0';
  resizer.style.zIndex = '100000';
  resizer.style.backgroundColor = 'transparent';
  shadowRoot.appendChild(resizer);

  // React Mount point
  const reactRoot = document.createElement('div');
  reactRoot.className = 'sidebar-react-root';
  reactRoot.style.height = '100%';
  shadowRoot.appendChild(reactRoot);

  const root = createRoot(reactRoot);
  root.render(<SidebarApp />);

  // Drag Resizer logic
  let isDragging = false;

  resizer.addEventListener('mousedown', (e) => {
    e.preventDefault();
    isDragging = true;
    document.body.style.cursor = 'col-resize';
  });

  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const store = useStore.getState();
    const newWidth = window.innerWidth - e.clientX;
    const clamped = Math.max(280, Math.min(newWidth, 700));
    store.updateSettings({ sidebarWidth: clamped });
    updatePageLayout(store.settings.sidebarOpen, clamped, store.settings.layoutMode);
    updateSidebarStyle(store.settings.sidebarOpen, clamped, store.settings.layoutMode);
  });

  document.addEventListener('mouseup', () => {
    if (isDragging) {
      isDragging = false;
      document.body.style.cursor = '';
    }
  });

  // Load initial settings to apply stylesheet positioning
  useStore.getState().loadSettings().then(() => {
    const store = useStore.getState();
    updatePageLayout(store.settings.sidebarOpen, store.settings.sidebarWidth, store.settings.layoutMode);
    updateSidebarStyle(store.settings.sidebarOpen, store.settings.sidebarWidth, store.settings.layoutMode);
  });
}

// Subscribe to Zustand store changes to update layout
useStore.subscribe((state) => {
  updatePageLayout(state.settings.sidebarOpen, state.settings.sidebarWidth, state.settings.layoutMode);
  updateSidebarStyle(state.settings.sidebarOpen, state.settings.sidebarWidth, state.settings.layoutMode);
});

// Listen to messages from background worker (e.g. keyboard commands and action icon clicks)
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'TOGGLE_SIDEBAR') {
      const store = useStore.getState();
      store.updateSettings({ sidebarOpen: !store.settings.sidebarOpen });
      sendResponse?.({ success: true });
    } else if (message.type === 'INJECT_AND_SUBMIT') {
      try {
        submitPromptToChatGPT(message.prompt);
        sendResponse?.({ success: true });
      } catch (err) {
        console.error('INJECT_AND_SUBMIT failed:', err);
        sendResponse?.({ success: false, error: String(err) });
      }
    }
  });
}

// Sync Threads on URL Changes (new chat UUID generation)
let lastUrl = window.location.href;
setInterval(() => {
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href;
    const store = useStore.getState();
    const prevChatId = store.currentChatId;
    const newChatId = getChatIdFromURL();
    
    if (newChatId !== prevChatId) {
      store.setCurrentChatId(newChatId);
      
      // If we transitioned from 'new-chat' to a UUID, rename local threads
      if (prevChatId === 'new-chat' && newChatId !== 'new-chat') {
        renameNewChatThreads(newChatId);
      }
    }
  }
}, 500);

async function renameNewChatThreads(newChatId: string) {
  const store = useStore.getState();
  const dbThreads = await import('../services/db').then((m) => m.ThreadDB);
  
  const updatedThreads = store.threads.map((thread) => {
    if (thread.chatId === 'new-chat') {
      const newThread: Thread = {
        ...thread,
        chatId: newChatId,
        updatedAt: Date.now()
      };
      
      dbThreads.saveThread(newThread);
      return newThread;
    }
    return thread;
  });

  store.loadThreads();
}

// ----------------------------------------------------
// ChatGPT DOM Observation & Button Injection
// ----------------------------------------------------

let hoveredElement: HTMLElement | null = null;
let hoverIndicatorContainer: HTMLDivElement | null = null;

// Create floating hover trigger buttons (singleton container)
function createHoverContainer() {
  if (hoverIndicatorContainer) return;
  
  hoverIndicatorContainer = document.createElement('div');
  hoverIndicatorContainer.className = 'floating-thread-trigger-container';
  hoverIndicatorContainer.style.position = 'fixed';
  hoverIndicatorContainer.style.display = 'none';
  hoverIndicatorContainer.style.zIndex = '99998';
  document.body.appendChild(hoverIndicatorContainer);

  // Button 1: Create flat thread
  const newThreadBtn = document.createElement('button');
  newThreadBtn.className = 'floating-thread-trigger';
  newThreadBtn.title = 'Start a new discussion thread';
  newThreadBtn.innerHTML = `
    <span class="trigger-icon">💬</span>
    <span class="trigger-label">New Thread</span>
  `;
  newThreadBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (hoveredElement) openThreadForElement(hoveredElement, null);
  });
  hoverIndicatorContainer.appendChild(newThreadBtn);

  // Button 2: Create sub-thread (branch) under active thread
  const subThreadBtn = document.createElement('button');
  subThreadBtn.className = 'floating-thread-trigger branch-trigger';
  subThreadBtn.title = 'Nest sub-discussion under currently active thread';
  subThreadBtn.innerHTML = `
    <span class="trigger-icon">↳</span>
    <span class="trigger-label">Nest Thread</span>
  `;
  subThreadBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const activeId = useStore.getState().activeThreadId;
    if (hoveredElement && activeId) {
      openThreadForElement(hoveredElement, activeId);
    }
  });
  hoverIndicatorContainer.appendChild(subThreadBtn);
}

// Open or create a thread for the target hovered element
async function openThreadForElement(element: HTMLElement, parentId: string | null) {
  const store = useStore.getState();
  const info = getElementMapping(element);
  if (!info) return;

  const { chatId, messageId, paragraphHash, text } = info;
  
  // If there's an active text selection inside this element, use it as the thread context!
  const selection = window.getSelection();
  const selectionText = selection ? selection.toString().trim() : '';
  const textToUse = (selectionText && element.textContent?.includes(selectionText)) ? selectionText : text;
  
  await store.createThread(chatId, messageId, paragraphHash, textToUse, parentId);
}

// Maps a target DOM element to its structural message info and hash
interface DOMMappingInfo {
  chatId: string;
  messageId: string;
  paragraphHash: string;
  text: string;
}

function getElementMapping(element: HTMLElement): DOMMappingInfo | null {
  const parentMarkdown = element.closest('div.markdown.prose') as HTMLElement;
  if (!parentMarkdown) return null;

  const assistantMarkdowns = Array.from(document.querySelectorAll('div.markdown.prose'));
  const turnIndex = assistantMarkdowns.indexOf(parentMarkdown);
  if (turnIndex === -1) return null;

  const text = element.innerText || element.textContent || '';
  if (!text.trim()) return null;

  const paragraphHash = generateParagraphHash(text);
  const chatId = getChatIdFromURL();
  const messageId = `turn_${turnIndex}`;

  return {
    chatId,
    messageId,
    paragraphHash,
    text,
  };
}

let hideTimeout: any = null;

function showIndicator(element: HTMLElement) {
  if (hideTimeout) {
    clearTimeout(hideTimeout);
    hideTimeout = null;
  }
  
  createHoverContainer();
  if (!hoverIndicatorContainer) return;

  hoveredElement = element;
  
  const rect = element.getBoundingClientRect();
  
  // Use fixed positioning relative to viewport, align with the element bounds
  hoverIndicatorContainer.style.position = 'fixed';
  hoverIndicatorContainer.style.top = `${rect.top + 2}px`;
  hoverIndicatorContainer.style.left = `${Math.min(window.innerWidth - 75, rect.right + 6)}px`;
  hoverIndicatorContainer.style.display = 'flex';

  const store = useStore.getState();
  const branchBtn = hoverIndicatorContainer.querySelector('.branch-trigger') as HTMLElement;
  if (branchBtn) {
    if (store.activeThreadId) {
      branchBtn.style.display = 'flex';
    } else {
      branchBtn.style.display = 'none';
    }
  }
}

function hideIndicator() {
  if (hideTimeout) clearTimeout(hideTimeout);
  hideTimeout = setTimeout(() => {
    if (hoverIndicatorContainer) {
      hoverIndicatorContainer.style.display = 'none';
    }
    hoveredElement = null;
  }, 300); // 300ms buffer to cross any element borders
}

// Watch mouse moves to show/hide the floating trigger buttons
document.addEventListener('mouseover', (e) => {
  const target = e.target as HTMLElement;
  const targetElement = target.closest('div.markdown.prose p, div.markdown.prose h1, div.markdown.prose h2, div.markdown.prose h3, div.markdown.prose li, div.markdown.prose pre, div.markdown.prose table, div.markdown.prose blockquote') as HTMLElement;

  if (targetElement && !targetElement.classList.contains('sidethead-anchor-badge')) {
    showIndicator(targetElement);
  } else if (target.closest('.floating-thread-trigger-container')) {
    // If hovering inside the buttons, cancel any pending hide timeout
    if (hideTimeout) {
      clearTimeout(hideTimeout);
      hideTimeout = null;
    }
  }
});

document.addEventListener('mouseout', (e) => {
  const target = e.target as HTMLElement;
  const related = e.relatedTarget as HTMLElement;

  // If moving from a target element, or from the button container, trigger hide
  const targetElement = target.closest('div.markdown.prose p, div.markdown.prose h1, div.markdown.prose h2, div.markdown.prose h3, div.markdown.prose li, div.markdown.prose pre, div.markdown.prose table, div.markdown.prose blockquote') as HTMLElement;
  
  if (targetElement) {
    // Check if we are moving to the buttons
    if (!related || !related.closest('.floating-thread-trigger-container')) {
      hideIndicator();
    }
  } else if (target.closest('.floating-thread-trigger-container')) {
    // Check if we are moving back to a target element or inside the container itself
    if (!related || (!related.closest('.floating-thread-trigger-container') && !related.closest('div.markdown.prose p, div.markdown.prose h1, div.markdown.prose h2, div.markdown.prose h3, div.markdown.prose li, div.markdown.prose pre, div.markdown.prose table, div.markdown.prose blockquote'))) {
      hideIndicator();
    }
  }
});

// Hide indicator immediately on scroll to prevent floating icons from detaching
document.addEventListener('scroll', () => {
  if (hoverIndicatorContainer && hoverIndicatorContainer.style.display !== 'none') {
    if (hideTimeout) {
      clearTimeout(hideTimeout);
      hideTimeout = null;
    }
    hoverIndicatorContainer.style.display = 'none';
    hoveredElement = null;
  }
}, { capture: true, passive: true });


// Render persistent visual indicators (e.g. comment anchors) for active threads
function updateVisualAnchors() {
  const store = useStore.getState();
  const assistantMarkdowns = Array.from(document.querySelectorAll('div.markdown.prose'));

  assistantMarkdowns.forEach((markdown) => {
    const targetElements = Array.from(markdown.querySelectorAll('p, h1, h2, h3, li, pre, table, blockquote')) as HTMLElement[];
    
    targetElements.forEach((element) => {
      if (element.classList.contains('sidethead-anchor-badge') || element.closest('.sidethead-anchor-badge')) {
        return;
      }

      // Clone element and strip any badges to retrieve the original paragraph text cleanly
      const clone = element.cloneNode(true) as HTMLElement;
      clone.querySelectorAll('.sidethead-anchor-badge').forEach((badgeEl) => badgeEl.remove());
      const text = clone.innerText || clone.textContent || '';
      if (!text.trim()) return;

      const hash = generateParagraphHash(text);
      const thread = store.threads.find((t) => t.paragraphHash === hash);
      
      let badge = element.querySelector('.sidethead-anchor-badge') as HTMLElement;
      const messages = thread ? (store.threadMessages[thread.id] || []) : [];

      if (thread && messages.length > 0) {
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'sidethead-anchor-badge';
          badge.addEventListener('click', (e) => {
            e.stopPropagation();
            store.setActiveThreadId(thread.id);
            store.updateSettings({ sidebarOpen: true });
          });
          element.appendChild(badge);
        }
        badge.innerHTML = ` 💬 <small>${messages.length}</small>`;
      } else {
        if (badge) {
          badge.remove();
        }
      }
    });
  });
}

// Periodically update anchors
setInterval(updateVisualAnchors, 1000);

// Keyboard Shortcuts (Alt+Shift+A)
document.addEventListener('keydown', (e) => {
  if (e.altKey && e.shiftKey && e.key.toUpperCase() === 'A') {
    e.preventDefault();
    const selection = window.getSelection();
    const selectedText = selection ? selection.toString().trim() : '';

    if (selectedText) {
      const anchorNode = selection?.anchorNode?.parentElement;
      const targetElement = anchorNode?.closest('div.markdown.prose p, div.markdown.prose h1, div.markdown.prose h2, div.markdown.prose h3, div.markdown.prose li, div.markdown.prose pre, div.markdown.prose table, div.markdown.prose blockquote') as HTMLElement;
      
      if (targetElement) {
        // If there's an active thread, nest it, otherwise create root thread
        const store = useStore.getState();
        openThreadForElement(targetElement, store.activeThreadId);
      } else {
        const store = useStore.getState();
        store.updateSettings({ sidebarOpen: !store.settings.sidebarOpen });
      }
    } else {
      const store = useStore.getState();
      store.updateSettings({ sidebarOpen: !store.settings.sidebarOpen });
    }
  }
});

// ----------------------------------------------------
// Response Routing & Streaming Response Observer
// ----------------------------------------------------

let chatObserver: MutationObserver | null = null;
let lastStreamingText = '';
let lastStreamingThreadId: string | null = null;

// Walks back through the DOM to find the preceding user message tag
function findThreadIdForResponse(assistantProse: HTMLElement): string | null {
  let turn = assistantProse.closest('[data-testid^="conversation-turn"]');
  if (turn) {
    // Check same turn
    let text = turn.textContent || '';
    let match = text.match(/\[SIDETHREAD_ID:(thread_[a-zA-Z0-9_-]+)\]/);
    if (match) return match[1];

    // Check preceding sibling turns
    let prevTurn = turn.previousElementSibling;
    while (prevTurn) {
      let prevText = prevTurn.textContent || '';
      let match = prevText.match(/\[SIDETHREAD_ID:(thread_[a-zA-Z0-9_-]+)\]/);
      if (match) return match[1];
      
      // Stop if we hit another assistant turn
      if (prevTurn.querySelector('div.markdown.prose')) {
        break;
      }
      prevTurn = prevTurn.previousElementSibling;
    }
  } else {
    // Fallback walker
    let current: Node | null = assistantProse;
    while (current) {
      if (current.previousSibling) {
        current = current.previousSibling;
        if (current instanceof HTMLElement) {
          const text = current.textContent || '';
          const match = text.match(/\[SIDETHREAD_ID:(thread_[a-zA-Z0-9_-]+)\]/);
          if (match) return match[1];
        }
      } else {
        current = current.parentNode;
      }
    }
  }
  return null;
}

function findAssistantProseForThread(threadId: string): HTMLElement | null {
  const markdownContainers = Array.from(document.querySelectorAll('div.markdown.prose')) as HTMLElement[];
  for (const prose of markdownContainers) {
    if (findThreadIdForResponse(prose) === threadId) {
      return prose;
    }
  }
  return null;
}

// Scrapes and dynamically hides SIDETHREAD_ID markers from standard page display, ignoring input areas and sidebars
function hideThreadIdMarkersInPage() {
  const targets = Array.from(document.querySelectorAll('[data-testid^="conversation-turn"], div.markdown.prose, .conversation-turn')) as HTMLElement[];
  
  targets.forEach((target) => {
    if (
      target.closest('#chatgpt-threads-sidebar-root') || 
      target.querySelector('#prompt-textarea') || 
      target.id === 'prompt-textarea'
    ) {
      return;
    }

    const walker = document.createTreeWalker(target, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        const parent = node.parentNode as HTMLElement;
        if (parent && (
          parent.nodeName === 'STYLE' || 
          parent.nodeName === 'SCRIPT' || 
          parent.id === 'prompt-textarea' ||
          parent.closest('#prompt-textarea') ||
          parent.classList.contains('sidethread-hidden-marker')
        )) {
          return NodeFilter.FILTER_REJECT;
        }
        return node.textContent?.includes('[SIDETHREAD_ID:') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
      }
    });
    
    const nodesToWrap: Text[] = [];
    while (walker.nextNode()) {
      nodesToWrap.push(walker.currentNode as Text);
    }
    
    nodesToWrap.forEach((textNode) => {
      const parent = textNode.parentNode;
      if (!parent) return;
      
      const content = textNode.textContent || '';
      const regex = /\[SIDETHREAD_ID:(thread_[a-zA-Z0-9_-]+)\]/g;
      
      if (regex.test(content)) {
        const newHtml = content.replace(regex, (match) => {
          return `<span class="sidethread-hidden-marker" style="display:none; font-size:0px; opacity:0; width:0; height:0;">${match}</span>`;
        });
        
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = newHtml;
        
        while (tempDiv.firstChild) {
          parent.insertBefore(tempDiv.firstChild, textNode);
        }
        parent.removeChild(textNode);
      }
    });
  });
}

function startChatObserver() {
  if (chatObserver) return;
  console.log('SideThread: Starting chat mutation observer...');
  
  chatObserver = new MutationObserver(() => {
    // Disconnect temporarily to prevent recursive trigger loops from DOM changes
    chatObserver?.disconnect();
    
    try {
      const store = useStore.getState();
      
      // Hide markers immediately when DOM changes
      hideThreadIdMarkersInPage();
      
      // Locate streaming response
      const streamingEl = document.querySelector('.result-streaming') 
        || document.querySelector('.result-streaming-indicator')
        || document.querySelector('.result-streaming div.markdown.prose')
        || document.querySelector('div.markdown.prose.result-streaming');
         
      if (streamingEl) {
        const proseEl = streamingEl.closest('.markdown.prose') as HTMLElement 
          || streamingEl.querySelector('.markdown.prose') as HTMLElement
          || streamingEl.closest('[data-testid^="conversation-turn"]')?.querySelector('.markdown.prose') as HTMLElement;
        
        if (proseEl) {
          const threadId = findThreadIdForResponse(proseEl);
          if (threadId) {
            // Extract text and strip any repeated marker
            let rawText = proseEl.innerText || proseEl.textContent || '';
            const cleanText = rawText.replace(/\[SIDETHREAD_ID:(thread_[a-zA-Z0-9_-]+)\]/g, '').trim();
            
            if (cleanText && cleanText !== lastStreamingText) {
              console.log(`SideThread Observer: Streaming update for thread ${threadId} (len: ${cleanText.length})`);
              lastStreamingText = cleanText;
              lastStreamingThreadId = threadId;
              
              if (!store.isWaitingForResponse || store.activeGeneratingThreadId !== threadId) {
                store.setWaitingForResponse(true, threadId);
              }
              
              store.updateLastMessage(threadId, cleanText);

              // Broadcast streaming token update to other contexts (like Chrome Side Panel)
              if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
                chrome.runtime.sendMessage({
                  type: 'STREAMING_UPDATE',
                  threadId,
                  content: cleanText,
                  isWaiting: true
                }).catch(() => {});
              }
            }
          }
        }
      } else {
        // Done streaming - check final state
        if (lastStreamingThreadId) {
          const threadId = lastStreamingThreadId;
          console.log(`SideThread Observer: Streaming completed for thread ${threadId}`);
          const proseEl = findAssistantProseForThread(threadId);
          let cleanFinal = '';
          if (proseEl) {
            let finalRaw = proseEl.innerText || proseEl.textContent || '';
            cleanFinal = finalRaw.replace(/\[SIDETHREAD_ID:(thread_[a-zA-Z0-9_-]+)\]/g, '').trim();
            store.updateLastMessage(threadId, cleanFinal);
          }
          store.setWaitingForResponse(false, null);

          // Broadcast streaming completed state and trigger threads reload
          if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
            console.log('SideThread Observer: Broadcasting final state update and THREADS_MUTATED');
            chrome.runtime.sendMessage({
              type: 'STREAMING_UPDATE',
              threadId,
              content: cleanFinal || lastStreamingText,
              isWaiting: false
            }).catch(() => {});
            chrome.runtime.sendMessage({ type: 'THREADS_MUTATED' }).catch(() => {});
          }

          lastStreamingText = '';
          lastStreamingThreadId = null;
        }
      }
    } finally {
      // Reconnect observer to document body
      if (chatObserver) {
        chatObserver.observe(document.body, {
          childList: true,
          subtree: true,
          characterData: true
        });
      }
    }
  });
  
  chatObserver.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true
  });
}

// Subscribe to store changes to automatically update layout and styles on settings changes
useStore.subscribe((state, prevState) => {
  if (
    state.settings.sidebarOpen !== prevState.settings.sidebarOpen ||
    state.settings.sidebarWidth !== prevState.settings.sidebarWidth ||
    state.settings.layoutMode !== prevState.settings.layoutMode
  ) {
    updatePageLayout(state.settings.sidebarOpen, state.settings.sidebarWidth, state.settings.layoutMode);
    updateSidebarStyle(state.settings.sidebarOpen, state.settings.sidebarWidth, state.settings.layoutMode);
  }
});

// Initialize Extension on DOMContentLoaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    initSidebar();
    startChatObserver();
    // Load initial settings which will automatically trigger the subscription layout updates
    useStore.getState().loadSettings();
  });
} else {
  initSidebar();
  startChatObserver();
  // Load initial settings which will automatically trigger the subscription layout updates
  useStore.getState().loadSettings();
}
