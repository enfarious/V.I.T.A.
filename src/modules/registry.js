const modules = new Map();

export function registerModule(moduleId, moduleConfig) {
  modules.set(moduleId, {
    id: moduleId,
    name: moduleConfig.name,
    version: moduleConfig.version || '0.0.1',
    migrations: moduleConfig.migrations || [],
    routes: moduleConfig.routes || null,
    ...moduleConfig
  });
}

export function getModule(moduleId) {
  return modules.get(moduleId) || null;
}

export function getAllModules() {
  return Array.from(modules.values());
}

export function hasModule(moduleId) {
  return modules.has(moduleId);
}
