#!/usr/bin/env node
/**
 * validator.js - Data validation module for the Global Real Estate Dashboard
 *
 * Validates each listing against the schema defined in config.json:
 *   - Required fields and data types
 *   - Price range constraints
 *   - Property type values
 *   - Coordinate bounds per region
 *   - Neighborhood-region consistency
 *   - Duplicate detection within the dataset
 *   - Stale listing detection (DOM > 180 days)
 *
 * Usage:
 *   node tools/scraper/validator.js [options]
 *
 * Options:
 *   --input <path>    Path to listings JSON file (default: ../../data/listings.json)
 *   --fix             Attempt to auto-fix correctable issues
 *   --strict          Treat warnings as errors
 *   --json            Output report as JSON instead of formatted text
 *   --verbose         Show details for every listing checked
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SCRIPT_DIR = __dirname;

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
    input: null,
    fix: false,
    strict: false,
    json: false,
    verbose: false,
  };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--input':
        opts.input = args[++i];
        break;
      case '--fix':
        opts.fix = true;
        break;
      case '--strict':
        opts.strict = true;
        break;
      case '--json':
        opts.json = true;
        break;
      case '--verbose':
        opts.verbose = true;
        break;
    }
  }
  return opts;
}

// ---------------------------------------------------------------------------
// Validation checks
// ---------------------------------------------------------------------------

/**
 * Validate that required fields are present and non-null.
 */
function checkRequiredFields(listing, index, requiredFields) {
  const issues = [];
  for (const field of requiredFields) {
    if (listing[field] === undefined || listing[field] === null || listing[field] === '') {
      issues.push({
        index,
        addr: listing.addr || `(listing #${index})`,
        severity: 'error',
        check: 'required_field',
        field,
        message: `Missing required field: "${field}"`,
      });
    }
  }
  return issues;
}

/**
 * Validate data types for known fields.
 */
function checkDataTypes(listing, index) {
  const issues = [];
  const typeChecks = {
    addr: 'string',
    price: 'number',
    beds: 'number',
    baths: 'number',
    sqft: 'number',
    type: 'string',
    agent: 'string',
    neighborhood: 'string',
    dom: 'number',
    yearBuilt: 'number',
    waterView: 'boolean',
    latitude: 'number',
    longitude: 'number',
    region: 'string',
  };

  for (const [field, expectedType] of Object.entries(typeChecks)) {
    const val = listing[field];
    if (val !== null && val !== undefined) {
      if (typeof val !== expectedType) {
        issues.push({
          index,
          addr: listing.addr || `(listing #${index})`,
          severity: 'error',
          check: 'data_type',
          field,
          message: `Field "${field}" should be ${expectedType}, got ${typeof val} (value: ${JSON.stringify(val)})`,
          fixable: expectedType === 'number' && typeof val === 'string',
        });
      }
    }
  }
  return issues;
}

/**
 * Validate price is within configured range.
 */
function checkPriceRange(listing, index, priceRange) {
  const issues = [];
  if (listing.price != null) {
    if (listing.price < priceRange.min) {
      issues.push({
        index,
        addr: listing.addr || `(listing #${index})`,
        severity: 'warning',
        check: 'price_range',
        field: 'price',
        message: `Price $${listing.price.toLocaleString()} is below minimum threshold ($${priceRange.min.toLocaleString()})`,
      });
    }
    if (listing.price > priceRange.max) {
      issues.push({
        index,
        addr: listing.addr || `(listing #${index})`,
        severity: 'warning',
        check: 'price_range',
        field: 'price',
        message: `Price $${listing.price.toLocaleString()} exceeds maximum threshold ($${priceRange.max.toLocaleString()})`,
      });
    }
    if (listing.price === 0) {
      issues.push({
        index,
        addr: listing.addr || `(listing #${index})`,
        severity: 'error',
        check: 'price_range',
        field: 'price',
        message: 'Price is $0 -- likely a data error',
      });
    }
  }
  return issues;
}

