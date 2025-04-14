// src/core.ts
import AES from 'crypto-js/aes';
import Utf8 from 'crypto-js/enc-utf8';
import { 
  RefStateOptions, 
  CreateRefStateOptions, 
  RefStateError, 
  RefStateErrorType,
  RefStateEventType,
  RefStateEventHandler,
  ClientRefState
} from './types';

/**
 * Default configuration for RefState
 */
const DEFAULT_OPTIONS: RefStateOptions = {
  maxClientDocs: 50,
  refKeyLength: 16,
  serverEndpoint: '/api/ref-state',
  encryptionKey: 'refstate-default-key',
  defaultExpiration: 7 * 24 * 60 * 60 * 1000, // 7 days
  debug: false
};

/**
 * RefState Manager - Core functionality for document reference state management
 */
export class RefStateManager {
  private options: RefStateOptions;
  private eventHandlers: Map<RefStateEventType, Set<RefStateEventHandler>>;
  
  /**
   * Create a new RefState manager instance
   * 
   * @param options Configuration options
   */
  constructor(options: RefStateOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.eventHandlers = new Map();
    
    // Initialize event handler collections
    Object.values(RefStateEventType).forEach(eventType => {
      this.eventHandlers.set(eventType, new Set());
    });
    
    this.log('RefState initialized with options:', this.options);
  }
  
  /**
   * Create a reference state from a list of document IDs
   * 
   * @param docIds Array of document IDs to reference
   * @param options Creation options
   * @returns Promise resolving to a reference state token
   */
  async createRefState(
    docIds: string[], 
    options: CreateRefStateOptions = {}
  ): Promise<string> {
    const { 
      serverSync = true, 
      salt = '', 
      name = '' 
    } = options;
    
    this.log('Creating reference state for', docIds.length, 'documents');
    
    // Determine if we should use server-side references
    if (serverSync && docIds.length > this.options.maxClientDocs!) {
      try {
        return await this.createServerRefState(docIds, options);
      } catch (error) {
        this.log('Server reference creation failed, falling back to client:', error);
        // Fall back to client-side as a safety measure
        return this.createClientRefState(docIds, salt, name);
      }
    }
    
    // Handle client-side for smaller collections
    return this.createClientRefState(docIds, salt, name);
  }
  
  /**
   * Create a client-side encrypted reference state
   * 
   * @param docIds Array of document IDs to reference
   * @param salt Optional salt for encryption key
   * @param name Optional name for this reference state
   * @returns Client-side reference token
   */
  private createClientRefState(docIds: string[], salt = '', name = ''): string {
    try {
      const key = this.getEncryptionKey(salt);
      const payload: ClientRefState = {
        docs: docIds,
        timestamp: Date.now(),
        client: true,
        name: name || undefined
      };
      
      // Encrypt using AES
      const encrypted = AES.encrypt(JSON.stringify(payload), key).toString();
      // Encode for URL safety
      return 'c:' + encodeURIComponent(encrypted); // 'c:' prefix indicates client-generated
    } catch (error) {
      const refError = new RefStateError(
        `Failed to create client reference: ${error}`,
        RefStateErrorType.ENCRYPTION
      );
      this.emitEvent(RefStateEventType.ERROR, refError);
      throw refError;
    }
  }
  
