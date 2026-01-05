import { createChainAdapter } from '../core/chain/index.js';
import { config } from '../config.js';

export class ProvisioningGateService {
  constructor(db) {
    this.db = db;
    this.chainAdapter = createChainAdapter(config.chain?.adapter, config.chain?.sui);
  }

  async checkGates(user) {
    const gates = await this.db('provisioning_gates')
      .where({ enabled: true })
      .orderBy('priority', 'asc');

    const results = {
      passed: true,
      checks: [],
      blockers: []
    };

    for (const gate of gates) {
      const gateConfig = typeof gate.config_json === 'string' 
        ? JSON.parse(gate.config_json) 
        : gate.config_json || {};

      const check = await this.runGate(gate.gate_type, user, gateConfig);
      results.checks.push(check);

      if (!check.passed) {
        results.passed = false;
        results.blockers.push(check);
      }
    }

    return results;
  }

  async runGate(gateType, user, gateConfig) {
    switch (gateType) {
      case 'discord_verified':
        return this.checkDiscordVerified(user);
      case 'wallet_verified':
        return this.checkWalletVerified(user, gateConfig);
      case 'player_status':
        return this.checkPlayerStatus(user, gateConfig);
      default:
        return { gate: gateType, passed: true, message: 'Unknown gate type (skipped)' };
    }
  }

  checkDiscordVerified(user) {
    const authProvider = user.auth_providers?.find(p => p.provider === 'discord');
    const passed = Boolean(authProvider?.provider_user_id);
    
    return {
      gate: 'discord_verified',
      passed,
      message: passed 
        ? 'Discord account verified' 
        : 'Must link Discord account to create a tribe'
    };
  }

  async checkWalletVerified(user, gateConfig) {
    if (!user.wallet_address) {
      return {
        gate: 'wallet_verified',
        passed: false,
        message: 'Must link an Eve Frontier wallet to create a tribe',
        action: 'link_wallet'
      };
    }

    if (!user.wallet_verified) {
      return {
        gate: 'wallet_verified',
        passed: false,
        message: 'Wallet address not verified',
        action: 'verify_wallet'
      };
    }

    if (gateConfig.require_player_status && !user.player_status) {
      try {
        await this.chainAdapter.connect();
        const identity = await this.chainAdapter.resolveIdentity({ address: user.wallet_address });
        
        if (!identity) {
          return {
            gate: 'wallet_verified',
            passed: false,
            message: 'No Eve Frontier identity found for this wallet',
            action: 'create_identity'
          };
        }
      } catch (err) {
        console.error('[ProvisioningGates] Chain check error:', err);
        return {
          gate: 'wallet_verified',
          passed: false,
          message: 'Could not verify player status - please try again',
          action: 'retry'
        };
      }
    }

    return {
      gate: 'wallet_verified',
      passed: true,
      message: 'Wallet verified with Eve Frontier identity'
    };
  }

  async checkPlayerStatus(user, gateConfig) {
    if (!user.wallet_address) {
      return {
        gate: 'player_status',
        passed: false,
        message: 'No wallet linked',
        action: 'link_wallet'
      };
    }

    try {
      await this.chainAdapter.connect();
      const identity = await this.chainAdapter.resolveIdentity({ address: user.wallet_address });
      
      if (!identity) {
        return {
          gate: 'player_status',
          passed: false,
          message: 'Not an active Eve Frontier player',
          action: 'play_game'
        };
      }

      return {
        gate: 'player_status',
        passed: true,
        message: `Verified as player: ${identity.displayName}`
      };
    } catch (err) {
      console.error('[ProvisioningGates] Player status check error:', err);
      return {
        gate: 'player_status',
        passed: false,
        message: 'Could not verify player status',
        action: 'retry'
      };
    }
  }
}

export function createProvisioningGateService(db) {
  return new ProvisioningGateService(db);
}
