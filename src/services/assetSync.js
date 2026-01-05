import fs from 'fs/promises';
import path from 'path';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STORAGE_ROOT = path.resolve(__dirname, '../../storage/tenants');

const MAX_ASSET_SIZE_MB = 50;
const REQUIRED_FILES = ['index.html'];

export class AssetSyncService {
  constructor(db) {
    this.db = db;
  }

  async syncFromGitHub(tenantId, moduleId, repoUrl, branch = 'main') {
    const assetRecord = await this.db('tenant_module_assets')
      .where({ tenant_id: tenantId, module_id: moduleId })
      .first();

    if (!assetRecord) {
      throw new Error('Asset record not found');
    }

    await this.db('tenant_module_assets')
      .where({ id: assetRecord.id })
      .update({ status: 'syncing', updated_at: new Date() });

    try {
      const { owner, repo } = this.parseGitHubUrl(repoUrl);
      const zipUrl = `https://github.com/${owner}/${repo}/archive/refs/heads/${branch}.zip`;
      
      const tenant = await this.db('tenants').where({ id: tenantId }).first();
      if (!tenant) throw new Error('Tenant not found');

      const tempDir = path.join(STORAGE_ROOT, tenant.slug, '.tmp', `${moduleId}-${Date.now()}`);
      const targetDir = path.join(STORAGE_ROOT, tenant.slug, moduleId);
      
      await fs.mkdir(tempDir, { recursive: true });

      const zipPath = path.join(tempDir, 'archive.zip');
      await this.downloadFile(zipUrl, zipPath);

      const stats = await fs.stat(zipPath);
      if (stats.size > MAX_ASSET_SIZE_MB * 1024 * 1024) {
        throw new Error(`Archive exceeds ${MAX_ASSET_SIZE_MB}MB limit`);
      }

      const extractedDir = path.join(tempDir, 'extracted');
      await this.extractZip(zipPath, extractedDir);

      const buildDir = await this.findBuildDir(extractedDir, moduleId);
      if (!buildDir) {
        throw new Error('No valid build directory found (must contain index.html in dist/, public/, build/, or src/modules/<module>/public/)');
      }

      await this.validateBuild(buildDir);

      await fs.rm(targetDir, { recursive: true, force: true });
      await fs.mkdir(path.dirname(targetDir), { recursive: true });
      await fs.rename(buildDir, targetDir);

      await fs.rm(tempDir, { recursive: true, force: true });

      const commit = `${branch}-${Date.now()}`;
      
      await this.db('tenant_module_assets')
        .where({ id: assetRecord.id })
        .update({
          status: 'active',
          current_commit: commit,
          current_version: branch,
          asset_path: targetDir,
          last_synced_at: new Date(),
          last_error: null,
          updated_at: new Date()
        });

      return { success: true, commit, path: targetDir };
    } catch (err) {
      await this.db('tenant_module_assets')
        .where({ id: assetRecord.id })
        .update({
          status: 'error',
          last_error: err.message,
          updated_at: new Date()
        });
      throw err;
    }
  }

  parseGitHubUrl(url) {
    const match = url.match(/github\.com[\/:]([^\/]+)\/([^\/]+?)(?:\.git)?$/);
    if (!match) throw new Error('Invalid GitHub URL');
    return { owner: match[1], repo: match[2].replace(/\.git$/, '') };
  }

  async downloadFile(url, destPath) {
    const response = await fetch(url, { redirect: 'follow' });
    if (!response.ok) {
      throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
    }
    
    const fileStream = createWriteStream(destPath);
    await pipeline(response.body, fileStream);
  }

  async extractZip(zipPath, destDir) {
    const extractZip = (await import('extract-zip')).default;
    await fs.mkdir(destDir, { recursive: true });
    await extractZip(zipPath, { dir: destDir });
  }

