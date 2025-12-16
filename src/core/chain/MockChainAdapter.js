import { ChainAdapter } from './ChainAdapter.js';

const demoProfiles = [
  {
    provider: 'discord',
    handle: 'vita-ops#1337',
    canonicalId: 'discord:vita-ops',
    displayName: 'VITA Ops',
    corpId: 'VITA-001',
    corpName: 'VITA Frontier',
    roles: ['member', 'admin'],
    badges: ['doctrine-keeper'],
    bio: 'VITA operator maintaining doctrine integrity.',
    links: ['https://vita.example.com']
  },
  {
    provider: 'evefrontier',
    handle: 'Ishukone.Observer',
    canonicalId: 'ef:Ishukone.Observer',
    displayName: 'Ishukone Observer',
    corpId: 'VITA-002',
    corpName: 'Frontier Watch',
    roles: ['member'],
    badges: ['after-action-author'],
    bio: 'Recorder of lessons learned.',
    links: []
  }
];

export class MockChainAdapter extends ChainAdapter {
  async resolveIdentity({ provider, handle }) {
    const match = demoProfiles.find(
      (entry) =>
        entry.provider.toLowerCase() === String(provider).toLowerCase() &&
        entry.handle.toLowerCase() === String(handle).toLowerCase()
    );
    if (!match) return null;
    return { canonicalId: match.canonicalId, displayName: match.displayName };
  }

  async getMembership({ canonicalId }) {
    const match = demoProfiles.find((entry) => entry.canonicalId === canonicalId);
    if (!match) return null;
    return { corpId: match.corpId, corpName: match.corpName, roles: match.roles };
  }

  async verifyBadge({ canonicalId, badgeType }) {
    const match = demoProfiles.find((entry) => entry.canonicalId === canonicalId);
    if (!match) return false;
    return match.badges.includes(badgeType);
  }

  async getPublicProfile({ canonicalId }) {
    const match = demoProfiles.find((entry) => entry.canonicalId === canonicalId);
    if (!match) return null;
    return { bio: match.bio, links: match.links };
  }
}
