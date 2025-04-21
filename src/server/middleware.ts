// src/server/middleware.ts
import { RefStateServerOptions } from './types';
import { MemoryStorage } from './storage';
import { ReferenceIdFormat } from '../types';

// Environment detection
const isNode = typeof process !== 'undefined' && 
               process.versions != null && 
               process.versions.node != null;

// Import Node's crypto module safely without using eval
let nodeCrypto: any = null;
if (isNode) {
  try {
    // Using a variable to prevent direct imports that cause bundling issues
    // This is a safer approach than using eval
    // @ts-ignore: Ignoring this since we're handling require dynamically
    nodeCrypto = require('crypto');
  } catch (e) {
    console.warn('Node crypto module not available:', e);
  }
}

/**
 * Generate a secure random string in the requested format
 * 
 * @param length Desired length of the output string
 * @param format Format of the output string
 * @returns Randomly generated string in the requested format
 */
function generateRandomString(length: number, format: ReferenceIdFormat = ReferenceIdFormat.STRING): string {
  let bytes: Uint8Array;
  const requiredBytes = format === ReferenceIdFormat.HEX 
    ? Math.ceil(length / 2)
    : format === ReferenceIdFormat.BASE64
      ? Math.ceil(length * 3 / 4)
      : length;
      
  // Generate secure random bytes
  if (isNode && nodeCrypto) {
    // Node.js environment
    bytes = nodeCrypto.randomBytes(requiredBytes);
  } else if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
    // Browser environment with Web Crypto API
    bytes = new Uint8Array(requiredBytes);
    window.crypto.getRandomValues(bytes);
  } else {
    // Fallback (less secure)
    console.warn('No secure random source available, using Math.random fallback');
    bytes = new Uint8Array(requiredBytes);
    for (let i = 0; i < requiredBytes; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }
  
  // Format the bytes according to the requested format
  switch (format) {
    case ReferenceIdFormat.HEX:
      // Convert to hexadecimal
      return Array.from(bytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('')
        .substring(0, length);
        
    case ReferenceIdFormat.BASE64:
      // Convert to base64
      if (isNode && nodeCrypto) {
        return nodeCrypto.randomBytes(requiredBytes).toString('base64').substring(0, length);
      } else {
        // For browsers
        const base64 = btoa(String.fromCharCode.apply(null, Array.from(bytes)))
          .replace(/\+/g, '-') // Convert '+' to '-'
          .replace(/\//g, '_') // Convert '/' to '_'
          .replace(/=+$/, ''); // Remove trailing '='
        return base64.substring(0, length);
      }
      
    case ReferenceIdFormat.STRING:
    default:
      // Generate an alphanumeric string
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
      let result = '';
      
      // Use modulo arithmetic on the random bytes to select characters
      for (let i = 0; i < length; i++) {
        result += chars.charAt(bytes[i % bytes.length] % chars.length);
      }
      
      return result;
  }
}

// Simple hash function that works in all environments
function simpleHash(data: string, salt: string): string {
  const combined = data + salt;
  
  // Create a simple hash
  let hash = 0;
  for (let i = 0; i < combined.length; i++) {
    const char = combined.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32bit integer
  }
  
  // Convert to hex
  return Math.abs(hash).toString(16).padStart(16, '0');
}

// Cryptographic hash if available, otherwise simple hash
function createHash(data: string, salt: string): string {
  if (isNode && nodeCrypto) {
    try {
      const hash = nodeCrypto.createHash('sha256');
      hash.update(data);
      hash.update(salt);
      return hash.digest('hex');
    } catch (e) {
      console.warn('Node crypto module hash failed, using fallback');
    }
  }
  
  // Fallback to simple hash
  return simpleHash(data, salt);
}

/**
 * Default storage instance
 */
const defaultStorage = new MemoryStorage();

/**
 * Default server options
 */
const DEFAULT_SERVER_OPTIONS: RefStateServerOptions = {
  refKeyLength: 20,
  refKeyFormat: ReferenceIdFormat.STRING,
  serverSalt: 'reefer-server-salt',
  defaultExpiration: 7 * 24 * 60 * 60 * 1000, // 7 days
  storage: defaultStorage,
  basePath: '/api/ref-state'
};

/**
 * Create Express middleware for RefState server
 * 
 * @param options Server options
 * @returns Express middleware
 */
export function createRefStateMiddleware(options: RefStateServerOptions = {}) {
  const {
    refKeyLength,
    refKeyFormat,
    serverSalt,
    defaultExpiration,
    storage,
    basePath
  } = { ...DEFAULT_SERVER_OPTIONS, ...options };
  
  /**
   * Generate a secure reference ID with optional salting
   * 
   * @param format Format to generate the ID in
   * @param useSalt Whether to use server salt
   * @returns Secure reference ID
   */
  function generateReferenceId(format = refKeyFormat, useSalt = false): string {
    // Create a secure random string
    const randomString = generateRandomString(refKeyLength!, format as ReferenceIdFormat);
    
    // If salting is enabled, mix in server secret
    if (useSalt && serverSalt) {
      const hash = createHash(randomString, serverSalt);
      return hash.substring(0, refKeyLength!);
    }
    
    // Otherwise just use the random string directly
    return randomString;
  }
  
  // Return middleware creator function compatible with Express
  return function(router: any) {
    // Create a reference state
    router.post(`${basePath}`, async (req: any, res: any) => {
      try {
        const { 
          documentIds, 
          salt = false, 
          name = 'Unnamed', 
          expireIn,
          idFormat = refKeyFormat
        } = req.body;
        
        if (!Array.isArray(documentIds) || documentIds.length === 0) {
          return res.status(400).json({ error: 'Invalid document IDs' });
        }
        
        // Generate a secure random reference ID
        const referenceId = generateReferenceId(idFormat, salt);
        
        // Calculate expiration time
        const expirationTime = expireIn || defaultExpiration;
        
        // Store the reference
        await storage!.set(referenceId, {
          documentIds,
          name,
          createdAt: Date.now(),
          salt: !!salt // Just store if salting was used, not the actual salt
        }, expirationTime);
        
        res.json({ 
          referenceId,
          expiresAt: Date.now() + expirationTime
        });
      } catch (error) {
        console.error('Error creating reference state:', error);
        res.status(500).json({ error: 'Failed to create reference state' });
      }
    });
    
    // Retrieve a reference state
    router.get(`${basePath}/:id`, async (req: any, res: any) => {
      try {
        const { id } = req.params;
        
        const reference = await storage!.get(id);
        if (!reference) {
          return res.status(404).json({ error: 'Reference not found or expired' });
        }
        
        res.json({ 
          documentIds: reference.documentIds,
          name: reference.name,
          createdAt: reference.createdAt,
          expiresAt: reference.expiresAt
        });
      } catch (error) {
        console.error('Error retrieving reference state:', error);
        res.status(500).json({ error: 'Failed to retrieve reference state' });
      }
    });
    
    return router;
  };
}

/**
 * Create a standalone Express router for RefState
 * 
 * @param express The Express module
 * @param options Server options
 * @returns Express router
 */
export function createRefStateRouter(express: any, options: RefStateServerOptions = {}) {
  const router = express.Router();
  createRefStateMiddleware(options)(router);
  return router;
}