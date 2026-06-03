/**
 * Simulates typing and submitting a prompt to the ChatGPT main chat window.
 * Detects context (Content Script vs Extension SidePanel Page) and handles it appropriately.
 */
export function submitPromptToChatGPT(prompt: string) {
  const inputEl = document.getElementById('prompt-textarea');
  
  if (inputEl) {
    // Content Script Context: Modify ChatGPT DOM directly
    inputEl.focus();
    
    // Clear any existing content to prevent prefixing issues
    if (inputEl.tagName === 'TEXTAREA') {
      const textarea = inputEl as HTMLTextAreaElement;
      textarea.value = '';
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      inputEl.innerHTML = '';
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    }

    // Try executing execCommand first (industry standard for React text injection)
    try {
      document.execCommand('insertText', false, prompt);
    } catch (e) {
      console.warn('execCommand failed, falling back to descriptor setters', e);
      if (inputEl.tagName === 'TEXTAREA') {
        const textarea = inputEl as HTMLTextAreaElement;
        const valueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
        if (valueSetter) {
          valueSetter.call(textarea, prompt);
        } else {
          textarea.value = prompt;
        }
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
      } else {
        inputEl.textContent = prompt;
        inputEl.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }

    // Fire standard input/change events to bubble up
    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    inputEl.dispatchEvent(new Event('change', { bubbles: true }));

    // Small delay to allow React state updates to cycle and enable the submit button
    setTimeout(() => {
      const sendButton = (
        document.querySelector('button[data-testid="send-button"]') ||
        document.querySelector('button[data-testid="composer-send-button"]') ||
        document.querySelector('button[aria-label="Send prompt"]') ||
        inputEl.parentElement?.querySelector('button')
      ) as HTMLButtonElement | null;

      if (sendButton && !sendButton.disabled) {
        sendButton.click();
        console.log('SideThread: Clicked send button in ChatGPT');
      } else {
        const enterKey = new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true
        });
        inputEl.dispatchEvent(enterKey);
        console.log('SideThread: Dispatched Enter key event in ChatGPT');
      }
    }, 150);
  } else {
    // SidePanel / Extension Context: Message the active tab content script
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs[0];
        if (activeTab?.id) {
          chrome.tabs.sendMessage(activeTab.id, {
            type: 'INJECT_AND_SUBMIT',
            prompt,
          }, (response) => {
            if (chrome.runtime.lastError) {
              console.warn('Could not communicate with page content script. Make sure ChatGPT is active.');
            }
          });
        }
      });
    }
  }
}
