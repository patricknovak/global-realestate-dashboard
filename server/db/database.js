/**
 * Database initialization module
 * Creates/opens SQLite database and runs schema migrations.
 */

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const DB_PATH = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : path.join(__dirname, 'dashboard.db');

// Ensure the directory for the database file exists
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

let db;

function getDatabase() {
  if (db) return db;

  db = new Database(DB_PATH, {
    verbose: process.env.NODE_ENV === 'development' ? console.log : null,
  });

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL');
  // Enable foreign key enforcement
  db.pragma('foreign_keys = ON');

  // Run schema to create tables if they don't exist
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf-8');

  // Split schema into individual statements and execute each separately.
  // This prevents a single failing statement (e.g., index on a column
  // that hasn't been migrated yet) from blocking the entire schema.
  const statements = schema
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  for (const stmt of statements) {
    try {
      db.exec(stmt);
    } catch (err) {
      // Log but don't crash — allows server to start even with pending migrations
      if (!err.message.includes('already exists')) {
        console.warn(`[DB] Schema statement skipped: ${err.message}`);
      }
    }
  }

  // Run migration for jurisdiction columns if needed
  try {
    const { migrate } = require('./migrate-001-jurisdiction');
    const info = db.pragma('table_info(listings)');
    if (!info.some((col) => col.name === 'jurisdiction')) {
      migrate();
    }
  } catch {
    // Migration already applied or not needed
  }

  console.log(`[DB] SQLite database initialized at ${DB_PATH}`);
  return db;
}

/**
 * Close the database connection gracefully.
 * Call this on process shutdown.
 */
function closeDatabase() {
  if (db) {
    db.close();
    db = null;
    console.log('[DB] Database connection closed.');
  }
}

module.exports = { getDatabase, closeDatabase };
