import { 
  RequestRecord, 
  SessionMetadata, 
  FilterOptions, 
  RecordingState
} from '../types';

export class StorageManager {
  private dbName = 'APIRecorderDB';
  private dbVersion = 1;
  private db?: IDBDatabase;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // 创建请求记录存储
        if (!db.objectStoreNames.contains('records')) {
          const recordStore = db.createObjectStore('records', { keyPath: 'id' });
          recordStore.createIndex('timestamp', 'timestamp', { unique: false });
          recordStore.createIndex('method', 'method', { unique: false });
          recordStore.createIndex('url', 'url', { unique: false });
          recordStore.createIndex('sessionId', 'sessionId', { unique: false });
        }

        // 创建会话元数据存储
        if (!db.objectStoreNames.contains('sessions')) {
          db.createObjectStore('sessions', { keyPath: 'sessionId' });
        }

        // 创建配置存储
        if (!db.objectStoreNames.contains('config')) {
          db.createObjectStore('config', { keyPath: 'key' });
        }

        // 创建临时请求存储
        if (!db.objectStoreNames.contains('pending')) {
          db.createObjectStore('pending', { keyPath: 'requestId' });
        }
      };
    });
  }

  private async ensureDB(): Promise<IDBDatabase> {
    if (!this.db) {
      await this.init();
    }
    return this.db!;
  }

  async saveRecord(record: RequestRecord): Promise<void> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['records'], 'readwrite');
      const store = transaction.objectStore('records');
      const request = store.add(record);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async getAllRecords(): Promise<RequestRecord[]> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['records'], 'readonly');
      const store = transaction.objectStore('records');
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async getRecordsBySession(sessionId: string): Promise<RequestRecord[]> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['records'], 'readonly');
      const store = transaction.objectStore('records');
      const index = store.index('sessionId');
      const request = index.getAll(sessionId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async clearAllRecords(): Promise<void> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['records'], 'readwrite');
      const store = transaction.objectStore('records');
      const request = store.clear();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async saveSessionMetadata(metadata: SessionMetadata): Promise<void> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['sessions'], 'readwrite');
      const store = transaction.objectStore('sessions');
      const request = store.put(metadata);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async getSessionMetadata(sessionId: string): Promise<SessionMetadata | null> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['sessions'], 'readonly');
      const store = transaction.objectStore('sessions');
      const request = store.get(sessionId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result || null);
    });
  }

  async saveRecordingState(state: RecordingState): Promise<void> {
    return this.saveConfigInternal('recordingState', state);
  }

  async getRecordingState(): Promise<RecordingState | null> {
    return this.getConfigInternal('recordingState');
  }

  async saveFilterOptions(options: FilterOptions): Promise<void> {
    return this.saveConfigInternal('filterOptions', options);
  }

  async getFilterOptions(): Promise<FilterOptions | null> {
    return this.getConfigInternal('filterOptions');
  }

  private async saveConfigInternal(key: string, value: any): Promise<void> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['config'], 'readwrite');
      const store = transaction.objectStore('config');
      const request = store.put({ key, value });

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  private async getConfigInternal(key: string): Promise<any> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['config'], 'readonly');
      const store = transaction.objectStore('config');
      const request = store.get(key);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result?.value || null);
    });
  }

  // 公开getConfig方法供外部使用
  async getConfig(key: string): Promise<any> {
    return this.getConfigInternal(key);
  }

  // 公开saveConfig方法供外部使用
  async saveConfig(key: string, value: any): Promise<void> {
    return this.saveConfigInternal(key, value);
  }

  // 临时请求管理
  async savePendingRequest(data: any): Promise<void> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['pending'], 'readwrite');
      const store = transaction.objectStore('pending');
      const request = store.put({ requestId: data.id, ...data });

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  async getPendingRequest(requestId: string): Promise<any> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['pending'], 'readonly');
      const store = transaction.objectStore('pending');
      const request = store.get(requestId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  }

  async updatePendingRequest(requestId: string, updates: any): Promise<void> {
    const existing = await this.getPendingRequest(requestId);
    if (existing) {
      const updated = { ...existing, ...updates };
      await this.savePendingRequest(updated);
    }
  }

  async removePendingRequest(requestId: string): Promise<void> {
    const db = await this.ensureDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['pending'], 'readwrite');
      const store = transaction.objectStore('pending');
      const request = store.delete(requestId);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  // 数据清理
  async cleanupOldData(retentionDays: number = 7): Promise<void> {
    const cutoffTime = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
    const db = await this.ensureDB();

    return new Promise((resolve, reject) => {
      const transaction = db.transaction(['records'], 'readwrite');
      const store = transaction.objectStore('records');
      const index = store.index('timestamp');
      const range = IDBKeyRange.upperBound(cutoffTime);
      const request = index.openCursor(range);

      request.onerror = () => reject(request.error);
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };
    });
  }
}