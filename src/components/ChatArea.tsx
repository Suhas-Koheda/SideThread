import React, { useState, useRef, useEffect } from 'react';
import { ArrowLeft, Send, Sparkles, FileDown, ChevronDown, ChevronUp, Copy, Check, GitFork } from 'lucide-react';
import { useStore } from '../store/useStore';
import type { ThreadMessage, Thread } from '../types';

import { submitPromptToChatGPT } from '../content/actions';

export const ChatArea: React.FC = () => {
  const {
    activeThreadId,
    threads,
    threadMessages,
    settings,
    addMessage,
    setActiveThreadId,
    setWaitingForResponse,
    isWaitingForResponse,
    activeGeneratingThreadId,
  } = useStore();

  const thread = threads.find((t) => t.id === activeThreadId);
  const messages = thread ? (threadMessages[thread.id] || []) : [];
  const [inputText, setInputText] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showContext, setShowContext] = useState(true);
  const [selectionText, setSelectionText] = useState('');

  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = window.getSelection();
      setSelectionText(selection ? selection.toString().trim() : '');
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, []);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isWaitingForResponse]);

  if (!thread) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-slate-500 p-4">
        <p className="text-xs">Thread not found or has been deleted.</p>
        <button
          onClick={() => setActiveThreadId(null)}
          className="mt-3 text-xs font-bold text-brand-600 hover:underline flex items-center gap-1"
        >
          <ArrowLeft className="w-3.5 h-3.5" /> Back to list
        </button>
      </div>
    );
  }

  const formatHistory = (history: ThreadMessage[]) => {
    if (history.length === 0) return '';
    return `[Previous Thread Discussion]:\n` + history
      .map((msg) => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
      .join('\n\n') + '\n\n';
  };

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!inputText.trim() || isWaitingForResponse) return;

    const userQuery = inputText.trim();
    console.log('SideThread ChatArea: Initiating message submission...', {
      threadId: thread.id,
      userQuery,
    });
    setInputText('');

    // 1. Add user message locally
    await addMessage(thread.id, 'user', userQuery);

    // 2. Format injection prompt using the template
    const currentMsgs = threadMessages[thread.id] || [];
    const historyText = formatHistory(currentMsgs);
    let prompt = settings.promptTemplate
      .replace('{threadId}', thread.id)
      .replace('{selectedText}', thread.selectedText)
      .replace('{history}', historyText)
      .replace('{message}', userQuery);

    console.log('SideThread ChatArea: Constructed prompt for injection:', prompt);

    // 3. Mark state as waiting for reply
    setWaitingForResponse(true, thread.id);

    // 4. Inject prompt and submit in ChatGPT main page
    try {
      console.log('SideThread ChatArea: Submitting prompt to host editor...');
      submitPromptToChatGPT(prompt);
      console.log('SideThread ChatArea: Prompt submission triggered.');
    } catch (err) {
      console.error('SideThread ChatArea: Failed to submit prompt to ChatGPT:', err);
      setWaitingForResponse(false, null);
      alert('Could not submit prompt. Please make sure ChatGPT is loaded and responsive.');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const exportToMarkdown = () => {
    let md = `# ChatGPT Thread: ${thread.title}\n\n`;
    md += `- **Date Created:** ${new Date(thread.createdAt).toLocaleString()}\n`;
    md += `- **Thread ID:** ${thread.id}\n\n`;
    
    md += `## Selected Context Paragraph\n`;
    md += `> ${thread.selectedText}\n\n`;
    
    md += `## Discussion History\n\n`;
    messages.forEach((msg) => {
      md += `### ${msg.role === 'user' ? 'User' : 'ChatGPT Response'} (${new Date(msg.timestamp).toLocaleTimeString()})\n`;
      md += `${msg.content}\n\n`;
    });

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${thread.title.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_thread.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const renderMessageContent = (content: string, id: string) => {
    const blocks = content.split(/(```[\s\S]*?```)/g);
    
    return blocks.map((block, idx) => {
      if (block.startsWith('```')) {
        const match = block.match(/```(\w*)\n([\s\S]*?)```/);
        const lang = match ? match[1] : '';
        const code = match ? match[2] : block.slice(3, -3);
        
        return (
          <div key={idx} className="my-2 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 text-[10px] font-mono shadow-sm bg-slate-900 text-slate-100 max-w-full">
            <div className="flex items-center justify-between px-3 py-1.5 bg-slate-950 text-slate-400 border-b border-slate-800">
              <span className="text-[9px] uppercase tracking-wider font-semibold">{lang || 'code'}</span>
              <button
                onClick={() => copyToClipboard(code, `${id}_code_${idx}`)}
                className="hover:text-white transition-colors p-0.5 rounded"
              >
                {copiedId === `${id}_code_${idx}` ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              </button>
            </div>
            <pre className="p-3 overflow-x-auto whitespace-pre no-scrollbar"><code>{code.trim()}</code></pre>
          </div>
        );
      }

      let html = block;
      const safeHtml = html
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

      const parsed = safeHtml
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/`(.*?)`/g, '<code class="bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded font-mono text-[10px] text-brand-600 dark:text-brand-400">$1</code>')
        .replace(/\n/g, '<br/>');

      return (
        <span
          key={idx}
          dangerouslySetInnerHTML={{ __html: parsed }}
          className="text-xs leading-relaxed break-words"
        />
      );
    });
  };

  const isCurrentThreadGenerating = isWaitingForResponse && activeGeneratingThreadId === thread.id;

  return (
    <div className="flex flex-col h-full flex-1 min-w-0 bg-slate-50 dark:bg-slate-950">
      {/* Thread Header */}
      <div className="px-4 py-3 border-b border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900/60 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={() => setActiveThreadId(null)}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0">
            <h2 className="font-bold text-xs text-slate-800 dark:text-slate-200 truncate">
              {thread.title}
            </h2>
            <div className="flex items-center gap-1 text-[9px] font-semibold text-brand-600 dark:text-brand-400 uppercase tracking-wider">
              <span>{isCurrentThreadGenerating ? 'Generating response...' : 'Virtual Thread'}</span>
              {thread.parentId && (
                <span className="flex items-center gap-0.5 text-slate-400 lowercase">
                  <GitFork className="w-2.5 h-2.5 rotate-180" /> child
                </span>
              )}
            </div>
          </div>
        </div>

        <button
          onClick={exportToMarkdown}
          className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100 transition-colors flex-shrink-0"
          title="Export Markdown"
        >
          <FileDown className="w-4 h-4" />
        </button>
      </div>

      {/* Selected paragraph snippet */}
      <div className="border-b border-slate-200/60 dark:border-slate-800/60 bg-white dark:bg-slate-900/30 flex-shrink-0">
        <button
          onClick={() => setShowContext(!showContext)}
          className="w-full px-4 py-2 flex items-center justify-between text-[11px] font-bold text-slate-500 dark:text-slate-400 hover:bg-slate-50/50 dark:hover:bg-slate-800/10 transition-colors"
        >
          <span className="flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-brand-500" />
            Anchor Paragraph
          </span>
          {showContext ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>

        {showContext && (
          <div className="px-4 pb-3 space-y-2 max-h-36 overflow-y-auto no-scrollbar text-[11px] border-t border-slate-100 dark:border-slate-800/40 pt-2 animate-fadeIn">
            <p className="bg-brand-50/50 dark:bg-brand-950/20 border-l-2 border-brand-500 p-2.5 rounded-r-lg italic text-slate-800 dark:text-slate-200 font-medium">
              "{thread.selectedText}"
            </p>
          </div>
        )}
      </div>

      {/* Discussions Chat Stream */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400 dark:text-slate-500">
            <Sparkles className="w-6 h-6 text-brand-500 animate-bounce mb-2" />
            <h3 className="font-bold text-xs text-slate-700 dark:text-slate-300 font-mono">Thread Active</h3>
            <p className="text-[10px] max-w-[200px] mt-1 leading-normal">
              Type your first question below to ask ChatGPT. The context will automatically be added.
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col max-w-[85%] ${msg.role === 'user' ? 'ml-auto items-end' : 'mr-auto items-start'}`}
          >
            <span className="text-[8px] text-slate-400 font-semibold mb-1 uppercase tracking-wider px-1">
              {msg.role === 'user' ? 'You' : 'ChatGPT'}
            </span>

            <div
              className={`p-3 rounded-2xl shadow-sm border ${
                msg.role === 'user'
                  ? 'bg-gradient-to-tr from-brand-600 to-indigo-600 border-brand-500 text-white rounded-tr-none'
                  : 'bg-white border-slate-200/80 dark:bg-slate-900 dark:border-slate-800 text-slate-800 dark:text-slate-200 rounded-tl-none'
              }`}
            >
              {renderMessageContent(msg.content, msg.id)}
            </div>
            
            <span className="text-[8px] text-slate-400 mt-1 px-1">
              {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        ))}

        {/* ChatGPT Generating Response Indicator */}
        {isCurrentThreadGenerating && (
          <div className="flex flex-col mr-auto items-start max-w-[80%] animate-pulse">
            <span className="text-[8px] text-slate-400 font-semibold mb-1 uppercase tracking-wider px-1">
              ChatGPT
            </span>
            <div className="p-3 bg-white border border-slate-200/80 dark:bg-slate-900 dark:border-slate-800 text-slate-500 rounded-2xl rounded-tl-none flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-brand-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 bg-brand-500 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 bg-brand-500 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              <span className="text-[10px] font-semibold text-slate-400">Waiting for ChatGPT...</span>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Selection Quote Banner */}
      {selectionText && (
        <div className="px-4 py-2 bg-brand-50/20 dark:bg-brand-950/10 border-t border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between animate-fadeIn text-[10px] text-slate-500 dark:text-slate-400">
          <span className="truncate max-w-[75%] italic">
            Selection: "{selectionText}"
          </span>
          <button
            type="button"
            onClick={() => {
              setInputText((prev) => {
                const quote = `> ${selectionText}\n\n`;
                return prev.startsWith('>') ? `${prev}\n\n${quote}` : `${quote}${prev}`;
              });
            }}
            className="font-bold text-brand-600 hover:text-brand-700 dark:text-brand-400 dark:hover:text-brand-300 transition-colors"
          >
            Quote in Chat
          </button>
        </div>
      )}

      {/* Input Form */}
      <form
        onSubmit={handleSend}
        className="p-3 border-t border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900/60 flex items-end gap-2 flex-shrink-0"
      >
        <textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isCurrentThreadGenerating ? "Waiting for ChatGPT..." : "Type thread reply..."}
          rows={1}
          disabled={isCurrentThreadGenerating}
          className="flex-1 max-h-24 min-h-[36px] p-2 py-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all resize-none text-slate-800 dark:text-slate-100 disabled:opacity-55"
          style={{ height: 'auto' }}
        />
        <button
          type="submit"
          disabled={!inputText.trim() || isCurrentThreadGenerating}
          className="p-2.5 rounded-xl bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-700 hover:to-indigo-700 text-white shadow-md shadow-brand-500/10 active:scale-95 transition-all disabled:opacity-50 disabled:scale-100"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </form>
    </div>
  );
};