/**
 * Validate property type is one of the allowed values.
 */
function checkPropertyType(listing, index, validTypes) {
  const issues = [];
  if (listing.type != null && !validTypes.includes(listing.type)) {
    issues.push({
      index,
      addr: listing.addr || `(listing #${index})`,
      severity: 'warning',
      check: 'property_type',
      field: 'type',
      message: `Unknown property type: "${listing.type}". Valid types: ${validTypes.join(', ')}`,
      fixable: true,
    });
  }
  return issues;
}

/**
 * Validate region is one of the allowed values.
 */
function checkRegion(listing, index, validRegions) {
  const issues = [];
  if (listing.region != null && !validRegions.includes(listing.region)) {
    issues.push({
      index,
      addr: listing.addr || `(listing #${index})`,
      severity: 'error',
      check: 'region',
      field: 'region',
      message: `Unknown region: "${listing.region}". Valid regions: ${validRegions.join(', ')}`,
    });
  }
  return issues;
}

/**
 * Validate coordinates are within the expected bounds for the listing's region.
 */
function checkCoordinateBounds(listing, index, regionBounds) {
  const issues = [];
  if (listing.latitude == null || listing.longitude == null) {
    issues.push({
      index,
      addr: listing.addr || `(listing #${index})`,
      severity: 'info',
      check: 'coordinates',
      field: 'latitude/longitude',
      message: 'Missing coordinates -- listing will not appear on map',
    });
    return issues;
  }

  const bounds = regionBounds[listing.region];
  if (!bounds) return issues;

  if (
    listing.latitude < bounds.latMin ||
    listing.latitude > bounds.latMax ||
    listing.longitude < bounds.lngMin ||
    listing.longitude > bounds.lngMax
  ) {
    issues.push({
      index,
      addr: listing.addr || `(listing #${index})`,
      severity: 'warning',
      check: 'coordinate_bounds',
      field: 'latitude/longitude',
      message: `Coordinates (${listing.latitude}, ${listing.longitude}) are outside expected bounds for "${listing.region}" [lat: ${bounds.latMin}-${bounds.latMax}, lng: ${bounds.lngMin}-${bounds.lngMax}]`,
    });
  }

  // Basic sanity check for BC
  if (listing.latitude < 48 || listing.latitude > 60 || listing.longitude < -140 || listing.longitude > -114) {
    issues.push({
      index,
      addr: listing.addr || `(listing #${index})`,
      severity: 'error',
      check: 'coordinate_sanity',
      field: 'latitude/longitude',
      message: `Coordinates (${listing.latitude}, ${listing.longitude}) are outside British Columbia entirely`,
    });
  }

  return issues;
}

/**
 * Validate that the neighborhood belongs to the assigned region.
 */
function checkNeighborhoodRegion(listing, index, neighborhoodRegionMap) {
  const issues = [];
  if (listing.neighborhood && listing.region) {
    const expectedRegion = neighborhoodRegionMap[listing.neighborhood];
    if (expectedRegion && expectedRegion !== listing.region) {
      issues.push({
        index,
        addr: listing.addr || `(listing #${index})`,
        severity: 'error',
        check: 'neighborhood_region',
        field: 'neighborhood',
        message: `Neighborhood "${listing.neighborhood}" belongs to "${expectedRegion}" but listing region is "${listing.region}"`,
        fixable: true,
      });
    }
    if (!expectedRegion && listing.neighborhood) {
      issues.push({
        index,
        addr: listing.addr || `(listing #${index})`,
        severity: 'info',
        check: 'neighborhood_unknown',
        field: 'neighborhood',
        message: `Neighborhood "${listing.neighborhood}" is not in the known neighborhood-region map`,
      });
    }
  }
  return issues;
}

/**
 * Detect potentially stale listings (DOM > threshold).
 */
