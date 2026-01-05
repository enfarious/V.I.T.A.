import { ChainAdapter } from './ChainAdapter.js';
import { MockChainAdapter } from './MockChainAdapter.js';
import { SuiChainAdapter } from './SuiChainAdapter.js';

export { ChainAdapter, MockChainAdapter, SuiChainAdapter };

export function createChainAdapter(type = 'mock', config = {}) {
  switch (type) {
    case 'sui':
      return new SuiChainAdapter(config);
    case 'mock':
    default:
      return new MockChainAdapter();
  }
}
