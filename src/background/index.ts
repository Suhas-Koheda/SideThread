// Background Service Worker

function isSupportedUrl(url: string | undefined): boolean {
  if (!url) return false;
  const lowerUrl = url.toLowerCase();
  return (
    lowerUrl.includes('chatgpt.com') ||
    lowerUrl.includes('chat.openai.com') ||
    lowerUrl.includes('deepseek.com') ||
    lowerUrl.includes('claude.ai') ||
    lowerUrl.includes('gemini.google.com')
  );
}

// When the extension action icon is clicked, toggle the sidebar on the active tab
chrome.action.onClicked.addListener((tab) => {
  if (tab.id && isSupportedUrl(tab.url)) {
    chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_SIDEBAR' });
    console.log('SideThread: Dispatched TOGGLE_SIDEBAR on click to tab:', tab.id);
  } else {
    console.log('SideThread: Extension clicked on unsupported URL:', tab.url);
  }
});

// Listen for keyboard commands (Alt+Shift+A) registered in manifest.json
chrome.commands.onCommand.addListener((command) => {
  if (command === 'open_discussion') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const activeTab = tabs[0];
      if (activeTab?.id && isSupportedUrl(activeTab.url)) {
        chrome.tabs.sendMessage(activeTab.id, { type: 'TOGGLE_SIDEBAR' });
        console.log('SideThread: Dispatched TOGGLE_SIDEBAR via command to tab:', activeTab.id);
      }
    });
  }
});

import { ThreadDB } from '../services/db';

// Handle DB requests proxied from content scripts (origins like chatgpt.com)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'DB_REQUEST') {
    const { method, args } = message;
    
    const dbMethod = (ThreadDB as any)[method];
    if (typeof dbMethod === 'function') {
      dbMethod.apply(ThreadDB, args)
        .then((result: any) => {
          sendResponse({ success: true, result });
        })
        .catch((error: any) => {
          console.error(`SideThread Background DB: Method '${method}' failed:`, error);
          sendResponse({ success: false, error: String(error) });
        });
    } else {
      console.error(`SideThread Background DB: Method '${method}' not found.`);
      sendResponse({ success: false, error: `Method '${method}' not found on ThreadDB` });
    }
    return true; // Keep message channel open for async response
  }
});

// Configure side panel behavior if the sidePanel API is used
if (typeof (chrome as any).sidePanel?.setPanelBehavior === 'function') {
  chrome.runtime.onInstalled.addListener(() => {
    (chrome as any).sidePanel.setPanelBehavior({ openPanelOnActionClick: false })
      .catch((err: any) => console.warn('Could not set sidePanel behavior:', err));
  });
}

console.log('ChatGPT Threads background worker loaded.');
