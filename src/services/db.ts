import type { Thread, ThreadMessage, AppPreferences } from '../types';

const DB_NAME = 'SideThreadAI_DB';
const DB_VERSION = 2;
const THREADS_STORE = 'threads';
const MESSAGES_STORE = 'messages';
const PREFS_STORE = 'preferences';

const isContentScript = typeof window !== 'undefined' && window.location.protocol !== 'chrome-extension:';

export class ThreadDB {
  private static db: IDBDatabase | null = null;

  private static sendDbRequest(method: string, ...args: any[]): Promise<any> {
    return new Promise((resolve, reject) => {
      if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
        reject(new Error('Chrome extension runtime not available'));
        return;
      }
      
      console.log(`SideThread DB Proxy: Sending DB_REQUEST for '${method}'`);
      chrome.runtime.sendMessage({
        type: 'DB_REQUEST',
        method,
        args
      }, (response) => {
        if (chrome.runtime.lastError) {
          console.error(`SideThread DB Proxy error on '${method}':`, chrome.runtime.lastError);
          reject(chrome.runtime.lastError);
        } else if (response && response.success) {
          resolve(response.result);
        } else {
          console.error(`SideThread DB Proxy failed on '${method}':`, response?.error);
          reject(new Error(response?.error || 'Unknown DB proxy error'));
        }
      });
    });
  }

  static init(): Promise<IDBDatabase> {
    if (this.db) return Promise.resolve(this.db);

    console.log('SideThread DB: Initializing IndexedDB directly...');
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        console.error('SideThread DB: IndexedDB open failed:', request.error);
        reject(request.error);
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('SideThread DB: IndexedDB opened successfully.');
        resolve(request.result);
      };

      request.onupgradeneeded = (event) => {
        const db = request.result;
        console.log('SideThread DB: Upgrading database to version', DB_VERSION);
        
        // Create Threads Store
        if (!db.objectStoreNames.contains(THREADS_STORE)) {
          const threadStore = db.createObjectStore(THREADS_STORE, { keyPath: 'id' });
          threadStore.createIndex('chatId', 'chatId', { unique: false });
          threadStore.createIndex('parentId', 'parentId', { unique: false });
          console.log('SideThread DB: Created threads object store.');
        } else {
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
          console.log('SideThread DB: Created messages object store.');
        }

        // Create Preferences Store
        if (!db.objectStoreNames.contains(PREFS_STORE)) {
          db.createObjectStore(PREFS_STORE);
          console.log('SideThread DB: Created preferences object store.');
        }
      };
    });
  }

  // Threads Operations
  static async getAllThreads(): Promise<Thread[]> {
    if (isContentScript) {
      return this.sendDbRequest('getAllThreads');
    }

    console.log('SideThread DB: Fetching all threads from IndexedDB');
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(THREADS_STORE, 'readonly');
      const store = transaction.objectStore(THREADS_STORE);
      const request = store.getAll();

      request.onsuccess = () => {
        const threads = request.result as Thread[];
        threads.sort((a, b) => b.updatedAt - a.updatedAt);
        resolve(threads);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  static async getThread(id: string): Promise<Thread | undefined> {
    if (isContentScript) {
      return this.sendDbRequest('getThread', id);
    }

    console.log(`SideThread DB: Fetching thread ${id} from IndexedDB`);
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
    if (isContentScript) {
      return this.sendDbRequest('saveThread', thread);
    }

    console.log(`SideThread DB: Saving thread ${thread.id} to IndexedDB`);
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
    if (isContentScript) {
      return this.sendDbRequest('deleteThread', id);
    }

    console.log(`SideThread DB: Deleting thread ${id} from IndexedDB`);
    const db = await this.init();
    
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(THREADS_STORE, 'readwrite');
      const store = transaction.objectStore(THREADS_STORE);
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });

    const messages = await this.getMessages(id);
    const deletePromises = messages.map(msg => this.deleteMessage(msg.id));
    await Promise.all(deletePromises);

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
    if (isContentScript) {
      return this.sendDbRequest('getMessages', threadId);
    }

    console.log(`SideThread DB: Fetching messages for thread ${threadId} from IndexedDB`);
    const db = await this.init();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(MESSAGES_STORE, 'readonly');
      const store = transaction.objectStore(MESSAGES_STORE);
      const index = store.index('threadId');
      const request = index.getAll(threadId);

      request.onsuccess = () => {
        const msgs = request.result as ThreadMessage[];
        msgs.sort((a, b) => a.timestamp - b.timestamp);
        resolve(msgs);
      };

      request.onerror = () => {
        reject(request.error);
      };
    });
  }

  static async saveMessage(message: ThreadMessage): Promise<void> {
    if (isContentScript) {
      return this.sendDbRequest('saveMessage', message);
    }

    console.log(`SideThread DB: Saving message ${message.id} to IndexedDB`);
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
    if (isContentScript) {
      return this.sendDbRequest('deleteMessage', id);
    }

    console.log(`SideThread DB: Deleting message ${id} from IndexedDB`);
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
    if (isContentScript) {
      return this.sendDbRequest('getPreference', key);
    }

    console.log(`SideThread DB: Fetching preference '${key}'`);
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
    if (isContentScript) {
      return this.sendDbRequest('savePreference', key, value);
    }

    console.log(`SideThread DB: Saving preference '${key}'`);
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
