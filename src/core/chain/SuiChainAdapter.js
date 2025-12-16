import { ChainAdapter } from './ChainAdapter.js';

// TODO: Wire up a Sui client once on-chain integration is required.
export class SuiChainAdapter extends ChainAdapter {
  async resolveIdentity(_payload) {
    // TODO: Connect Sui client
    // TODO: Resolve E:F identity to canonicalId/displayName
    return null;
  }

  async getMembership(_payload) {
    // TODO: Query on-chain membership objects or indexer
    return null;
  }

  async verifyBadge(_payload) {
    // TODO: Verify badge ownership from chain state
    return false;
  }

  async getPublicProfile(_payload) {
    // TODO: Resolve profile data from chain or indexer
    return null;
  }
}
