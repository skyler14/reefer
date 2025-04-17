// src/index.ts
// Export core functionality
export { RefStateManager, refState } from './core';
export * from './types';

// Export server functionality
import * as ServerModule from './server';
export const Server = ServerModule;