  async findBuildDir(extractedDir, moduleId = null) {
    const entries = await fs.readdir(extractedDir, { withFileTypes: true });
    
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const subDir = path.join(extractedDir, entry.name);
        
        // Priority 1: Module-specific nested paths (for unified module repos)
        if (moduleId) {
          const nestedModulePath = path.join(subDir, 'src', 'modules', moduleId, 'public');
          if (await this.hasIndexHtml(nestedModulePath)) {
            console.log(`[AssetSync] Found module-specific build at: src/modules/${moduleId}/public/`);
            return nestedModulePath;
          }
          
          const modulesPath = path.join(subDir, 'modules', moduleId, 'public');
          if (await this.hasIndexHtml(modulesPath)) {
            console.log(`[AssetSync] Found module build at: modules/${moduleId}/public/`);
            return modulesPath;
          }
        }
        
        // Priority 2: Standard build output directories (must have assets/ to be a real build)
        const distPath = path.join(subDir, 'dist');
        if (await this.isBuildDir(distPath)) {
          console.log('[AssetSync] Found build at: dist/');
          return distPath;
        }
        
        const buildPath = path.join(subDir, 'build');
        if (await this.isBuildDir(buildPath)) {
          console.log('[AssetSync] Found build at: build/');
          return buildPath;
        }
        
        // Priority 3: public/ folder (only if it looks like a build, not source)
        const publicPath = path.join(subDir, 'public');
        if (await this.isBuildDir(publicPath)) {
          console.log('[AssetSync] Found build at: public/');
          return publicPath;
        }
        
        // Priority 4: Root directory only if it's a build (has assets/) not source (has src/)
        if (await this.isBuildDir(subDir)) {
          console.log('[AssetSync] Found build at repo root');
          return subDir;
        }
      }
    }
    
    return null;
  }

  async isBuildDir(dir) {
    // Must have index.html
    if (!await this.hasIndexHtml(dir)) return false;
    
    try {
      // Check for signs this is a BUILD not source:
      // - Has assets/ folder (Vite build output)
      // - OR has .js files directly (simple builds)
      // - AND does NOT have src/ with .tsx/.ts files
      const entries = await fs.readdir(dir);
      
      // Disqualify if it has src/ folder (this is source, not build)
      if (entries.includes('src')) {
        const srcEntries = await fs.readdir(path.join(dir, 'src'));
        const hasSourceFiles = srcEntries.some(f => f.endsWith('.tsx') || f.endsWith('.ts') || f.endsWith('.jsx'));
        if (hasSourceFiles) {
          console.log(`[AssetSync] Skipping ${dir} - contains source files`);
          return false;
        }
      }
      
      // Accept if it has assets/ folder (Vite/modern build output)
      if (entries.includes('assets')) return true;
      
      // Accept if it has .js files (older build patterns)
      if (entries.some(f => f.endsWith('.js'))) return true;
      
      // Accept if it's minimal (just index.html + css/images)
      const hasOnlyStatic = entries.every(f => 
        f.endsWith('.html') || f.endsWith('.css') || f.endsWith('.ico') || 
        f.endsWith('.png') || f.endsWith('.jpg') || f.endsWith('.svg') ||
        f === 'assets' || f === 'images' || f === 'css' || f === 'js'
      );
      if (hasOnlyStatic) return true;
      
      return false;
    } catch {
      return false;
    }
  }

  async hasIndexHtml(dir) {
    try {
      await fs.access(path.join(dir, 'index.html'));
      return true;
    } catch {
      return false;
    }
  }

  async validateBuild(buildDir) {
    for (const file of REQUIRED_FILES) {
      try {
        await fs.access(path.join(buildDir, file));
      } catch {
        throw new Error(`Missing required file: ${file}`);
      }
    }

    const indexContent = await fs.readFile(path.join(buildDir, 'index.html'), 'utf-8');
    if (indexContent.length < 10) {
      throw new Error('index.html appears to be empty or invalid');
    }
  }

  getAssetPath(tenantSlug, moduleId) {
    return path.join(STORAGE_ROOT, tenantSlug, moduleId);
  }

  async assetExists(tenantSlug, moduleId) {
    try {
      const assetPath = this.getAssetPath(tenantSlug, moduleId);
      await fs.access(path.join(assetPath, 'index.html'));
      return true;
    } catch {
      return false;
    }
  }
}

export function createAssetSyncService(db) {
  return new AssetSyncService(db);
}