  /**
   * Create a server-side reference key
   * 
   * @param docIds Array of document IDs to reference
   * @param options Creation options
   * @returns Promise resolving to a server reference token
   */
  private async createServerRefState(
    docIds: string[], 
    options: CreateRefStateOptions = {}
  ): Promise<string> {
    try {
      const { serverEndpoint } = this.options;
      const { salt = '', name = '', expireIn } = options;
      
      const response = await fetch(serverEndpoint!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          documentIds: docIds,
          salt: salt ? true : false, // Don't send the actual salt
          name: name || 'Unnamed Selection',
          expireIn
        })
      });
      
      if (!response.ok) {
        throw new Error(`Server returned ${response.status}: ${response.statusText}`);
      }
      
      const { referenceId } = await response.json();
      return 's:' + referenceId; // 's:' prefix indicates server-generated
    } catch (error) {
      const refError = new RefStateError(
        `Failed to create server reference: ${error}`,
        RefStateErrorType.NETWORK
      );
      this.emitEvent(RefStateEventType.ERROR, refError);
      throw refError;
    }
  }
  
  /**
   * Get documents from a reference state token
   * 
   * @param refStateToken The reference state token
   * @param salt Optional salt for decryption
   * @returns Promise resolving to document IDs
   */
  async getDocumentsFromRefState(refStateToken: string, salt = ''): Promise<string[]> {
    if (!refStateToken) return [];
    
    this.log('Getting documents from reference state:', refStateToken);
    
    // Check what type of reference we have
    if (refStateToken.startsWith('s:')) {
      // Handle server-generated reference
      return this.getServerRefDocuments(refStateToken.substring(2));
    } else if (refStateToken.startsWith('c:')) {
      // Handle client-generated reference
      return this.getClientRefDocuments(refStateToken.substring(2), salt);
    } else {
      // Legacy format support (no prefix)
      return this.getClientRefDocuments(refStateToken, salt);
    }
  }
  
  /**
   * Get documents from client-side encrypted reference
   * 
   * @param encryptedRef The encrypted reference token
   * @param salt Optional salt for decryption
   * @returns Array of document IDs
   */
  private getClientRefDocuments(encryptedRef: string, salt = ''): string[] {
    try {
      // Decode from URL format
      const decoded = decodeURIComponent(encryptedRef);
      const key = this.getEncryptionKey(salt);
      
      // Decrypt using AES
      const decrypted = AES.decrypt(decoded, key).toString(Utf8);
      const { docs } = JSON.parse(decrypted) as ClientRefState;
      return docs || [];
    } catch (error) {
      const refError = new RefStateError(
        `Invalid client reference token: ${error}`,
        RefStateErrorType.DECRYPTION
      );
      this.emitEvent(RefStateEventType.ERROR, refError);
      this.log('Decryption error:', error);
      return [];
    }
  }
  
  /**
   * Get documents from server-side reference
   * 
   * @param referenceId The reference ID
   * @returns Promise resolving to document IDs
   */
  private async getServerRefDocuments(referenceId: string): Promise<string[]> {
    try {
      const { serverEndpoint } = this.options;
      const response = await fetch(`${serverEndpoint}/${referenceId}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          throw new RefStateError(
            'Reference not found or expired',
            RefStateErrorType.NOT_FOUND
          );
        }
        
        throw new Error(`Server returned ${response.status}: ${response.statusText}`);
      }
      
      const { documentIds } = await response.json();
      return documentIds || [];
    } catch (error) {
      if (error instanceof RefStateError) {
        this.emitEvent(RefStateEventType.ERROR, error);
        throw error;
      }
      
      const refError = new RefStateError(
        `Failed to retrieve server reference: ${error}`,
        RefStateErrorType.NETWORK
      );
      this.emitEvent(RefStateEventType.ERROR, refError);
      throw refError;
    }
  }
  
  /**
   * Get encryption key by combining app secret with optional salt
   * 
   * @param salt Optional salt to add
   * @returns Encryption key
   */
  private getEncryptionKey(salt = ''): string {
    return this.options.encryptionKey + salt;
  }
  
  /**
   * Save reference state to localStorage and optionally URL
   * 
   * @param refStateToken The reference state token
   * @param updateUrl Whether to update the URL query parameter
   * @returns The reference state token
   */
  saveRefState(refStateToken: string, updateUrl = true): string {
    if (!refStateToken) return '';
    
    this.log('Saving reference state:', refStateToken);
    
    try {
      // Store in localStorage
      localStorage.setItem('refstate', refStateToken);
      
      // Update URL if requested
      if (updateUrl && typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        url.searchParams.set('refstate', refStateToken);
        window.history.replaceState({}, '', url.toString());
      }
      
      this.emitEvent(RefStateEventType.CHANGE, { refStateToken });
      return refStateToken;
    } catch (error) {
      this.log('Error saving reference state:', error);
      return refStateToken;
    }
  }
  
  /**
   * Get current reference state from URL or localStorage
   * 
   * @returns The current reference state token or empty string
   */
  getCurrentRefState(): string {
    // Skip if not in browser environment
    if (typeof window === 'undefined') return '';
    
    // Check URL first (for sharing scenarios)
    const urlParams = new URLSearchParams(window.location.search);
    const urlRefState = urlParams.get('refstate');
    
    if (urlRefState) {
      // Save to localStorage for persistence
      localStorage.setItem('refstate', urlRefState);
      return urlRefState;
    }
    
    // Fall back to localStorage
    return localStorage.getItem('refstate') || '';
  }
  
  /**
   * Clear the current reference state
   */
  clearRefState(): void {
    this.log('Clearing reference state');
    
    try {
      localStorage.removeItem('refstate');
      
      // Also remove from URL if present
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        if (url.searchParams.has('refstate')) {
          url.searchParams.delete('refstate');
          window.history.replaceState({}, '', url.toString());
        }
      }
      
      this.emitEvent(RefStateEventType.CHANGE, { refStateToken: null });
    } catch (error) {
      this.log('Error clearing reference state:', error);
    }
  }
  
  /**
   * Generate a shareable URL with the current reference state
   * 
   * @param baseUrl Optional base URL to use (defaults to current URL)
   * @returns Full URL with reference state
   */
  getShareableUrl(baseUrl?: string): string {
    if (typeof window === 'undefined') return '';
    
    const refStateToken = this.getCurrentRefState();
    if (!refStateToken) return window.location.href;
    
    const url = new URL(baseUrl || window.location.href);
    url.searchParams.set('refstate', refStateToken);
    return url.toString();
  }
  
  /**
   * Register an event handler
   * 
   * @param eventType Event type to listen for
   * @param handler Event handler function
   * @returns Function to remove the event handler
   */
  on(eventType: RefStateEventType, handler: RefStateEventHandler): () => void {
    const handlers = this.eventHandlers.get(eventType);
    if (handlers) {
      handlers.add(handler);
    }
    
    return () => {
      const handlers = this.eventHandlers.get(eventType);
      if (handlers) {
        handlers.delete(handler);
      }
    };
  }
  
  /**
   * Emit an event to registered handlers
   * 
   * @param eventType Event type to emit
   * @param data Event data
   */
  private emitEvent(eventType: RefStateEventType, data: any): void {
    const handlers = this.eventHandlers.get(eventType);
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(data);
        } catch (error) {
          this.log('Error in event handler:', error);
        }
      });
    }
  }
  
  /**
   * Log debug messages if debug mode is enabled
   * 
   * @param args Arguments to log
   */
  private log(...args: any[]): void {
    if (this.options.debug) {
      console.log('[RefState]', ...args);
    }
  }
}

// Create and export default instance with default options
export const refState = new RefStateManager();