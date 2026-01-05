import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.resolve(__dirname, 'vita.db');
const SCHEMA_PATH = path.resolve(__dirname, 'schema.sql');

export function initDb() {
  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const schemaSql = fs.readFileSync(SCHEMA_PATH, 'utf-8');
  db.exec(schemaSql);

  seed(db);
  return db;
}

function seed(db) {
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  if (userCount > 0) {
    return;
  }

  const adminPasswordHash = '$2b$10$hbajG1JY0Cy3991HHstcnuvjyRmbKy96ZxkkD8Y/s7HKZ5xuNE4ya'; // admin123

  const insertUser = db.prepare(
    'INSERT INTO users (email, password_hash, display_name) VALUES (@email, @password_hash, @display_name)'
  );
  const insertRole = db.prepare('INSERT INTO user_roles (user_id, role) VALUES (@user_id, @role)');
  const insertDoctrine = db.prepare(
    'INSERT INTO doctrine_pages (slug, title, body_markdown) VALUES (@slug, @title, @body_markdown)'
  );
  const insertAar = db.prepare(
    'INSERT INTO after_action_reports (title, body_markdown, author_user_id, visibility) VALUES (@title, @body_markdown, @author_user_id, @visibility)'
  );
  const insertEvent = db.prepare(
    'INSERT INTO events (title, description_markdown, starts_at, ends_at, location_text, created_by_user_id, visibility) VALUES (@title, @description_markdown, @starts_at, @ends_at, @location_text, @created_by_user_id, @visibility)'
  );

  const adminInfo = insertUser.run({
    email: 'admin@example.com',
    password_hash: adminPasswordHash,
    display_name: 'VITA Admin'
  });

  const adminUserId = adminInfo.lastInsertRowid;
  insertRole.run({ user_id: adminUserId, role: 'admin' });
  insertRole.run({ user_id: adminUserId, role: 'member' });

  insertDoctrine.run({
    slug: 'mandate',
    title: 'Mandate',
    body_markdown: `# Mandate\n\nWe exist to keep VITA aligned with the Frontier doctrine.\n\n- Maintain readiness\n- Preserve knowledge\n- Protect the tribe`
  });

  insertDoctrine.run({
    slug: 'burn-protocol',
    title: 'Burn Protocol',
    body_markdown: `# Burn Protocol\n\nIf compromise is detected:\n1. Secure comms\n2. Verify chain of command\n3. Isolate compromised nodes\n4. Execute fallback routes`
  });

  insertDoctrine.run({
    slug: 'code-of-conduct',
    title: 'Code of Conduct',
    body_markdown: `# Code of Conduct\n\n- Respect the tribe\n- No leaks\n- Debrief after every op\n- Challenge complacency`
  });

  insertAar.run({
    title: 'The Explosion We Allowed',
    body_markdown: `## Summary\nA controlled detonation that taught us to double-check ordnance placement.\n\n**Takeaways**\n- Redundancy matters\n- Over-communicate safety steps\n- Validate supply chain inputs`,
    author_user_id: adminUserId,
    visibility: 'public'
  });

  insertEvent.run({
    title: 'Clinic / Briefing',
    description_markdown: `Weekly sync on doctrine updates and upcoming ops.\n\n- Q&A\n- Role refreshers\n- Open floor`,
    starts_at: new Date().toISOString(),
    ends_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    location_text: 'Signal // VITA Ops Channel',
    created_by_user_id: adminUserId,
    visibility: 'public'
  });
}
