export interface ThreadMessage {
  id: string;
  threadId: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface Thread {
  id: string;
  chatId: string;
  messageId: string; // Turn identifier (e.g. turn_0)
  paragraphHash: string; // Stable hash of paragraph text
  selectedText: string; // Text of the anchored paragraph
  title: string; // Display title of the thread
  parentId?: string | null; // For hierarchical thread tree
  createdAt: number;
  updatedAt: number;
}

export interface AppPreferences {
  theme: 'light' | 'dark' | 'system';
  sidebarWidth: number;
  sidebarOpen: boolean;
  layoutMode: 'pinned' | 'floating';
  collapsedThreads: Record<string, boolean>; // threadId -> boolean
  promptTemplate: string;
}
