import type { Thread, ThreadMessage, AppPreferences } from '../types';

const DB_NAME = 'SideThreadAI_DB';
const DB_VERSION = 2;
const THREADS_STORE = 'threads';
const MESSAGES_STORE = 'messages';
const PREFS_STORE = 'preferences';

export class ThreadDB {
  private static db: IDBDatabase | null = null;

  static init(): Promise<IDBDatabase> {
    if (this.db) return Promise.resolve(this.db);

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('IndexedDB open failed:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve(request.result);
      };

      request.onupgradeneeded = (event) => {
        const db = request.result;
        
        // Create Threads Store
        if (!db.objectStoreNames.contains(THREADS_STORE)) {
          const threadStore = db.createObjectStore(THREADS_STORE, { keyPath: 'id' });
          threadStore.createIndex('chatId', 'chatId', { unique: false });
          threadStore.createIndex('parentId', 'parentId', { unique: false });
        } else {
          // If upgrading from v1, make sure indexes exist
          const transaction = (event.target as IDBOpenDBRequest).transaction;
          if (transaction) {
            const threadStore = transaction.objectStore(THREADS_STORE);
            if (!threadStore.indexNames.contains('chatId')) {
              threadStore.createIndex('chatId', 'chatId', { unique: false });
            }
            if (!threadStore.indexNames.contains('parentId')) {
              threadStore.createIndex('parentId', 'parentId', { unique: false });
            }
          }
        }

        // Create Messages Store
        if (!db.objectStoreNames.contains(MESSAGES_STORE)) {
          const messageStore = db.createObjectStore(MESSAGES_STORE, { keyPath: 'id' });
          messageStore.createIndex('threadId', 'threadId', { unique: false });
        }

        // Create Preferences Store
        if (!db.objectStoreNames.contains(PREFS_STORE)) {
          db.createObjectStore(PREFS_STORE);
        }
      };
    });
  }

  // Threads Operations
  static async getAllThreads(): Promise<Thread[]> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(THREADS_STORE, 'readonly');
      const store = transaction.objectStore(THREADS_STORE);
      const request = store.getAll();

      request.onsuccess = () => {
        const threads = request.result as Thread[];
        // Sort by updatedAt descending
        threads.sort((a, b) => b.updatedAt - a.updatedAt);
        resolve(threads);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  static async getThread(id: string): Promise<Thread | undefined> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(THREADS_STORE, 'readonly');
      const store = transaction.objectStore(THREADS_STORE);
      const request = store.get(id);

      request.onsuccess = () => {
        resolve(request.result as Thread | undefined);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  static async saveThread(thread: Thread): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(THREADS_STORE, 'readwrite');
      const store = transaction.objectStore(THREADS_STORE);
      const request = store.put(thread);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  static async deleteThread(id: string): Promise<void> {
    const db = await this.init();
    
    // Delete thread
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(THREADS_STORE, 'readwrite');
      const store = transaction.objectStore(THREADS_STORE);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    // Also delete all related messages
    const messages = await this.getMessages(id);
    const deletePromises = messages.map(msg => this.deleteMessage(msg.id));
    await Promise.all(deletePromises);

    // Also update any child threads to disconnect them (or delete them)
    const allThreads = await this.getAllThreads();
    const children = allThreads.filter(t => t.parentId === id);
    for (const child of children) {
      await this.saveThread({
        ...child,
        parentId: null,
        updatedAt: Date.now()
      });
    }
  }

  // Messages Operations
  static async getMessages(threadId: string): Promise<ThreadMessage[]> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(MESSAGES_STORE, 'readonly');
      const store = transaction.objectStore(MESSAGES_STORE);
      const index = store.index('threadId');
      const request = index.getAll(threadId);

      request.onsuccess = () => {
        const msgs = request.result as ThreadMessage[];
        // Sort by timestamp ascending
        msgs.sort((a, b) => a.timestamp - b.timestamp);
        resolve(msgs);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  static async saveMessage(message: ThreadMessage): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(MESSAGES_STORE, 'readwrite');
      const store = transaction.objectStore(MESSAGES_STORE);
      const request = store.put(message);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  static async deleteMessage(id: string): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(MESSAGES_STORE, 'readwrite');
      const store = transaction.objectStore(MESSAGES_STORE);
      const request = store.delete(id);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  // Preferences Operations
  static async getPreference<K extends keyof AppPreferences>(key: K): Promise<AppPreferences[K] | undefined> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(PREFS_STORE, 'readonly');
      const store = transaction.objectStore(PREFS_STORE);
      const request = store.get(key);

      request.onsuccess = () => {
        resolve(request.result as AppPreferences[K] | undefined);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  static async savePreference<K extends keyof AppPreferences>(key: K, value: AppPreferences[K]): Promise<void> {
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(PREFS_STORE, 'readwrite');
      const store = transaction.objectStore(PREFS_STORE);
      const request = store.put(value, key);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }
}
