// Export core functionality
export { RefStateManager, refState } from './core';
export * from './types';

// Default export for easier imports
import { refState as defaultRefState } from './core';
export default defaultRefState;