#!/usr/bin/env node
/**
 * Migration 001 - Add jurisdiction columns to listings and comparable_sales.
 * Backfills existing data with CA/BC/CAD defaults and seeds the jurisdictions table.
 *
 * Usage: node server/db/migrate-001-jurisdiction.js
 */

'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const { getDatabase, closeDatabase } = require('./database');

function migrate() {
  const db = getDatabase();

  console.log('[MIGRATE-001] Starting jurisdiction migration...');

  // Helper: check if column exists
  function columnExists(table, column) {
    const info = db.pragma(`table_info(${table})`);
    return info.some(col => col.name === column);
  }

  // 1. Add columns to listings
  if (!columnExists('listings', 'country')) {
    db.exec(`ALTER TABLE listings ADD COLUMN country TEXT DEFAULT 'CA'`);
    console.log('[MIGRATE-001] Added listings.country');
  }
  if (!columnExists('listings', 'province_state')) {
    db.exec(`ALTER TABLE listings ADD COLUMN province_state TEXT DEFAULT 'BC'`);
    console.log('[MIGRATE-001] Added listings.province_state');
  }
  if (!columnExists('listings', 'currency')) {
    db.exec(`ALTER TABLE listings ADD COLUMN currency TEXT DEFAULT 'CAD'`);
    console.log('[MIGRATE-001] Added listings.currency');
  }
  if (!columnExists('listings', 'jurisdiction')) {
    db.exec(`ALTER TABLE listings ADD COLUMN jurisdiction TEXT DEFAULT 'CA-BC'`);
    console.log('[MIGRATE-001] Added listings.jurisdiction');
  }

  // 2. Add columns to comparable_sales
  if (!columnExists('comparable_sales', 'country')) {
    db.exec(`ALTER TABLE comparable_sales ADD COLUMN country TEXT DEFAULT 'CA'`);
    console.log('[MIGRATE-001] Added comparable_sales.country');
  }
  if (!columnExists('comparable_sales', 'province_state')) {
    db.exec(`ALTER TABLE comparable_sales ADD COLUMN province_state TEXT DEFAULT 'BC'`);
    console.log('[MIGRATE-001] Added comparable_sales.province_state');
  }
  if (!columnExists('comparable_sales', 'currency')) {
    db.exec(`ALTER TABLE comparable_sales ADD COLUMN currency TEXT DEFAULT 'CAD'`);
    console.log('[MIGRATE-001] Added comparable_sales.currency');
  }
  if (!columnExists('comparable_sales', 'jurisdiction')) {
    db.exec(`ALTER TABLE comparable_sales ADD COLUMN jurisdiction TEXT DEFAULT 'CA-BC'`);
    console.log('[MIGRATE-001] Added comparable_sales.jurisdiction');
  }

  // 3. Backfill existing rows
  db.exec(`UPDATE listings SET country = 'CA', province_state = 'BC', currency = 'CAD', jurisdiction = 'CA-BC' WHERE country IS NULL OR country = 'CA'`);
  db.exec(`UPDATE comparable_sales SET country = 'CA', province_state = 'BC', currency = 'CAD', jurisdiction = 'CA-BC' WHERE country IS NULL OR country = 'CA'`);
  console.log('[MIGRATE-001] Backfilled existing data with CA/BC/CAD defaults');

  // 4. Create jurisdictions table
  db.exec(`
    CREATE TABLE IF NOT EXISTS jurisdictions (
      code TEXT PRIMARY KEY,
      country TEXT NOT NULL,
      province_state TEXT NOT NULL,
      currency TEXT NOT NULL DEFAULT 'CAD',
      display_name TEXT NOT NULL,
      transfer_tax_name TEXT,
      has_rescission BOOLEAN DEFAULT 0,
      rescission_days INTEGER DEFAULT 0,
      rescission_fee_pct REAL DEFAULT 0,
      rescission_notes TEXT,
      offer_template_type TEXT DEFAULT 'generic',
      governing_law TEXT,
      legal_notes TEXT
    )
  `);

  // 5. Seed jurisdictions
  const insertJurisdiction = db.prepare(`
    INSERT OR REPLACE INTO jurisdictions (code, country, province_state, currency, display_name, transfer_tax_name, has_rescission, rescission_days, rescission_fee_pct, rescission_notes, offer_template_type, governing_law, legal_notes)
    VALUES (@code, @country, @province_state, @currency, @display_name, @transfer_tax_name, @has_rescission, @rescission_days, @rescission_fee_pct, @rescission_notes, @offer_template_type, @governing_law, @legal_notes)
  `);

  const jurisdictions = [
    { code: 'CA-BC', country: 'CA', province_state: 'BC', currency: 'CAD', display_name: 'British Columbia', transfer_tax_name: 'BC Property Transfer Tax', has_rescission: 1, rescission_days: 3, rescission_fee_pct: 0.25, rescission_notes: '3 business days, 0.25% fee per HBRP', offer_template_type: 'bc', governing_law: 'Province of British Columbia', legal_notes: 'BCREA Contract of Purchase and Sale (Form B). Have a BC lawyer or notary review any offer.' },
    { code: 'CA-AB', country: 'CA', province_state: 'AB', currency: 'CAD', display_name: 'Alberta', transfer_tax_name: 'Land Title Registration Fee', has_rescission: 0, rescission_days: 0, rescission_fee_pct: 0, rescission_notes: 'No statutory rescission period', offer_template_type: 'ab', governing_law: 'Province of Alberta', legal_notes: 'Alberta Real Estate Association standard forms. Have an Alberta lawyer review any offer.' },
    { code: 'CA-ON', country: 'CA', province_state: 'ON', currency: 'CAD', display_name: 'Ontario', transfer_tax_name: 'Ontario Land Transfer Tax', has_rescission: 1, rescission_days: 10, rescission_fee_pct: 0, rescission_notes: '10-day cooling-off for pre-construction condos only', offer_template_type: 'on', governing_law: 'Province of Ontario', legal_notes: 'Ontario Real Estate Association Agreement of Purchase and Sale. Have an Ontario lawyer review any offer.' },
    { code: 'US-CA', country: 'US', province_state: 'CA', currency: 'USD', display_name: 'California', transfer_tax_name: 'County Transfer Tax', has_rescission: 0, rescission_days: 0, rescission_fee_pct: 0, rescission_notes: 'No statutory rescission period', offer_template_type: 'us-ca', governing_law: 'State of California', legal_notes: 'California Association of Realtors Residential Purchase Agreement. Have a California attorney review any offer.' },
  ];

  for (const j of jurisdictions) {
    insertJurisdiction.run(j);
  }
  console.log('[MIGRATE-001] Seeded jurisdictions table');

  // 6. Add indexes
  db.exec(`CREATE INDEX IF NOT EXISTS idx_listings_jurisdiction ON listings(jurisdiction)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_listings_country ON listings(country)`);
  console.log('[MIGRATE-001] Created indexes');

  console.log('[MIGRATE-001] Migration completed successfully.');
  closeDatabase();
}

if (require.main === module) {
  try {
    migrate();
  } catch (err) {
    console.error('[MIGRATE-001] Error:', err.message);
    closeDatabase();
    process.exit(1);
  }
}

module.exports = { migrate };
