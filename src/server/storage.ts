// src/server/storage.ts
import { RefStateStorage } from './types';

/**
 * In-memory storage implementation
 */
export class MemoryStorage implements RefStateStorage {
  private storage: Map<string, any>;
  private timers: Map<string, NodeJS.Timeout>;
  
  constructor() {
    this.storage = new Map();
    this.timers = new Map();
  }
  
  async set(id: string, data: any, expireIn: number): Promise<void> {
    this.storage.set(id, {
      ...data,
      expiresAt: Date.now() + expireIn
    });
    
    // Clear existing timer if any
    if (this.timers.has(id)) {
      clearTimeout(this.timers.get(id)!);
    }
    
    // Set expiration timer
    const timer = setTimeout(() => {
      this.delete(id);
    }, expireIn);
    
    this.timers.set(id, timer);
  }
  
  async get(id: string): Promise<any | null> {
    const data = this.storage.get(id);
    if (!data) return null;
    
    // Check if expired
    if (data.expiresAt < Date.now()) {
      this.delete(id);
      return null;
    }
    
    return data;
  }
  
  async delete(id: string): Promise<void> {
    this.storage.delete(id);
    
    if (this.timers.has(id)) {
      clearTimeout(this.timers.get(id)!);
      this.timers.delete(id);
    }
  }
  
  async has(id: string): Promise<boolean> {
    return this.storage.has(id);
  }
}
