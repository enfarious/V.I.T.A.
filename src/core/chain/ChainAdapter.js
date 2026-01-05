export class ChainAdapter {
  async connect() {
    throw new Error('connect not implemented');
  }

  async resolveIdentity(_payload) {
    throw new Error('resolveIdentity not implemented');
  }

  async getMembership(_payload) {
    throw new Error('getMembership not implemented');
  }

  async verifyBadge(_payload) {
    throw new Error('verifyBadge not implemented');
  }

  async getPublicProfile(_payload) {
    throw new Error('getPublicProfile not implemented');
  }

  async getTribeInfo(_tribeId) {
    throw new Error('getTribeInfo not implemented');
  }
}
