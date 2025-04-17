# Reefer

A lightweight, secure library for managing document references through URL state.

## Overview

Reefer provides an elegant solution for storing, sharing, and synchronizing collections of document IDs across web applications. It's particularly useful when users need to select multiple documents across different pages and share those selections via URL.

## Features

- 🔒 **Secure**: Client-side encryption for document references
- 🔗 **Shareable**: Generate URLs that preserve document selections
- 🔄 **Hybrid Storage**: Automatic client/server switching for optimal performance
- 🧩 **Framework Agnostic**: Core functionality works with any JavaScript framework
- 💻 **TypeScript**: Full type definitions and type safety
- 🌐 **Isomorphic**: Works on both client and server-side

## Installation

```bash
npm install reefer
```

For server-side functionality, Express is an optional peer dependency:

```bash
npm install reefer express
```

## Basic Usage

### Client-Side Only

```javascript
import { refState } from 'reefer';

// Get currently selected document IDs
const loadDocuments = async () => {
  // Get current state from URL or localStorage
  const currentState = refState.getCurrentRefState();
  
  if (currentState) {
    // Decode document IDs from reference state
    const docIds = await refState.getDocumentsFromRefState(currentState);
    console.log('Selected documents:', docIds);
    
    // Use these IDs to load documents from your API
    // ...
  }
};

// Update document selection
const updateSelection = async (docIds) => {
  // Create a reference state from document IDs
  const refStateToken = await refState.createRefState(docIds);
  
  // Save to localStorage and update URL
  refState.saveRefState(refStateToken);
};

// Generate a shareable URL
const getShareableLink = () => {
  return refState.getShareableUrl();
};

// Clear selection
const clearSelection = () => {
  refState.clearRefState();
};
```

### Configuration Options

```javascript
import { RefStateManager } from 'reefer';

// Create a custom RefState instance with options
const customRefState = new RefStateManager({
  maxClientDocs: 100, // Max docs to handle client-side (default: 50)
  refKeyLength: 16, // Length of ref keys in hex chars (default: 16)
  serverEndpoint: '/api/refs', // Custom endpoint (default: /api/ref-state)
  encryptionKey: process.env.REEFER_KEY, // Custom encryption key
  defaultExpiration: 14 * 24 * 60 * 60 * 1000, // 14 days (default: 7 days)
  debug: true // Enable debug logging (default: false)
});
```

## Server-Side Integration

For large document collections, Reefer can automatically switch to server-side storage. The library includes server-side components for Express:

```javascript
const express = require('express');
const { Server } = require('reefer');

const app = express();
app.use(express.json());

// Add Reefer routes to your Express app
app.use(Server.createRefStateRouter(express, {
  serverSalt: process.env.REEFER_SERVER_SALT || 'your-secure-salt',
  defaultExpiration: 30 * 24 * 60 * 60 * 1000 // 30 days
}));

app.listen(3000, () => {
  console.log('Server running on http://localhost:3000');
});
```

### Custom Storage Adapter

By default, Reefer uses in-memory storage for simplicity. For production, you might want to implement a database adapter:

```javascript
const { Server } = require('reefer');
const { Pool } = require('pg');

// Create a PostgreSQL connection pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Create a custom PostgreSQL storage adapter
class PostgresStorage {
  async set(id, data, expireIn) {
    const client = await pool.connect();
    try {
      const expiryDate = new Date(Date.now() + expireIn);
      await client.query(
        'INSERT INTO ref_states(id, data, expires_at) VALUES($1, $2, $3) ' +
        'ON CONFLICT (id) DO UPDATE SET data = $2, expires_at = $3',
        [id, JSON.stringify(data), expiryDate]
      );
    } finally {
      client.release();
    }
  }
  
  async get(id) {
    const client = await pool.connect();
    try {
      const result = await client.query(
        'SELECT data FROM ref_states WHERE id = $1 AND expires_at > NOW()',
        [id]
      );
      
      if (result.rows.length === 0) {
        return null;
      }
      
      return JSON.parse(result.rows[0].data);
    } finally {
      client.release();
    }
  }
  
  async delete(id) {
    const client = await pool.connect();
    try {
      await client.query('DELETE FROM ref_states WHERE id = $1', [id]);
    } finally {
      client.release();
    }
  }
  
  async has(id) {
    const client = await pool.connect();
    try {
      const result = await client.query(
        'SELECT 1 FROM ref_states WHERE id = $1 AND expires_at > NOW()',
        [id]
      );
      return result.rows.length > 0;
    } finally {
      client.release();
    }
  }
}

// Use custom storage with Reefer
const { createRefStateRouter } = Server;
app.use(createRefStateRouter(express, {
  storage: new PostgresStorage(),
  serverSalt: process.env.REEFER_SERVER_SALT
}));
```

