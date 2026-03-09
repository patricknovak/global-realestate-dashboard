#!/usr/bin/env node
/**
 * merger.js - Data merger for the Global Real Estate Dashboard
 *
 * Merges newly scraped listings with existing data:
 *   - Detects new listings (not in existing dataset)
 *   - Detects price changes and records to price_history
 *   - Detects removed listings (in existing but not in new scrape)
 *   - Applies conflict resolution (newer data wins, flags conflicts)
 *   - Creates backup of existing data before writing
 *   - Outputs the merged dataset
 *
 * Usage:
 *   node tools/scraper/merger.js [options]
 *
 * Options:
 *   --existing <path>   Path to existing listings file (default: ../../data/listings.json)
 *   --incoming <path>   Path to newly scraped listings file (required unless --from-scraper)
 *   --from-scraper      Use the last scraper output as incoming data
 *   --output <path>     Output path (default: overwrites existing)
 *   --no-backup         Skip creating a backup before merge
 *   --mark-removed      Mark removed listings as "possibly sold/delisted" instead of dropping
 *   --keep-removed <n>  Keep removed listings for n days before dropping (default: 14)
 *   --region <name>     Only merge listings in a specific region (scoped merge)
 *   --json              Output merge report as JSON
 *   --dry-run           Show what would change without writing
 *   --verbose           Detailed output
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SCRIPT_DIR = __dirname;

// ---------------------------------------------------------------------------
// Shared helpers (import from scraper if available, otherwise inline)
// ---------------------------------------------------------------------------

let scraperUtils;
try {
  scraperUtils = require('./scraper');
} catch {
  // Inline versions if scraper.js cannot be loaded
  scraperUtils = {
    normalizeAddress(addr) {
      if (!addr) return '';
      return addr
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\b(st|street|ave|avenue|rd|road|dr|drive|blvd|boulevard|cres|crescent|ct|court|ln|lane|way|pl|place|cir|circle)\b/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    },
    addressesSimilar(addr1, addr2) {
      const n1 = scraperUtils.normalizeAddress(addr1);
      const n2 = scraperUtils.normalizeAddress(addr2);
      return n1 === n2 || n1.includes(n2) || n2.includes(n1);
    },
  };
}

const { normalizeAddress, addressesSimilar } = scraperUtils;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

function loadConfig() {
  const configPath = path.join(SCRIPT_DIR, 'config.json');
  if (!fs.existsSync(configPath)) {
    console.error(`Config file not found: ${configPath}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    existing: null,
    incoming: null,
    fromScraper: false,
    output: null,
    backup: true,
    markRemoved: false,
    keepRemovedDays: 14,
    region: null,
    json: false,
    dryRun: false,
    verbose: false,
  };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--existing':
        opts.existing = args[++i];
        break;
      case '--incoming':
        opts.incoming = args[++i];
        break;
      case '--from-scraper':
        opts.fromScraper = true;
        break;
      case '--output':
        opts.output = args[++i];
        break;
      case '--no-backup':
        opts.backup = false;
        break;
      case '--mark-removed':
        opts.markRemoved = true;
        break;
      case '--keep-removed':
        opts.keepRemovedDays = parseInt(args[++i], 10) || 14;
        break;
      case '--region':
        opts.region = args[++i];
        break;
      case '--json':
        opts.json = true;
        break;
      case '--dry-run':
        opts.dryRun = true;
        break;
      case '--verbose':
        opts.verbose = true;
        break;
    }
  }
  return opts;
}

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function verbose(msg, opts) {
  if (opts && opts.verbose) {
    console.log(`[${new Date().toISOString()}] DEBUG: ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// File I/O
// ---------------------------------------------------------------------------

function loadListingsFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  try {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return data;
  } catch (err) {
    console.error(`Failed to parse ${filePath}: ${err.message}`);
    return null;
  }
}

function createBackup(filePath, backupDir) {
  if (!fs.existsSync(filePath)) return null;
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  const ts = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(backupDir, `listings-pre-merge-${ts}.json`);
  fs.copyFileSync(filePath, backupFile);
  log(`Backup created: ${backupFile}`);
  return backupFile;
}

// ---------------------------------------------------------------------------
// Merge logic
// ---------------------------------------------------------------------------

/**
 * Build an index of listings by normalized address for fast lookup.
 */
