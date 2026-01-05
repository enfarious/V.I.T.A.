const migrations = [
  {
    name: '001_create_tribe_members',
    async up(db, schema) {
      await db.raw(`
        CREATE TABLE IF NOT EXISTS ${schema}.tribe_members (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          character_name VARCHAR(100),
          wallet_address VARCHAR(100),
          avatar_url TEXT,
          rank_id INTEGER,
          rank_order INTEGER DEFAULT 999,
          status VARCHAR(20) DEFAULT 'active',
          joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          notes TEXT,
          UNIQUE(user_id)
        )
      `);
    }
  },
  {
    name: '002_create_tribe_ranks',
    async up(db, schema) {
      await db.raw(`
        CREATE TABLE IF NOT EXISTS ${schema}.tribe_ranks (
          id SERIAL PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          permissions JSONB DEFAULT '[]',
          rank_order INTEGER DEFAULT 999,
          color VARCHAR(7),
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      await db.raw(`
        INSERT INTO ${schema}.tribe_ranks (name, rank_order, permissions)
        VALUES 
          ('Chief', 1, '["manage_members", "manage_ranks", "manage_settings"]'),
          ('Officer', 10, '["manage_members"]'),
          ('Member', 100, '[]')
        ON CONFLICT DO NOTHING
      `).catch(() => {});
      
      await db.raw(`
        ALTER TABLE ${schema}.tribe_members
        ADD CONSTRAINT fk_rank
        FOREIGN KEY (rank_id) REFERENCES ${schema}.tribe_ranks(id)
        ON DELETE SET NULL
      `).catch(() => {});
    }
  },
  {
    name: '003_create_access_lists',
    async up(db, schema) {
      await db.raw(`
        CREATE TABLE IF NOT EXISTS ${schema}.access_lists (
          id SERIAL PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          description TEXT,
          entries JSONB DEFAULT '[]',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
    }
  },
  {
    name: '004_create_tribe_settings',
    async up(db, schema) {
      await db.raw(`
        CREATE TABLE IF NOT EXISTS ${schema}.tribe_settings (
          id SERIAL PRIMARY KEY,
          visibility VARCHAR(20) DEFAULT 'public',
          join_policy VARCHAR(20) DEFAULT 'approval',
          custom_fields JSONB DEFAULT '{}',
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
      
      await db.raw(`
        INSERT INTO ${schema}.tribe_settings (visibility, join_policy)
        VALUES ('public', 'approval')
        ON CONFLICT DO NOTHING
      `).catch(() => {});
    }
  },
  {
    name: '005_create_join_requests',
    async up(db, schema) {
      await db.raw(`
        CREATE TABLE IF NOT EXISTS ${schema}.join_requests (
          id SERIAL PRIMARY KEY,
          user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
          character_name VARCHAR(100) NOT NULL,
          wallet_address VARCHAR(100),
          note TEXT,
          status VARCHAR(20) DEFAULT 'pending',
          reviewed_by INTEGER REFERENCES users(id),
          reviewed_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(user_id)
        )
      `);
    }
  }
];

export default migrations;
