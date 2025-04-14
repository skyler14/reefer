// src/types.ts

/**
 * Configuration options for RefState
 */
export interface RefStateOptions {
  /** Maximum number of document IDs to handle client-side */
  maxClientDocs?: number;
  /** Length of reference keys in hexadecimal characters */
  refKeyLength?: number;
  /** Default server endpoint for RefState API */
  serverEndpoint?: string;
  /** App-wide encryption key for client-side operations */
  encryptionKey?: string;
  /** Default expiration time in milliseconds */
  defaultExpiration?: number;
  /** Enable debug mode with additional logging */
  debug?: boolean;
}

/**
 * Options for creating a new reference state
 */
export interface CreateRefStateOptions {
  /** Use server-side reference storage for large collections */
  serverSync?: boolean;
  /** Optional salt for encryption key derivation */
  salt?: string;
  /** Name for this reference state (for management UI) */
  name?: string;
  /** Time in milliseconds until this reference expires */
  expireIn?: number;
}

/**
 * Server response when creating a reference state
 */
export interface CreateRefStateResponse {
  /** The unique reference ID to use */
  referenceId: string;
  /** When this reference will expire */
  expiresAt?: number;
}

/**
 * Server response when retrieving a reference state
 */
export interface GetRefStateResponse {
  /** The document IDs associated with this reference */
  documentIds: string[];
  /** Name of this reference state */
  name?: string;
  /** When this reference was created */
  createdAt?: number;
  /** When this reference will expire */
  expiresAt?: number;
}

/**
 * Client-side reference state data structure
 */
export interface ClientRefState {
  /** Document IDs being referenced */
  docs: string[];
  /** When this reference was created */
  timestamp: number;
  /** Flag identifying this as client-generated */
  client: true;
  /** Optional reference name */
  name?: string;
}

/**
 * Error types for RefState operations
 */
export enum RefStateErrorType {
  NETWORK = 'network',
  ENCRYPTION = 'encryption',
  DECRYPTION = 'decryption',
  NOT_FOUND = 'not_found',
  EXPIRED = 'expired',
  INVALID = 'invalid',
  SERVER = 'server',
}

/**
 * RefState error with type information
 */
export class RefStateError extends Error {
  type: RefStateErrorType;
  
  constructor(message: string, type: RefStateErrorType) {
    super(message);
    this.type = type;
    this.name = 'RefStateError';
  }
}

/**
 * RefState event types
 */
export enum RefStateEventType {
  CHANGE = 'change',
  ERROR = 'error',
  EXPIRE = 'expire',
}

/**
 * Event handler function signature
 */
export type RefStateEventHandler = (data: any) => void;