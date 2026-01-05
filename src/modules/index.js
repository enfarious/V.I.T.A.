import { registerModule, getModule, getAllModules } from './registry.js';
import { installModuleForTenant, getInstalledModules } from './migrator.js';

import { moduleConfig as basicTribeUiConfig, createRoutes as createBasicTribeUiRoutes } from './basic_tribe_ui/index.js';

registerModule(basicTribeUiConfig.id, {
  ...basicTribeUiConfig,
  createRoutes: createBasicTribeUiRoutes
});

export {
  registerModule,
  getModule,
  getAllModules,
  installModuleForTenant,
  getInstalledModules
};

export async function installDefaultModules(tenantSlug) {
  const basicTribeUi = getModule('basic_tribe_ui');
  if (basicTribeUi) {
    await installModuleForTenant(tenantSlug, basicTribeUi);
  }
}