function checkStaleness(listing, index, threshold = 180) {
  const issues = [];
  if (listing.dom != null && listing.dom > threshold) {
    issues.push({
      index,
      addr: listing.addr || `(listing #${index})`,
      severity: 'warning',
      check: 'stale_listing',
      field: 'dom',
      message: `DOM is ${listing.dom} days (threshold: ${threshold}). Listing may be stale or incorrectly tracked.`,
    });
  }
  return issues;
}

/**
 * Check for reasonable bed/bath/sqft values.
 */
function checkReasonableValues(listing, index) {
  const issues = [];

  if (listing.beds != null && (listing.beds < 0 || listing.beds > 30)) {
    issues.push({
      index,
      addr: listing.addr || `(listing #${index})`,
      severity: 'warning',
      check: 'reasonable_value',
      field: 'beds',
      message: `Beds count of ${listing.beds} seems unreasonable`,
    });
  }

  if (listing.baths != null && (listing.baths < 0 || listing.baths > 20)) {
    issues.push({
      index,
      addr: listing.addr || `(listing #${index})`,
      severity: 'warning',
      check: 'reasonable_value',
      field: 'baths',
      message: `Baths count of ${listing.baths} seems unreasonable`,
    });
  }

  if (listing.sqft != null) {
    if (listing.sqft < 100 && listing.type !== 'Land/Lot') {
      issues.push({
        index,
        addr: listing.addr || `(listing #${index})`,
        severity: 'warning',
        check: 'reasonable_value',
        field: 'sqft',
        message: `Sqft of ${listing.sqft} seems too low for type "${listing.type}"`,
      });
    }
    if (listing.sqft > 50000) {
      issues.push({
        index,
        addr: listing.addr || `(listing #${index})`,
        severity: 'warning',
        check: 'reasonable_value',
        field: 'sqft',
        message: `Sqft of ${listing.sqft.toLocaleString()} seems unreasonably high`,
      });
    }
  }

  if (listing.yearBuilt != null && (listing.yearBuilt < 1800 || listing.yearBuilt > new Date().getFullYear() + 2)) {
    issues.push({
      index,
      addr: listing.addr || `(listing #${index})`,
      severity: 'warning',
      check: 'reasonable_value',
      field: 'yearBuilt',
      message: `Year built ${listing.yearBuilt} seems unreasonable`,
    });
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Duplicate detection within dataset
// ---------------------------------------------------------------------------

function normalizeAddress(addr) {
  if (!addr) return '';
  return addr
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\b(st|street|ave|avenue|rd|road|dr|drive|blvd|boulevard|cres|crescent|ct|court|ln|lane|way|pl|place|cir|circle)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function detectDuplicates(listings) {
  const issues = [];
  const seen = new Map(); // normalizedAddr -> [indices]

  for (let i = 0; i < listings.length; i++) {
    const norm = normalizeAddress(listings[i].addr);
    if (!norm) continue;

    if (seen.has(norm)) {
      const prevIndices = seen.get(norm);
      issues.push({
        index: i,
        addr: listings[i].addr,
        severity: 'warning',
        check: 'duplicate',
        field: 'addr',
        message: `Potential duplicate of listing #${prevIndices[0]} ("${listings[prevIndices[0]].addr}")`,
        duplicateIndices: [...prevIndices, i],
      });
      prevIndices.push(i);
    } else {
      seen.set(norm, [i]);
    }
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Auto-fix
// ---------------------------------------------------------------------------

function attemptFix(listing, issue, config) {
  const fixes = [];

  // Fix data type: string -> number
  if (issue.check === 'data_type' && issue.fixable) {
    const val = listing[issue.field];
    const parsed = parseFloat(String(val).replace(/[^0-9.-]/g, ''));
    if (!isNaN(parsed)) {
      listing[issue.field] = parsed;
      fixes.push(`Converted "${issue.field}" from string "${val}" to number ${parsed}`);
    }
  }

  // Fix neighborhood-region mismatch
  if (issue.check === 'neighborhood_region' && issue.fixable) {
    const correctRegion = config.neighborhoodRegionMap[listing.neighborhood];
    if (correctRegion) {
      const oldRegion = listing.region;
      listing.region = correctRegion;
      fixes.push(`Corrected region from "${oldRegion}" to "${correctRegion}" based on neighborhood "${listing.neighborhood}"`);
    }
  }

  return fixes;
}

// ---------------------------------------------------------------------------
// Validation orchestrator
// ---------------------------------------------------------------------------

function validateListings(listings, config, opts = {}) {
  const validation = config.validation;
  const allIssues = [];
  const fixesApplied = [];

  // Per-listing checks
  for (let i = 0; i < listings.length; i++) {
    const listing = listings[i];

    const checks = [
      ...checkRequiredFields(listing, i, validation.requiredFields),
      ...checkDataTypes(listing, i),
      ...checkPriceRange(listing, i, validation.priceRange),
      ...checkPropertyType(listing, i, validation.validTypes),
      ...checkRegion(listing, i, validation.validRegions),
      ...checkCoordinateBounds(listing, i, config.regionBounds || {}),
      ...checkNeighborhoodRegion(listing, i, config.neighborhoodRegionMap || {}),
      ...checkStaleness(listing, i),
      ...checkReasonableValues(listing, i),
    ];

    // Attempt auto-fixes if enabled
    if (opts.fix) {
      for (const issue of checks) {
        if (issue.fixable) {
          const fixes = attemptFix(listing, issue, config);
          fixesApplied.push(...fixes.map((f) => ({ index: i, addr: listing.addr, fix: f })));
        }
      }
    }

    allIssues.push(...checks);

    if (opts.verbose) {
      const issueCount = checks.length;
      if (issueCount > 0) {
        console.log(`  Listing #${i} (${listing.addr}): ${issueCount} issue(s)`);
      }
    }
  }

  // Dataset-wide checks
  const duplicateIssues = detectDuplicates(listings);
  allIssues.push(...duplicateIssues);

  return { issues: allIssues, fixesApplied };
}

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------

function generateReport(listings, issues, fixesApplied) {
  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  const infos = issues.filter((i) => i.severity === 'info');

  // Group by check type
  const byCheck = {};
  for (const issue of issues) {
    byCheck[issue.check] = (byCheck[issue.check] || 0) + 1;
  }

  // Group by field
  const byField = {};
  for (const issue of issues) {
    byField[issue.field] = (byField[issue.field] || 0) + 1;
  }

  // Listings with errors
  const errorListings = new Set(errors.map((e) => e.index));
  const warningListings = new Set(warnings.map((w) => w.index));

  const report = {
    timestamp: new Date().toISOString(),
    totalListings: listings.length,
    summary: {
      errors: errors.length,
      warnings: warnings.length,
      info: infos.length,
      totalIssues: issues.length,
      listingsWithErrors: errorListings.size,
      listingsWithWarnings: warningListings.size,
      cleanListings: listings.length - errorListings.size - warningListings.size + new Set([...errorListings].filter((x) => warningListings.has(x))).size,
      fixesApplied: fixesApplied.length,
    },
    byCheck,
    byField,
    errors: errors.slice(0, 50),
    warnings: warnings.slice(0, 50),
    fixes: fixesApplied,
  };

  // Compute a data quality score (0-100)
  const totalChecks = listings.length * 10; // approximate checks per listing
  const deductions = errors.length * 5 + warnings.length * 1;
  report.qualityScore = Math.max(0, Math.round(((totalChecks - deductions) / totalChecks) * 100));

  return report;
}

function printReport(report) {
  console.log('\n' + '='.repeat(70));
  console.log('  DATA VALIDATION REPORT');
  console.log('='.repeat(70));
  console.log(`  Timestamp:             ${report.timestamp}`);
  console.log(`  Total listings:        ${report.totalListings}`);
  console.log(`  Data quality score:    ${report.qualityScore}/100`);
  console.log('');
  console.log('  SUMMARY');
  console.log(`  Errors:                ${report.summary.errors}`);
  console.log(`  Warnings:              ${report.summary.warnings}`);
  console.log(`  Info:                  ${report.summary.info}`);
  console.log(`  Listings with errors:  ${report.summary.listingsWithErrors}`);
  console.log(`  Listings with warnings:${report.summary.listingsWithWarnings}`);
  console.log(`  Clean listings:        ${report.summary.cleanListings}`);
  if (report.summary.fixesApplied > 0) {
    console.log(`  Fixes applied:         ${report.summary.fixesApplied}`);
  }
  console.log('');

  if (Object.keys(report.byCheck).length > 0) {
    console.log('  ISSUES BY CHECK TYPE');
    for (const [check, count] of Object.entries(report.byCheck).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${check}: ${count}`);
    }
    console.log('');
  }

  if (Object.keys(report.byField).length > 0) {
    console.log('  ISSUES BY FIELD');
    for (const [field, count] of Object.entries(report.byField).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${field}: ${count}`);
    }
    console.log('');
  }

  if (report.errors.length > 0) {
    console.log('  ERRORS (up to 50):');
    for (const err of report.errors) {
      console.log(`    #${err.index} ${err.addr}: ${err.message}`);
    }
    console.log('');
  }

  if (report.warnings.length > 0) {
    console.log('  WARNINGS (up to 50):');
    for (const w of report.warnings) {
      console.log(`    #${w.index} ${w.addr}: ${w.message}`);
    }
    console.log('');
  }

  if (report.fixes.length > 0) {
    console.log('  FIXES APPLIED:');
    for (const f of report.fixes) {
      console.log(`    #${f.index} ${f.addr}: ${f.fix}`);
    }
    console.log('');
  }

  // Final verdict
  const verdict =
    report.summary.errors === 0
      ? 'PASS - No errors found'
      : `FAIL - ${report.summary.errors} error(s) found`;
  console.log(`  VERDICT: ${verdict}`);
  console.log('='.repeat(70) + '\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const opts = parseArgs();
  const config = loadConfig();

  // Determine input path
  const inputPath = opts.input
    ? path.resolve(opts.input)
    : path.resolve(SCRIPT_DIR, config.output.path);

  if (!fs.existsSync(inputPath)) {
    console.error(`Listings file not found: ${inputPath}`);
    process.exit(1);
  }

  console.log(`Loading listings from: ${inputPath}`);

  let data;
  try {
    data = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
  } catch (err) {
    console.error(`Failed to parse listings file: ${err.message}`);
    process.exit(1);
  }

  const listings = data.listings || [];
  console.log(`Loaded ${listings.length} listings.`);

  if (listings.length === 0) {
    console.log('No listings to validate.');
    process.exit(0);
  }

  // Run validation
  const { issues, fixesApplied } = validateListings(listings, config, opts);

  // Generate and display report
  const report = generateReport(listings, issues, fixesApplied);

  if (opts.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printReport(report);
  }

  // Write fixed data back if --fix was used and fixes were applied
  if (opts.fix && fixesApplied.length > 0) {
    data.listings = listings;
    data.metadata.lastUpdated = new Date().toISOString();
    fs.writeFileSync(inputPath, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`Fixed data written back to: ${inputPath}`);
  }

  // Save validation report
  const reportPath = path.join(SCRIPT_DIR, 'last-validation-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`Validation report saved: ${reportPath}`);

  // Exit code based on severity
  if (opts.strict && (report.summary.errors > 0 || report.summary.warnings > 0)) {
    process.exit(1);
  } else if (report.summary.errors > 0) {
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Module exports
// ---------------------------------------------------------------------------

module.exports = {
  validateListings,
  checkRequiredFields,
  checkDataTypes,
  checkPriceRange,
  checkPropertyType,
  checkRegion,
  checkCoordinateBounds,
  checkNeighborhoodRegion,
  checkStaleness,
  checkReasonableValues,
  detectDuplicates,
  generateReport,
  normalizeAddress,
};

if (require.main === module) {
  main();
}
