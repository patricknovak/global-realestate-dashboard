-- Global Real Estate Dashboard - Database Schema
-- SQLite3 with better-sqlite3

-- Listings with all current fields plus data freshness tracking
CREATE TABLE IF NOT EXISTS listings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    addr TEXT NOT NULL,
    price REAL NOT NULL,
    beds INTEGER,
    baths INTEGER,
    sqft INTEGER,
    type TEXT,
    lot TEXT,
    agent TEXT,
    neighborhood TEXT,
    dom INTEGER,
    year_built INTEGER,
    water_view BOOLEAN DEFAULT 0,
    latitude REAL,
    longitude REAL,
    region TEXT,
    -- Data freshness fields
    source TEXT DEFAULT 'manual',
    source_url TEXT,
    scraped_at TEXT,
    verified_at TEXT,
    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'sold', 'delisted', 'price_changed', 'flagged')),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Price history tracking
CREATE TABLE IF NOT EXISTS price_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    listing_id INTEGER NOT NULL,
    price REAL NOT NULL,
    change_date TEXT DEFAULT (datetime('now')),
    change_type TEXT CHECK(change_type IN ('initial', 'increase', 'decrease', 'sold')),
    FOREIGN KEY (listing_id) REFERENCES listings(id)
);

-- Comparable sales (sold properties for comparison)
CREATE TABLE IF NOT EXISTS comparable_sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    addr TEXT NOT NULL,
    sold_price REAL NOT NULL,
    original_price REAL,
    beds INTEGER,
    baths INTEGER,
    sqft INTEGER,
    type TEXT,
    neighborhood TEXT,
    region TEXT,
    sold_date TEXT,
    dom_at_sale INTEGER,
    latitude REAL,
    longitude REAL,
    source TEXT DEFAULT 'manual',
    created_at TEXT DEFAULT (datetime('now'))
);

-- Community data corrections/flags
CREATE TABLE IF NOT EXISTS community_flags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    listing_id INTEGER NOT NULL,
    flag_type TEXT CHECK(flag_type IN ('sold', 'price_wrong', 'delisted', 'info_incorrect', 'duplicate')),
    reported_value TEXT,
    notes TEXT,
    reporter_id TEXT,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'verified', 'dismissed')),
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (listing_id) REFERENCES listings(id)
);

-- Viewing scheduler
CREATE TABLE IF NOT EXISTS viewings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    listing_id INTEGER NOT NULL,
    scheduled_date TEXT NOT NULL,
    scheduled_time TEXT NOT NULL,
    duration_minutes INTEGER DEFAULT 30,
    status TEXT DEFAULT 'scheduled' CHECK(status IN ('scheduled', 'completed', 'cancelled', 'rescheduled')),
    notes TEXT,
    agent_name TEXT,
    agent_phone TEXT,
    agent_email TEXT,
    rating INTEGER,
    feedback TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (listing_id) REFERENCES listings(id)
);

-- Document vault
CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    listing_id INTEGER,
    title TEXT NOT NULL,
    doc_type TEXT CHECK(doc_type IN ('inspection', 'title_search', 'strata_docs', 'disclosure', 'appraisal', 'contract', 'other')),
    file_name TEXT,
    file_path TEXT,
    file_size INTEGER,
    mime_type TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

-- Users table (prepared, not enforced yet)
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    password_hash TEXT,
    name TEXT,
    role TEXT DEFAULT 'buyer' CHECK(role IN ('buyer', 'admin', 'agent')),
    preferences TEXT, -- JSON blob
    created_at TEXT DEFAULT (datetime('now')),
    last_login TEXT
);

-- Saved searches for future email alerts
CREATE TABLE IF NOT EXISTS saved_searches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    name TEXT,
    criteria TEXT NOT NULL, -- JSON of filter criteria
    notify_email TEXT,
    is_active BOOLEAN DEFAULT 1,
    last_notified TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

-- Scrape jobs tracking
CREATE TABLE IF NOT EXISTS scrape_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    region TEXT,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'running', 'completed', 'failed')),
    listings_found INTEGER DEFAULT 0,
    listings_new INTEGER DEFAULT 0,
    listings_updated INTEGER DEFAULT 0,
    error_message TEXT,
    started_at TEXT,
    completed_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

-- Neighborhood enrichment data
CREATE TABLE IF NOT EXISTS neighborhood_data (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    neighborhood TEXT NOT NULL UNIQUE,
    region TEXT,
    walk_score INTEGER,
    transit_score INTEGER,
    bike_score INTEGER,
    schools_nearby TEXT, -- JSON array
    amenities TEXT, -- JSON array
    avg_household_income REAL,
    population INTEGER,
    crime_rate_index REAL,
    parks_nearby INTEGER,
    grocery_stores_nearby INTEGER,
    restaurants_nearby INTEGER,
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_listings_region ON listings(region);
CREATE INDEX IF NOT EXISTS idx_listings_neighborhood ON listings(neighborhood);
CREATE INDEX IF NOT EXISTS idx_listings_status ON listings(status);
CREATE INDEX IF NOT EXISTS idx_price_history_listing ON price_history(listing_id);
CREATE INDEX IF NOT EXISTS idx_comparable_sales_neighborhood ON comparable_sales(neighborhood);
CREATE INDEX IF NOT EXISTS idx_viewings_date ON viewings(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_documents_listing ON documents(listing_id);
