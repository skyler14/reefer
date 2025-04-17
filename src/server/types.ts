// src/server/types.ts
/**
 * Options for the RefState server middleware
 */
export interface RefStateServerOptions {
    /** Length of reference IDs in hexadecimal characters */
    refKeyLength?: number;
    /** Server-side salt for reference IDs */
    serverSalt?: string;
    /** Default expiration time in milliseconds */
    defaultExpiration?: number;
    /** Storage adapter (defaults to in-memory) */
    storage?: RefStateStorage;
    /** Base path for API endpoints */
    basePath?: string;
  }
  
  /**
   * Storage interface for reference states
   */
  export interface RefStateStorage {
    /** Store a reference state */
    set(id: string, data: any, expireIn: number): Promise<void>;
    /** Get a reference state */
    get(id: string): Promise<any | null>;
    /** Delete a reference state */
    delete(id: string): Promise<void>;
    /** Check if a reference state exists */
    has(id: string): Promise<boolean>;
  }
  