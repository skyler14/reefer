// src/server/middleware.ts
import { RefStateServerOptions } from './types';
import { MemoryStorage } from './storage';

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

// Secure random bytes implementation
function secureRandomBytes(length: number): string {
  if (isNode && nodeCrypto) {
    // Node.js environment
    return nodeCrypto.randomBytes(length).toString('hex');
  }
  
  // Browser environment with Web Crypto API
  if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
    const array = new Uint8Array(length);
    window.crypto.getRandomValues(array);
    return Array.from(array)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }
  
  // Fallback (less secure) - Should rarely happen
  console.warn('No secure random source available, using Math.random fallback');
  let result = '';
  const characters = 'abcdef0123456789';
  const charactersLength = characters.length;
  for (let i = 0; i < length * 2; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
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
  refKeyLength: 16,
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
    serverSalt,
    defaultExpiration,
    storage,
    basePath
  } = { ...DEFAULT_SERVER_OPTIONS, ...options };
  
  /**
   * Generate a secure reference ID with optional salting
   * 
   * @param useSalt Whether to use server salt
   * @returns Secure reference ID
   */
  function generateReferenceId(useSalt = false): string {
    // Create a secure random string
    const randomBytes = secureRandomBytes(refKeyLength! / 2); // 8 bytes = 16 hex chars
    
    // If salting is enabled, mix in server secret
    if (useSalt && serverSalt) {
      const hash = createHash(randomBytes, serverSalt);
      return hash.substring(0, refKeyLength);
    }
    
    // Otherwise just use the random bytes directly
    return randomBytes.substring(0, refKeyLength);
  }
  
  // Return middleware creator function compatible with Express
  return function(router: any) {
    // Create a reference state
    router.post(`${basePath}`, async (req: any, res: any) => {
      try {
        const { documentIds, salt = false, name = 'Unnamed', expireIn } = req.body;
        
        if (!Array.isArray(documentIds) || documentIds.length === 0) {
          return res.status(400).json({ error: 'Invalid document IDs' });
        }
        
        // Generate a secure random reference ID
        const referenceId = generateReferenceId(salt);
        
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