function buildAddressIndex(listings) {
  const index = new Map();
  for (let i = 0; i < listings.length; i++) {
    const norm = normalizeAddress(listings[i].addr);
    if (norm) {
      if (!index.has(norm)) {
        index.set(norm, []);
      }
      index.get(norm).push(i);
    }
  }
  return index;
}

/**
 * Find the best match for a listing in the existing dataset.
 * Returns the index into existingListings, or -1 if no match.
 */
function findMatch(listing, existingListings, existingIndex) {
  const norm = normalizeAddress(listing.addr);

  // Exact normalized address match
  if (existingIndex.has(norm)) {
    const indices = existingIndex.get(norm);
    return indices[0]; // Return first match
  }

  // Fuzzy match (slower, only used when exact fails)
  for (let i = 0; i < existingListings.length; i++) {
    if (addressesSimilar(listing.addr, existingListings[i].addr)) {
      return i;
    }
  }

  return -1;
}

/**
 * Merge incoming listings with existing listings.
 * Returns the merged dataset and a detailed change log.
 */
function mergeListings(existingListings, incomingListings, opts) {
  const changeLog = {
    newListings: [],
    priceChanges: [],
    fieldUpdates: [],
    removedListings: [],
    conflicts: [],
    unchanged: 0,
    skippedByFilter: 0,
  };

  const existingIndex = buildAddressIndex(existingListings);
  const matchedExistingIndices = new Set();

  // Working copy of existing listings
  const merged = existingListings.map((l) => ({ ...l }));

  // Process each incoming listing
  for (const incoming of incomingListings) {
    // Region filter: only merge listings in the target region
    if (opts.region && incoming.region && !incoming.region.toLowerCase().includes(opts.region.toLowerCase())) {
      changeLog.skippedByFilter++;
      continue;
    }
    const matchIdx = findMatch(incoming, existingListings, existingIndex);

    if (matchIdx === -1) {
      // New listing - not in existing dataset
      const newListing = { ...incoming };
      newListing.firstSeen = new Date().toISOString();
      newListing.lastUpdated = new Date().toISOString();
      merged.push(newListing);
      changeLog.newListings.push({
        addr: incoming.addr,
        price: incoming.price,
        region: incoming.region,
        neighborhood: incoming.neighborhood,
        type: incoming.type,
      });
      verbose(`NEW: ${incoming.addr} ($${incoming.price?.toLocaleString()})`, opts);
    } else {
      matchedExistingIndices.add(matchIdx);
      const existing = merged[matchIdx];

      // Check for price change
      if (
        existing.price != null &&
        incoming.price != null &&
        existing.price !== incoming.price
      ) {
        // Record price history
        if (!existing.price_history) {
          existing.price_history = [];
        }
        existing.price_history.push({
          price: existing.price,
          date: existing.lastUpdated || new Date().toISOString(),
        });

        changeLog.priceChanges.push({
          addr: existing.addr,
          oldPrice: existing.price,
          newPrice: incoming.price,
          change: incoming.price - existing.price,
          changePercent: (
            ((incoming.price - existing.price) / existing.price) *
            100
          ).toFixed(1),
        });

        verbose(
          `PRICE CHANGE: ${existing.addr} $${existing.price.toLocaleString()} -> $${incoming.price.toLocaleString()}`,
          opts
        );
      }

      // Merge fields: newer data wins, but track conflicts
      const fieldsToMerge = [
        'price', 'beds', 'baths', 'sqft', 'type', 'lot', 'agent',
        'neighborhood', 'dom', 'yearBuilt', 'waterView',
        'latitude', 'longitude', 'region',
      ];

      let updated = false;
      for (const field of fieldsToMerge) {
        const oldVal = existing[field];
        const newVal = incoming[field];

        if (newVal != null && newVal !== oldVal) {
          // If existing had a value and incoming is different, record a conflict
          if (oldVal != null && field !== 'dom') {
            changeLog.conflicts.push({
              addr: existing.addr,
              field,
              oldValue: oldVal,
              newValue: newVal,
              resolution: 'newer_wins',
            });
          }
          existing[field] = newVal;
          updated = true;
        } else if (newVal != null && oldVal == null) {
          // Fill in missing data from incoming
          existing[field] = newVal;
          updated = true;
        }
      }

      if (updated) {
        existing.lastUpdated = new Date().toISOString();
        changeLog.fieldUpdates.push({ addr: existing.addr });
      } else {
        changeLog.unchanged++;
      }

      // Clear removal marking if the listing reappeared
      if (existing._removedAt) {
        delete existing._removedAt;
        delete existing._removalReason;
        verbose(`REAPPEARED: ${existing.addr}`, opts);
      }
    }
  }

  // Detect removed listings (in existing but not matched by incoming)
  for (let i = 0; i < existingListings.length; i++) {
    if (!matchedExistingIndices.has(i)) {
      const existing = merged[i];

      // When using a region filter, only flag removal for listings in the target region
      if (opts.region && existing.region && !existing.region.toLowerCase().includes(opts.region.toLowerCase())) {
        continue;
      }

      if (opts.markRemoved) {
        // Mark as potentially removed instead of dropping
        if (!existing._removedAt) {
          existing._removedAt = new Date().toISOString();
          existing._removalReason = 'not_found_in_scrape';
        }

        // Check if it's been removed for too long
        const removedAt = new Date(existing._removedAt);
        const daysSinceRemoved = (Date.now() - removedAt.getTime()) / (1000 * 60 * 60 * 24);

        if (daysSinceRemoved > opts.keepRemovedDays) {
          changeLog.removedListings.push({
            addr: existing.addr,
            price: existing.price,
            region: existing.region,
            reason: `Not seen for ${Math.round(daysSinceRemoved)} days (threshold: ${opts.keepRemovedDays})`,
            action: 'dropped',
          });
          merged[i] = null; // Mark for removal
        } else {
          changeLog.removedListings.push({
            addr: existing.addr,
            price: existing.price,
            region: existing.region,
            reason: 'Not found in latest scrape',
            action: 'marked_removed',
            daysSinceRemoved: Math.round(daysSinceRemoved),
          });
        }
      } else {
        changeLog.removedListings.push({
          addr: existing.addr,
          price: existing.price,
          region: existing.region,
          reason: 'Not found in latest scrape',
          action: 'kept_for_now',
        });
        // Keep it but note it was not refreshed
      }
    }
  }

  // Filter out null entries (dropped listings)
  const finalMerged = merged.filter((l) => l !== null);

  return { merged: finalMerged, changeLog };
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function generateMergeReport(changeLog, existingCount, incomingCount, mergedCount) {
  // Build region/jurisdiction breakdown of new listings
  const byRegion = {};
  for (const nl of changeLog.newListings) {
    const region = nl.region || 'Unknown';
    byRegion[region] = (byRegion[region] || 0) + 1;
  }

  return {
    timestamp: new Date().toISOString(),
    input: {
      existingListings: existingCount,
      incomingListings: incomingCount,
    },
    output: {
      mergedListings: mergedCount,
    },
    changes: {
      new: changeLog.newListings.length,
      priceChanges: changeLog.priceChanges.length,
      fieldUpdates: changeLog.fieldUpdates.length,
      removed: changeLog.removedListings.length,
      conflicts: changeLog.conflicts.length,
      unchanged: changeLog.unchanged,
      skippedByFilter: changeLog.skippedByFilter || 0,
    },
    newByRegion: byRegion,
    newListings: changeLog.newListings,
    priceChanges: changeLog.priceChanges,
    removedListings: changeLog.removedListings,
    conflicts: changeLog.conflicts.slice(0, 30),
  };
}

function printReport(report) {
  console.log('\n' + '='.repeat(70));
  console.log('  MERGE REPORT');
  console.log('='.repeat(70));
  console.log(`  Timestamp:          ${report.timestamp}`);
  console.log('');
  console.log('  INPUT');
  console.log(`  Existing listings:  ${report.input.existingListings}`);
  console.log(`  Incoming listings:  ${report.input.incomingListings}`);
  console.log('');
  console.log('  OUTPUT');
  console.log(`  Merged listings:    ${report.output.mergedListings}`);
  console.log('');
  console.log('  CHANGES');
  console.log(`  New listings:       ${report.changes.new}`);
  console.log(`  Price changes:      ${report.changes.priceChanges}`);
  console.log(`  Field updates:      ${report.changes.fieldUpdates}`);
  console.log(`  Removed/missing:    ${report.changes.removed}`);
  console.log(`  Conflicts:          ${report.changes.conflicts}`);
  console.log(`  Unchanged:          ${report.changes.unchanged}`);
  if (report.changes.skippedByFilter > 0) {
    console.log(`  Skipped (filter):   ${report.changes.skippedByFilter}`);
  }
  console.log('');

  if (Object.keys(report.newByRegion || {}).length > 0) {
    console.log('  NEW LISTINGS BY REGION:');
    for (const [region, count] of Object.entries(report.newByRegion).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${region}: ${count}`);
    }
    console.log('');
  }

  if (report.newListings.length > 0) {
    console.log('  NEW LISTINGS:');
    for (const nl of report.newListings.slice(0, 20)) {
      console.log(`    + ${nl.addr} ($${nl.price?.toLocaleString() || 'N/A'}) [${nl.neighborhood || 'Unknown'}, ${nl.region}]`);
    }
    if (report.newListings.length > 20) {
      console.log(`    ... and ${report.newListings.length - 20} more`);
    }
    console.log('');
  }

  if (report.priceChanges.length > 0) {
    console.log('  PRICE CHANGES:');
    for (const pc of report.priceChanges.slice(0, 20)) {
      const dir = pc.change > 0 ? '+' : '';
      console.log(
        `    ~ ${pc.addr}: $${pc.oldPrice?.toLocaleString()} -> $${pc.newPrice?.toLocaleString()} (${dir}${pc.changePercent}%)`
      );
    }
    if (report.priceChanges.length > 20) {
      console.log(`    ... and ${report.priceChanges.length - 20} more`);
    }
    console.log('');
  }

  if (report.removedListings.length > 0) {
    console.log('  REMOVED / NOT FOUND:');
    for (const rl of report.removedListings.slice(0, 20)) {
      console.log(`    - ${rl.addr} ($${rl.price?.toLocaleString() || 'N/A'}) [${rl.action}] ${rl.reason}`);
    }
    if (report.removedListings.length > 20) {
      console.log(`    ... and ${report.removedListings.length - 20} more`);
    }
    console.log('');
  }

  if (report.conflicts.length > 0) {
    console.log('  CONFLICTS (resolved with "newer wins"):');
    for (const c of report.conflicts.slice(0, 15)) {
      console.log(`    ${c.addr} | ${c.field}: ${JSON.stringify(c.oldValue)} -> ${JSON.stringify(c.newValue)}`);
    }
    if (report.conflicts.length > 15) {
      console.log(`    ... and ${report.conflicts.length - 15} more`);
    }
    console.log('');
  }

  console.log('='.repeat(70) + '\n');
}

// ---------------------------------------------------------------------------
// Output writer
// ---------------------------------------------------------------------------

function writeOutput(listings, outputPath) {
  const neighborhoods = [...new Set(listings.map((l) => l.neighborhood).filter(Boolean))].sort();
  const regions = [...new Set(listings.map((l) => l.region).filter(Boolean))].sort();

  // Strip internal fields for clean output
  const cleanListings = listings.map((l) => {
    const { source, scraped_at, _removedAt, _removalReason, firstSeen, lastUpdated, ...rest } = l;
    return rest;
  });

  const output = {
    metadata: {
      lastUpdated: new Date().toISOString(),
      source: 'merger',
      totalListings: cleanListings.length,
      regions,
      neighborhoods,
    },
    listings: cleanListings,
  };

  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2), 'utf-8');
  log(`Merged data written: ${outputPath} (${cleanListings.length} listings)`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const opts = parseArgs();
  const config = loadConfig();

  log('Global Real Estate Dashboard - Data Merger');
  log(`Mode: ${opts.dryRun ? 'DRY RUN' : 'LIVE'}`);
  if (opts.region) log(`Region filter: ${opts.region}`);

  // Resolve paths
  const existingPath = opts.existing
    ? path.resolve(opts.existing)
    : path.resolve(SCRIPT_DIR, config.output.path);

  let incomingPath;
  if (opts.incoming) {
    incomingPath = path.resolve(opts.incoming);
  } else if (opts.fromScraper) {
    // Look for a scraper output file (could be a temp file or the same as existing)
    const scraperOutput = path.join(SCRIPT_DIR, 'last-scrape-output.json');
    if (fs.existsSync(scraperOutput)) {
      incomingPath = scraperOutput;
    } else {
      console.error('No scraper output found. Run the scraper first or specify --incoming.');
      process.exit(1);
    }
  } else {
    console.error('Please specify --incoming <path> or --from-scraper.');
    console.error('Usage: node merger.js --incoming scraped-data.json');
    console.error('       node merger.js --from-scraper');
    process.exit(1);
  }

  // Load data
  log(`Loading existing data: ${existingPath}`);
  const existingData = loadListingsFile(existingPath);
  const existingListings = existingData?.listings || [];
  log(`Existing listings: ${existingListings.length}`);

  log(`Loading incoming data: ${incomingPath}`);
  const incomingData = loadListingsFile(incomingPath);
  if (!incomingData) {
    console.error(`Failed to load incoming data from: ${incomingPath}`);
    process.exit(1);
  }
  const incomingListings = incomingData.listings || [];
  log(`Incoming listings: ${incomingListings.length}`);

  if (incomingListings.length === 0) {
    console.error('Incoming data has no listings. Aborting merge to prevent data loss.');
    process.exit(1);
  }

  // Perform merge
  log('Merging...');
  const { merged, changeLog } = mergeListings(existingListings, incomingListings, opts);

  // Generate report
  const report = generateMergeReport(
    changeLog,
    existingListings.length,
    incomingListings.length,
    merged.length
  );

  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReport(report);
  }

  // Write output
  if (!opts.dryRun) {
    const outputPath = opts.output ? path.resolve(opts.output) : existingPath;

    // Create backup
    if (opts.backup && existingData) {
      const backupDir = path.resolve(SCRIPT_DIR, config.output.backupPath);
      createBackup(existingPath, backupDir);
    }

    writeOutput(merged, outputPath);

    // Save merge report
    const reportPath = path.join(SCRIPT_DIR, 'last-merge-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
    log(`Merge report saved: ${reportPath}`);
  } else {
    log('[DRY RUN] No files written.');
  }

  log('Merge complete.');
}

// ---------------------------------------------------------------------------
// Module exports
// ---------------------------------------------------------------------------

module.exports = {
  mergeListings,
  buildAddressIndex,
  findMatch,
  generateMergeReport,
};

if (require.main === module) {
  main();
}
