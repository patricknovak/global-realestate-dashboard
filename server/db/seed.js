#!/usr/bin/env node

/**
 * Seed script - Populates the database from JSON data files.
 *
 * Reads data/listings.json and data/benchmarks.json, then:
 *   1. Inserts all listings (skips duplicates by addr + price)
 *   2. Creates initial price_history entries for each new listing
 *   3. Seeds neighborhood_data with realistic placeholder values
 *
 * Usage: npm run seed
 */

const path = require('path');
const fs = require('fs');

// Load env before database module
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

const { getDatabase, closeDatabase } = require('./database');

const LISTINGS_PATH = path.resolve(__dirname, '../../data/listings.json');
const BENCHMARKS_PATH = path.resolve(__dirname, '../../data/benchmarks.json');

function seed() {
  const db = getDatabase();

  console.log('[SEED] Starting database seed...');

  // ------------------------------------------------------------------
  // 1. Seed listings
  // ------------------------------------------------------------------
  if (!fs.existsSync(LISTINGS_PATH)) {
    console.error(`[SEED] listings.json not found at ${LISTINGS_PATH}`);
    process.exit(1);
  }

  const listingsData = JSON.parse(fs.readFileSync(LISTINGS_PATH, 'utf-8'));
  const listings = listingsData.listings || [];

  console.log(`[SEED] Found ${listings.length} listings in JSON file.`);

  const insertListing = db.prepare(`
    INSERT INTO listings (addr, price, beds, baths, sqft, type, lot, agent,
      neighborhood, dom, year_built, water_view, latitude, longitude, region,
      country, province_state, currency, jurisdiction,
      source, status)
    VALUES (@addr, @price, @beds, @baths, @sqft, @type, @lot, @agent,
      @neighborhood, @dom, @year_built, @water_view, @latitude, @longitude, @region,
      @country, @province_state, @currency, @jurisdiction,
      'manual', 'active')
  `);

  const checkDuplicate = db.prepare(`
    SELECT id FROM listings WHERE addr = @addr AND price = @price
  `);

  const insertPriceHistory = db.prepare(`
    INSERT INTO price_history (listing_id, price, change_type)
    VALUES (@listing_id, @price, 'initial')
  `);

  let inserted = 0;
  let skipped = 0;

  const seedListings = db.transaction(() => {
    for (const listing of listings) {
      const params = {
        addr: listing.addr,
        price: listing.price,
        beds: listing.beds || null,
        baths: listing.baths || null,
        sqft: listing.sqft || null,
        type: listing.type || null,
        lot: listing.lot || null,
        agent: listing.agent || null,
        neighborhood: listing.neighborhood || null,
        dom: listing.dom || null,
        year_built: listing.yearBuilt || null,
        water_view: listing.waterView ? 1 : 0,
        latitude: listing.latitude || null,
        longitude: listing.longitude || null,
        region: listing.region || null,
        country: listing.country || 'CA',
        province_state: listing.provinceState || 'BC',
        currency: listing.currency || 'CAD',
        jurisdiction: listing.jurisdiction || 'CA-BC',
      };

      // Skip duplicates (same address and price)
      const existing = checkDuplicate.get({ addr: params.addr, price: params.price });
      if (existing) {
        skipped++;
        continue;
      }

      const result = insertListing.run(params);
      const listingId = result.lastInsertRowid;

      // Create initial price history entry
      insertPriceHistory.run({ listing_id: listingId, price: params.price });
      inserted++;
    }
  });

  seedListings();
  console.log(`[SEED] Listings: ${inserted} inserted, ${skipped} skipped (duplicates).`);

  // ------------------------------------------------------------------
  // 2. Seed neighborhood enrichment data
  // ------------------------------------------------------------------
  const neighborhoods = listingsData.metadata?.neighborhoods || [];

  // Realistic placeholder enrichment data per neighborhood
  const neighborhoodEnrichment = {
    'White Rock': {
      region: 'South Surrey / White Rock',
      walk_score: 72,
      transit_score: 42,
      bike_score: 55,
      schools_nearby: JSON.stringify(['Earl Marriott Secondary', 'White Rock Elementary', 'Semiahmoo Secondary']),
      amenities: JSON.stringify(['White Rock Beach', 'White Rock Pier', 'Memorial Park', 'Johnston Road shops']),
      avg_household_income: 95000,
      population: 21000,
      crime_rate_index: 18.5,
      parks_nearby: 12,
      grocery_stores_nearby: 8,
      restaurants_nearby: 45,
    },
    'Crescent Beach': {
      region: 'South Surrey / White Rock',
      walk_score: 38,
      transit_score: 22,
      bike_score: 40,
      schools_nearby: JSON.stringify(['Crescent Park Elementary', 'Earl Marriott Secondary']),
      amenities: JSON.stringify(['Crescent Beach', 'Blackie Spit Park', 'Dunsmuir Farm Garden']),
      avg_household_income: 120000,
      population: 3500,
      crime_rate_index: 8.2,
      parks_nearby: 6,
      grocery_stores_nearby: 2,
      restaurants_nearby: 12,
    },
    'Morgan Creek': {
      region: 'South Surrey / White Rock',
      walk_score: 28,
      transit_score: 25,
      bike_score: 35,
      schools_nearby: JSON.stringify(['Rosemary Heights Elementary', 'Morgan Elementary', 'Sullivan Heights Secondary']),
      amenities: JSON.stringify(['Morgan Creek Golf Course', 'South Point Exchange', 'Morgan Crossing']),
      avg_household_income: 145000,
      population: 12000,
      crime_rate_index: 10.3,
      parks_nearby: 8,
      grocery_stores_nearby: 5,
      restaurants_nearby: 25,
    },
    'Grandview Heights': {
      region: 'South Surrey / White Rock',
      walk_score: 35,
      transit_score: 30,
      bike_score: 38,
      schools_nearby: JSON.stringify(['Grandview Heights Elementary', 'Southridge School', 'Semiahmoo Secondary']),
      amenities: JSON.stringify(['Grandview Corners', 'South Surrey Athletic Park', 'Bakerview Park']),
      avg_household_income: 130000,
      population: 18000,
      crime_rate_index: 12.1,
      parks_nearby: 10,
      grocery_stores_nearby: 6,
      restaurants_nearby: 30,
    },
    'King George Corridor': {
      region: 'South Surrey / White Rock',
      walk_score: 45,
      transit_score: 48,
      bike_score: 42,
      schools_nearby: JSON.stringify(['King George Secondary', 'Jessie Lee Elementary', 'Peace Arch Elementary']),
      amenities: JSON.stringify(['King George Hub', 'South Surrey Recreation Centre', 'Sunnyside Mall']),
      avg_household_income: 88000,
      population: 22000,
      crime_rate_index: 20.5,
      parks_nearby: 7,
      grocery_stores_nearby: 6,
      restaurants_nearby: 28,
    },
    'Pacific Douglas': {
      region: 'South Surrey / White Rock',
      walk_score: 25,
      transit_score: 18,
      bike_score: 30,
      schools_nearby: JSON.stringify(['Pacific Academy', 'Douglas Elementary']),
      amenities: JSON.stringify(['Campbell Valley Regional Park', 'Hazelmere Golf Course']),
      avg_household_income: 105000,
      population: 5000,
      crime_rate_index: 9.8,
      parks_nearby: 5,
      grocery_stores_nearby: 2,
      restaurants_nearby: 8,
    },
    'Elgin Chantrell': {
      region: 'South Surrey / White Rock',
      walk_score: 22,
      transit_score: 15,
      bike_score: 28,
      schools_nearby: JSON.stringify(['Chantrell Creek Elementary', 'Elgin Park Secondary', 'Southridge School']),
      amenities: JSON.stringify(['Crescent Park', 'Elgin Heritage Park', 'Nicomekl River trails']),
      avg_household_income: 160000,
      population: 8000,
      crime_rate_index: 7.5,
      parks_nearby: 9,
      grocery_stores_nearby: 3,
      restaurants_nearby: 10,
    },
    'Sunnyside Park': {
      region: 'South Surrey / White Rock',
      walk_score: 42,
      transit_score: 32,
      bike_score: 38,
      schools_nearby: JSON.stringify(['Sunnyside Elementary', 'Semiahmoo Secondary']),
      amenities: JSON.stringify(['Sunnyside Park', 'South Surrey Indoor Pool', 'Semiahmoo Mall']),
      avg_household_income: 92000,
      population: 10000,
      crime_rate_index: 15.2,
      parks_nearby: 6,
      grocery_stores_nearby: 4,
      restaurants_nearby: 18,
    },
    'Ocean Park': {
      region: 'South Surrey / White Rock',
      walk_score: 40,
      transit_score: 28,
      bike_score: 45,
      schools_nearby: JSON.stringify(['Ocean Park Elementary', 'Semiahmoo Secondary', 'Southridge School']),
      amenities: JSON.stringify(['Ocean Park village shops', 'Ruth Johnson Park', 'Ocean Park Library']),
      avg_household_income: 110000,
      population: 7500,
      crime_rate_index: 11.0,
      parks_nearby: 8,
      grocery_stores_nearby: 3,
      restaurants_nearby: 15,
    },
    'Hazelmere': {
      region: 'South Surrey / White Rock',
      walk_score: 12,
      transit_score: 8,
      bike_score: 20,
      schools_nearby: JSON.stringify(['Hazelmere Elementary', 'Pacific Academy']),
      amenities: JSON.stringify(['Hazelmere Golf & Tennis', 'Campbell Valley Regional Park', 'Redwood Park']),
      avg_household_income: 135000,
      population: 4000,
      crime_rate_index: 6.2,
      parks_nearby: 4,
      grocery_stores_nearby: 1,
      restaurants_nearby: 5,
    },
    'Parksville': {
      region: 'Vancouver Island',
      walk_score: 55,
      transit_score: 20,
      bike_score: 48,
      schools_nearby: JSON.stringify(['Ballenas Secondary', 'Parksville Elementary', 'Springwood Middle']),
      amenities: JSON.stringify(['Rathtrevor Beach', 'Community Beach', 'Parksville Outdoor Theatre', 'Craig Heritage Park']),
      avg_household_income: 72000,
      population: 13500,
      crime_rate_index: 22.0,
      parks_nearby: 10,
      grocery_stores_nearby: 5,
      restaurants_nearby: 35,
    },
    'Qualicum Beach': {
      region: 'Vancouver Island',
      walk_score: 50,
      transit_score: 15,
      bike_score: 42,
      schools_nearby: JSON.stringify(['Qualicum Beach Middle', 'Kwalikum Secondary', 'Arrowview Elementary']),
      amenities: JSON.stringify(['Qualicum Beach', 'Heritage Forest', 'Milner Gardens', 'Old School House Art Centre']),
      avg_household_income: 68000,
      population: 9000,
      crime_rate_index: 14.8,
      parks_nearby: 8,
      grocery_stores_nearby: 3,
      restaurants_nearby: 22,
    },
    'Nanoose Bay': {
      region: 'Vancouver Island',
      walk_score: 15,
      transit_score: 5,
      bike_score: 22,
      schools_nearby: JSON.stringify(['Randerson Ridge Elementary', 'Ballenas Secondary']),
      amenities: JSON.stringify(['Moorecroft Regional Park', 'Beachcomber Marina', 'Notch Hill trails']),
      avg_household_income: 85000,
      population: 5500,
      crime_rate_index: 10.5,
      parks_nearby: 5,
      grocery_stores_nearby: 1,
      restaurants_nearby: 6,
    },
    'Lantzville': {
      region: 'Vancouver Island',
      walk_score: 20,
      transit_score: 10,
      bike_score: 25,
      schools_nearby: JSON.stringify(['Lantzville Elementary', 'Aspengrove School', 'Dover Bay Secondary']),
      amenities: JSON.stringify(['Copley Ridge Trail', 'Lantzville Beach', 'Foothills Community Park']),
      avg_household_income: 90000,
      population: 4000,
      crime_rate_index: 9.0,
      parks_nearby: 6,
      grocery_stores_nearby: 1,
      restaurants_nearby: 5,
    },
    'Nanaimo': {
      region: 'Vancouver Island',
      walk_score: 62,
      transit_score: 38,
      bike_score: 52,
      schools_nearby: JSON.stringify(['Nanaimo District Secondary', 'John Barsby Secondary', 'VIU (University)', 'Pauline Haarer Elementary']),
      amenities: JSON.stringify(['Departure Bay Beach', 'Harbourfront Walkway', 'Woodgrove Centre', 'Bowen Park', 'Port Theatre']),
      avg_household_income: 78000,
      population: 99000,
      crime_rate_index: 45.2,
      parks_nearby: 25,
      grocery_stores_nearby: 12,
      restaurants_nearby: 85,
    },
    'Courtenay': {
      region: 'Vancouver Island',
      walk_score: 58,
      transit_score: 22,
      bike_score: 50,
      schools_nearby: JSON.stringify(['GP Vanier Secondary', 'Courtenay Elementary', 'Lake Trail Middle', 'NIC (College)']),
      amenities: JSON.stringify(['Lewis Park', 'Courtenay Riverway', 'Crown Isle Golf Resort', 'Driftwood Mall']),
      avg_household_income: 74000,
      population: 28000,
      crime_rate_index: 32.1,
      parks_nearby: 14,
      grocery_stores_nearby: 6,
      restaurants_nearby: 42,
    },
    'Comox': {
      region: 'Vancouver Island',
      walk_score: 48,
      transit_score: 18,
      bike_score: 45,
      schools_nearby: JSON.stringify(['Highland Secondary', 'Comox Elementary', 'Brooklyn Elementary']),
      amenities: JSON.stringify(['Comox Marina', 'Filberg Heritage Lodge', 'Goose Spit Park', 'Comox Golf Club']),
      avg_household_income: 82000,
      population: 15000,
      crime_rate_index: 18.3,
      parks_nearby: 10,
      grocery_stores_nearby: 4,
      restaurants_nearby: 28,
    },
    'Cumberland': {
      region: 'Vancouver Island',
      walk_score: 60,
      transit_score: 12,
      bike_score: 70,
      schools_nearby: JSON.stringify(['Cumberland Community School', 'Lake Trail Middle']),
      amenities: JSON.stringify(['Cumberland Forest trails', 'Village Park', 'Coal Creek Historic Park', 'Jump Creek bike park']),
      avg_household_income: 70000,
      population: 4400,
      crime_rate_index: 14.0,
      parks_nearby: 8,
      grocery_stores_nearby: 2,
      restaurants_nearby: 12,
    },
    'Campbell River': {
      region: 'Vancouver Island',
      walk_score: 52,
      transit_score: 20,
      bike_score: 40,
      schools_nearby: JSON.stringify(['Carihi Secondary', 'Timberline Secondary', 'Campbell River Christian School', 'NIC Campbell River campus']),
      amenities: JSON.stringify(['Discovery Pier', 'Elk Falls Provincial Park', 'Quinsam Salmon Hatchery', 'Tidemark Theatre']),
      avg_household_income: 76000,
      population: 35000,
      crime_rate_index: 38.5,
      parks_nearby: 18,
      grocery_stores_nearby: 7,
      restaurants_nearby: 50,
    },
  };

  const insertNeighborhood = db.prepare(`
    INSERT OR IGNORE INTO neighborhood_data
      (neighborhood, region, walk_score, transit_score, bike_score,
       schools_nearby, amenities, avg_household_income, population,
       crime_rate_index, parks_nearby, grocery_stores_nearby, restaurants_nearby)
    VALUES
      (@neighborhood, @region, @walk_score, @transit_score, @bike_score,
       @schools_nearby, @amenities, @avg_household_income, @population,
       @crime_rate_index, @parks_nearby, @grocery_stores_nearby, @restaurants_nearby)
  `);

  const seedNeighborhoods = db.transaction(() => {
    let neighborhoodCount = 0;
    for (const [name, data] of Object.entries(neighborhoodEnrichment)) {
      insertNeighborhood.run({ neighborhood: name, ...data });
      neighborhoodCount++;
    }
    console.log(`[SEED] Neighborhood data: ${neighborhoodCount} neighborhoods seeded.`);
  });

  seedNeighborhoods();

  // ------------------------------------------------------------------
  // Done
  // ------------------------------------------------------------------
  console.log('[SEED] Database seed completed successfully.');
  closeDatabase();
}

// Run if called directly
if (require.main === module) {
  try {
    seed();
  } catch (err) {
    console.error('[SEED] Error:', err.message);
    closeDatabase();
    process.exit(1);
  }
}

module.exports = { seed };
