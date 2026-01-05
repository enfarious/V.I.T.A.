import { ChainAdapter } from './ChainAdapter.js';

export class SuiChainAdapter extends ChainAdapter {
  constructor(config = {}) {
    super();
    this.network = config.network || 'testnet';
    this.rpcUrl = config.rpcUrl || this.#getDefaultRpcUrl(this.network);
    this.worldPackageId = config.worldPackageId || null;
    this.client = null;
  }

  #getDefaultRpcUrl(network) {
    const urls = {
      mainnet: 'https://fullnode.mainnet.sui.io',
      testnet: 'https://fullnode.testnet.sui.io',
      devnet: 'https://fullnode.devnet.sui.io',
      localnet: 'http://127.0.0.1:9000'
    };
    return urls[network] || urls.testnet;
  }

  async connect() {
    if (this.client) return this.client;
    
    try {
      const { SuiClient } = await import('@mysten/sui/client');
      this.client = new SuiClient({ url: this.rpcUrl });
      console.log(`[SuiChainAdapter] Connected to ${this.network} at ${this.rpcUrl}`);
      return this.client;
    } catch (err) {
      console.warn('[SuiChainAdapter] Sui client not available:', err.message);
      return null;
    }
  }

  async resolveIdentity({ address }) {
    if (!address) return null;
    
    const client = await this.connect();
    if (!client) return null;

    try {
      const objects = await client.getOwnedObjects({
        owner: address,
        filter: { StructType: `${this.worldPackageId}::identity::Identity` },
        options: { showContent: true }
      });

      if (!objects.data?.length) return null;

      const identity = objects.data[0].data?.content?.fields;
      return {
        canonicalId: `sui:${address}`,
        displayName: identity?.display_name || address.slice(0, 8),
        address
      };
    } catch (err) {
      console.error('[SuiChainAdapter] resolveIdentity error:', err.message);
      return null;
    }
  }

  async getMembership({ address, tribeObjectId }) {
    if (!address || !tribeObjectId) return null;

    const client = await this.connect();
    if (!client) return null;

    try {
      const objects = await client.getOwnedObjects({
        owner: address,
        filter: { StructType: `${this.worldPackageId}::tribe::Membership` },
        options: { showContent: true }
      });

      const membership = objects.data?.find(obj => {
        const fields = obj.data?.content?.fields;
        return fields?.tribe_id === tribeObjectId;
      });

      if (!membership) return null;

      const fields = membership.data?.content?.fields;
      return {
        tribeId: fields?.tribe_id,
        tribeName: fields?.tribe_name,
        roles: fields?.roles || ['member'],
        joinedAt: fields?.joined_at
      };
    } catch (err) {
      console.error('[SuiChainAdapter] getMembership error:', err.message);
      return null;
    }
  }

  async verifyBadge({ address, badgeType }) {
    if (!address || !badgeType) return false;

    const client = await this.connect();
    if (!client) return false;

    try {
      const objects = await client.getOwnedObjects({
        owner: address,
        filter: { StructType: `${this.worldPackageId}::badge::Badge` },
        options: { showContent: true }
      });

      return objects.data?.some(obj => {
        const fields = obj.data?.content?.fields;
        return fields?.badge_type === badgeType;
      }) || false;
    } catch (err) {
      console.error('[SuiChainAdapter] verifyBadge error:', err.message);
      return false;
    }
  }

  async getPublicProfile({ address }) {
    if (!address) return null;

    const client = await this.connect();
    if (!client) return null;

    try {
      const objects = await client.getOwnedObjects({
        owner: address,
        filter: { StructType: `${this.worldPackageId}::profile::Profile` },
        options: { showContent: true }
      });

      if (!objects.data?.length) return null;

      const fields = objects.data[0].data?.content?.fields;
      return {
        bio: fields?.bio || '',
        links: fields?.links || [],
        avatar: fields?.avatar_url || null
      };
    } catch (err) {
      console.error('[SuiChainAdapter] getPublicProfile error:', err.message);
      return null;
    }
  }

  async getTribeInfo(tribeObjectId) {
    if (!tribeObjectId) return null;

    const client = await this.connect();
    if (!client) return null;

    try {
      const obj = await client.getObject({
        id: tribeObjectId,
        options: { showContent: true }
      });

      const fields = obj.data?.content?.fields;
      return {
        id: tribeObjectId,
        name: fields?.name,
        description: fields?.description,
        memberCount: fields?.member_count || 0,
        createdAt: fields?.created_at
      };
    } catch (err) {
      console.error('[SuiChainAdapter] getTribeInfo error:', err.message);
      return null;
    }
  }
}
