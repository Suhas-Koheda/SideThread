import React, { useState, useEffect } from 'react';
import { Search, Trash2, FileDown, Sparkles, MessageSquare, ToggleLeft, ToggleRight, ChevronDown, ChevronRight, GitFork } from 'lucide-react';
import { useStore } from '../store/useStore';
import type { Thread } from '../types';

interface ThreadNode {
  thread: Thread;
  children: ThreadNode[];
}

export const ThreadList: React.FC = () => {
  const { 
    threads, 
    threadMessages,
    currentChatId, 
    setActiveThreadId, 
    deleteThread, 
    loadMessages,
    settings, 
    toggleCollapsedThread 
  } = useStore();
  
  const [search, setSearch] = useState('');
  const [showAllChats, setShowAllChats] = useState(false);

  // Load messages count for all threads when list is opened
  useEffect(() => {
    threads.forEach((t) => {
      if (!threadMessages[t.id]) {
        loadMessages(t.id);
      }
    });
  }, [threads]);

  // Construct hierarchy
  const buildTree = (threadList: Thread[]): ThreadNode[] => {
    const map: Record<string, ThreadNode> = {};
    const roots: ThreadNode[] = [];

    // Filter threads by scope (this chat vs all chats)
    const scopeFiltered = threadList.filter((t) => 
      showAllChats ? true : t.chatId === currentChatId
    );

    // Initialize map
    scopeFiltered.forEach((t) => {
      map[t.id] = { thread: t, children: [] };
    });

    // Link parents & children
    scopeFiltered.forEach((t) => {
      const node = map[t.id];
      if (t.parentId && map[t.parentId]) {
        map[t.parentId].children.push(node);
      } else {
        roots.push(node);
      }
    });

    return roots;
  };

  // Filter tree recursively
  const filterTree = (nodes: ThreadNode[], searchQuery: string): ThreadNode[] => {
    if (!searchQuery.trim()) return nodes;
    const q = searchQuery.toLowerCase();

    return nodes
      .map((node) => {
        const matchesSelf =
          node.thread.title.toLowerCase().includes(q) ||
          node.thread.selectedText.toLowerCase().includes(q);
        
        const filteredChildren = filterTree(node.children, searchQuery);
        
        if (matchesSelf || filteredChildren.length > 0) {
          return {
            ...node,
            children: filteredChildren,
          };
        }
        return null;
      })
      .filter((n): n is ThreadNode => n !== null);
  };

  const roots = buildTree(threads);
  const filteredRoots = filterTree(roots, search);

  const exportToMarkdown = (e: React.MouseEvent, thread: Thread) => {
    e.stopPropagation();
    const messages = threadMessages[thread.id] || [];
    let md = `# ChatGPT Thread: ${thread.title}\n\n`;
    md += `- **Date Created:** ${new Date(thread.createdAt).toLocaleString()}\n`;
    md += `- **Thread ID:** ${thread.id}\n\n`;
    
    md += `## Selected Context Paragraph\n`;
    md += `> ${thread.selectedText}\n\n`;
    
    md += `## Discussion History\n\n`;
    if (messages.length === 0) {
      md += `*No discussion recorded yet.*\n`;
    } else {
      messages.forEach((msg) => {
        md += `### ${msg.role === 'user' ? 'User' : 'ChatGPT Response'} (${new Date(msg.timestamp).toLocaleTimeString()})\n`;
        md += `${msg.content}\n\n`;
      });
    }

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${thread.title.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_thread.md`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm('Delete this discussion thread? (Child threads will be disconnected)')) {
      deleteThread(id);
    }
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  // Recursive Renderer for Tree Node
  const RenderNode: React.FC<{ node: ThreadNode; depth: number }> = ({ node, depth }) => {
    const thread = node.thread;
    const isCollapsed = settings.collapsedThreads[thread.id] || false;
    const hasChildren = node.children.length > 0;
    const messages = threadMessages[thread.id] || [];
    const messagesCount = messages.length;

    return (
      <div className="flex flex-col w-full">
        {/* Thread Item Card */}
        <div
          onClick={() => setActiveThreadId(thread.id)}
          style={{ paddingLeft: `${Math.max(12, depth * 20)}px` }}
          className="group border-b border-slate-100 dark:border-slate-805/60 bg-white dark:bg-slate-900/10 hover:bg-slate-50/80 dark:hover:bg-slate-800/30 py-3.5 pr-4 cursor-pointer transition-all duration-150 flex items-start gap-2 relative overflow-hidden"
        >
          {/* Collapse/Expand Toggle for branches */}
          {hasChildren ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                toggleCollapsedThread(thread.id);
              }}
              className="mt-0.5 p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 flex-shrink-0"
            >
              {isCollapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          ) : (
            depth > 0 && (
              <div className="w-5 h-5 flex items-center justify-center flex-shrink-0 text-slate-300 dark:text-slate-700">
                <GitFork className="w-3 h-3 rotate-180" />
              </div>
            )
          )}

          {/* Core Content */}
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[8px] font-bold text-brand-600 dark:text-brand-400 uppercase tracking-wider">
                {thread.chatId === currentChatId ? 'Active Chat' : 'Other Chat'}
              </span>
              
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => exportToMarkdown(e, thread)}
                  className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 transition-colors"
                  title="Export as Markdown"
                >
                  <FileDown className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={(e) => handleDelete(e, thread.id)}
                  className="p-1 rounded-md hover:bg-red-50 dark:hover:bg-red-950/30 text-slate-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                  title="Delete Thread"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <h3 className="font-bold text-xs text-slate-800 dark:text-slate-200 group-hover:text-brand-600 dark:group-hover:text-brand-400 transition-colors truncate">
              {thread.title}
            </h3>

            <p className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-1 border-l-2 border-slate-200 dark:border-slate-800 pl-2 py-0.5 bg-slate-50/50 dark:bg-slate-950/10 italic">
              "{thread.selectedText}"
            </p>

            <div className="flex items-center justify-between text-[9px] text-slate-400 font-medium pt-1">
              <span>{formatDate(thread.updatedAt)}</span>
              <span className="flex items-center gap-1 bg-slate-100 dark:bg-slate-850 px-2 py-0.5 rounded-full">
                <MessageSquare className="w-2.5 h-2.5" />
                {messagesCount} {messagesCount === 1 ? 'msg' : 'msgs'}
              </span>
            </div>
          </div>

          {/* Guide connection line showing nesting depth */}
          {depth > 0 && (
            <div 
              className="absolute top-0 bottom-0 border-l border-slate-200 dark:border-slate-800"
              style={{ left: `${depth * 20 - 10}px` }}
            />
          )}
        </div>

        {/* Children Render */}
        {hasChildren && !isCollapsed && (
          <div className="flex flex-col w-full relative">
            {node.children.map((child) => (
              <RenderNode key={child.thread.id} node={child} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full flex-1 min-w-0">
      {/* Search & Filters */}
      <div className="p-4 border-b border-slate-200/85 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/10 space-y-3 flex-shrink-0">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search threads or context..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all text-slate-800 dark:text-slate-100"
          />
        </div>
        
        {/* Toggle between Current Chat / All Chats */}
        <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 dark:text-slate-400">
          <span>Scope: {showAllChats ? 'All ChatGPT Chats' : 'This ChatGPT Chat'}</span>
          <button
            onClick={() => setShowAllChats(!showAllChats)}
            className="flex items-center gap-1 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
          >
            {showAllChats ? (
              <ToggleRight className="w-5 h-5 text-brand-600 dark:text-brand-400" />
            ) : (
              <ToggleLeft className="w-5 h-5 text-slate-400" />
            )}
          </button>
        </div>
      </div>

      {/* Threads Tree List */}
      <div className="flex-1 overflow-y-auto no-scrollbar bg-slate-50/20 dark:bg-slate-950/10">
        {filteredRoots.length > 0 ? (
          filteredRoots.map((root) => (
            <RenderNode key={root.thread.id} node={root} depth={0} />
          ))
        ) : (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-4">
            <div className="w-12 h-12 rounded-full bg-brand-50 dark:bg-brand-950/40 flex items-center justify-center text-brand-600 dark:text-brand-400">
              <Sparkles className="w-5 h-5 animate-pulse" />
            </div>
            <div className="max-w-[240px]">
              <h3 className="font-bold text-xs text-slate-800 dark:text-slate-200">
                {search ? 'No matches found' : 'No threads created yet'}
              </h3>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                {search ? 'Try adjusting your search keywords.' : 'To create a discussion thread:'}
              </p>
            </div>
            {!search && (
              <div className="w-full border-t border-slate-100 dark:border-slate-800/50 pt-4 max-w-[240px] text-left space-y-3">
                <div className="flex gap-2.5 text-[11px] text-slate-500 dark:text-slate-400">
                  <span className="flex-shrink-0 w-4 h-4 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[9px] font-bold">1</span>
                  <span>Hover over any paragraph/heading/codeblock in ChatGPT's responses.</span>
                </div>
                <div className="flex gap-2.5 text-[11px] text-slate-500 dark:text-slate-400">
                  <span className="flex-shrink-0 w-4 h-4 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[9px] font-bold">2</span>
                  <span>Click the small thread icon <strong className="text-brand-500">💬</strong>.</span>
                </div>
                <div className="flex gap-2.5 text-[11px] text-slate-500 dark:text-slate-400">
                  <span className="flex-shrink-0 w-4 h-4 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[9px] font-bold">3</span>
                  <span>Ask your question. The extension will automatically handle ChatGPT prompt submission and update the thread.</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