## Framework Integration Examples

While Reefer is framework-agnostic, here are examples of how you might integrate it with popular frameworks:

### React Integration Example

```jsx
import React, { useState, useEffect, useCallback } from 'react';
import { refState } from 'reefer';

function useRefState(options = {}) {
  const [docIds, setDocIds] = useState([]);
  
  // Load initial state
  useEffect(() => {
    async function loadInitialState() {
      const currentRefState = refState.getCurrentRefState();
      if (currentRefState) {
        const ids = await refState.getDocumentsFromRefState(
          currentRefState, 
          options.salt
        );
        setDocIds(ids);
      }
    }
    
    loadInitialState();
  }, [options.salt]);
  
  // Update handler
  const updateSelection = useCallback(async (newIds) => {
    setDocIds(newIds);
    const refStateToken = await refState.createRefState(newIds, options);
    refState.saveRefState(refStateToken);
  }, [options]);
  
  // Clear handler
  const clearSelection = useCallback(() => {
    setDocIds([]);
    refState.clearRefState();
  }, []);
  
  return [docIds, updateSelection, clearSelection];
}

// Example component
function DocumentSelector({ documents }) {
  const [selectedDocIds, updateSelection, clearSelection] = useRefState();
  
  const toggleDocument = (docId) => {
    if (selectedDocIds.includes(docId)) {
      updateSelection(selectedDocIds.filter(id => id !== docId));
    } else {
      updateSelection([...selectedDocIds, docId]);
    }
  };
  
  return (
    <div>
      <h2>Select Documents</h2>
      {documents.map(doc => (
        <div key={doc.id}>
          <input
            type="checkbox"
            checked={selectedDocIds.includes(doc.id)}
            onChange={() => toggleDocument(doc.id)}
          />
          <label>{doc.title}</label>
        </div>
      ))}
      
      {selectedDocIds.length > 0 && (
        <div>
          <p>{selectedDocIds.length} documents selected</p>
          <button onClick={clearSelection}>Clear</button>
          <button onClick={() => {
            navigator.clipboard.writeText(refState.getShareableUrl());
          }}>
            Copy Link
          </button>
        </div>
      )}
    </div>
  );
}
```

### Vue Integration Example

```javascript
// composables/useRefState.js
import { ref, onMounted } from 'vue';
import { refState } from 'reefer';

export function useRefState(options = {}) {
  const docIds = ref([]);
  const isLoading = ref(false);
  
  // Load initial state
  onMounted(async () => {
    isLoading.value = true;
    const currentRefState = refState.getCurrentRefState();
    
    if (currentRefState) {
      const ids = await refState.getDocumentsFromRefState(
        currentRefState, 
        options.salt
      );
      docIds.value = ids;
    }
    
    isLoading.value = false;
  });
  
  // Update handler
  const updateSelection = async (newIds) => {
    isLoading.value = true;
    docIds.value = newIds;
    const refStateToken = await refState.createRefState(newIds, options);
    refState.saveRefState(refStateToken);
    isLoading.value = false;
  };
  
  // Clear handler
  const clearSelection = () => {
    docIds.value = [];
    refState.clearRefState();
  };
  
  // Get shareable URL
  const getShareableUrl = () => {
    return refState.getShareableUrl();
  };
  
  return {
    docIds,
    isLoading,
    updateSelection,
    clearSelection,
    getShareableUrl
  };
}
```

## API Reference

### RefStateManager

- `createRefState(docIds, options)`: Create a reference state token
- `getDocumentsFromRefState(refStateToken, salt)`: Get document IDs from a token
- `saveRefState(refStateToken, updateUrl)`: Save reference state
- `getCurrentRefState()`: Get current reference state from URL/localStorage
- `clearRefState()`: Clear the current reference state
- `getShareableUrl(baseUrl)`: Get a shareable URL with the current state
- `on(eventType, handler)`: Register an event handler

### Server Namespace

- `createRefStateRouter(express, options)`: Create an Express router for Reefer
- `createRefStateMiddleware(options)`: Create middleware for custom Express setup
- `MemoryStorage`: In-memory storage implementation

### Events

- `RefStateEventType.CHANGE`: Fired when reference state changes
- `RefStateEventType.ERROR`: Fired when an error occurs
- `RefStateEventType.EXPIRE`: Fired when a reference expires

## TypeScript Support

Reefer includes comprehensive TypeScript definitions:

```typescript
import { 
  RefStateManager, 
  RefStateOptions,
  CreateRefStateOptions,
  RefStateEventType,
  Server 
} from 'reefer';
```

## Security Considerations

- Use a strong, unique encryption key in production
- Use HTTPS for all server communications
- Consider user-specific salting for sensitive data
- Never store sensitive information in references

## License

MIT