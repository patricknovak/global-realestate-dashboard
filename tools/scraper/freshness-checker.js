#!/usr/bin/env node
/**
 * freshness-checker.js - Data freshness monitoring tool
 *
 * Analyzes listing data age and generates freshness reports.
 *
 * Usage:
 *   node tools/scraper/freshness-checker.js [options]
 *
 * Options:
 *   --input <path>   Path to listings file (default: ../../data/listings.json)
 *   --json           Output as JSON instead of formatted text
 *   --threshold <n>  Days threshold for "stale" (default: 14)
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SCRIPT_DIR = __dirname;

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = { input: null, json: false, threshold: 14 };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--input') opts.input = args[++i];
    if (args[i] === '--json') opts.json = true;
    if (args[i] === '--threshold') opts.threshold = parseInt(args[++i], 10) || 14;
  }
  return opts;
}

function loadListings(filePath) {
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  return data;
}

function calculateFreshness(data, threshold) {
  const now = new Date();
  const lastUpdated = data.metadata?.lastUpdated ? new Date(data.metadata.lastUpdated) : now;
  const dataAgeDays = Math.floor((now - lastUpdated) / (1000 * 60 * 60 * 24));
  const listings = data.listings || [];

  const brackets = {
    fresh: { label: 'Fresh (<3 days)', count: 0, listings: [] },
    recent: { label: 'Recent (3-7 days)', count: 0, listings: [] },
    aging: { label: 'Aging (7-14 days)', count: 0, listings: [] },
    stale: { label: 'Stale (>14 days)', count: 0, listings: [] },
  };

  // Per-listing freshness (if individual timestamps exist, otherwise use global)
  listings.forEach((l, idx) => {
    const listingAge = l.lastUpdated
      ? Math.floor((now - new Date(l.lastUpdated)) / (1000 * 60 * 60 * 24))
      : dataAgeDays;

    const entry = { index: idx, addr: l.addr, neighborhood: l.neighborhood, region: l.region, ageDays: listingAge };

    if (listingAge <= 3) { brackets.fresh.count++; brackets.fresh.listings.push(entry); }
    else if (listingAge <= 7) { brackets.recent.count++; brackets.recent.listings.push(entry); }
    else if (listingAge <= 14) { brackets.aging.count++; brackets.aging.listings.push(entry); }
    else { brackets.stale.count++; brackets.stale.listings.push(entry); }
  });

  // Regional breakdown
  const regions = {};
  listings.forEach((l) => {
    const region = l.region || 'Unknown';
    if (!regions[region]) regions[region] = { total: 0, avgAge: 0, listings: [] };
    regions[region].total++;
    const age = l.lastUpdated
      ? Math.floor((now - new Date(l.lastUpdated)) / (1000 * 60 * 60 * 24))
      : dataAgeDays;
    regions[region].avgAge += age;
    regions[region].listings.push(l);
  });
  for (const r in regions) {
    regions[r].avgAge = Math.round(regions[r].avgAge / regions[r].total);
  }

  // DOM anomaly detection (frozen DOM = listing may have been relisted or data is stale)
  const domAnomalies = listings.filter((l) => {
    // Flag if DOM > 180 (likely stale) or DOM is 0 (suspicious)
    return l.dom > 180 || l.dom === 0;
  }).map((l) => ({
    addr: l.addr,
    dom: l.dom,
    neighborhood: l.neighborhood,
    issue: l.dom === 0 ? 'Zero DOM (new or missing data)' : `DOM > 180 (${l.dom} days - verify still active)`,
  }));

  // Priority scrape recommendations
  const priorities = [];
  const regionEntries = Object.entries(regions).sort((a, b) => b[1].avgAge - a[1].avgAge);
  regionEntries.forEach(([name, data]) => {
    if (data.avgAge > threshold) {
      priorities.push({
        region: name,
        avgAge: data.avgAge,
        listingsCount: data.total,
        priority: data.avgAge > threshold * 2 ? 'HIGH' : 'MEDIUM',
      });
    }
  });

  return {
    timestamp: now.toISOString(),
    globalDataAge: dataAgeDays,
    lastUpdated: data.metadata?.lastUpdated || 'Unknown',
    totalListings: listings.length,
    threshold: threshold,
    brackets,
    regions,
    domAnomalies,
    scrapePriorities: priorities,
    healthScore: calculateHealthScore(brackets, listings.length),
  };
}

function calculateHealthScore(brackets, total) {
  if (total === 0) return 0;
  // Weight: fresh=100, recent=70, aging=30, stale=0
  const score = Math.round(
    (brackets.fresh.count * 100 + brackets.recent.count * 70 +
     brackets.aging.count * 30 + brackets.stale.count * 0) / total
  );
  return Math.min(100, Math.max(0, score));
}

function printReport(report) {
  console.log('\n' + '='.repeat(65));
  console.log('  DATA FRESHNESS REPORT');
  console.log('='.repeat(65));
  console.log(`  Generated:        ${report.timestamp}`);
  console.log(`  Last Data Update:  ${report.lastUpdated}`);
  console.log(`  Global Data Age:   ${report.globalDataAge} days`);
  console.log(`  Total Listings:    ${report.totalListings}`);
  console.log(`  Health Score:      ${report.healthScore}/100`);
  console.log(`  Stale Threshold:   ${report.threshold} days`);
  console.log('');

  console.log('  FRESHNESS BREAKDOWN:');
  for (const key of ['fresh', 'recent', 'aging', 'stale']) {
    const b = report.brackets[key];
    const bar = '#'.repeat(Math.round((b.count / report.totalListings) * 40));
    const pct = ((b.count / report.totalListings) * 100).toFixed(1);
    console.log(`  ${b.label.padEnd(22)} ${String(b.count).padStart(5)}  ${pct.padStart(5)}%  ${bar}`);
  }
  console.log('');

  console.log('  BY REGION:');
  for (const [name, data] of Object.entries(report.regions)) {
    console.log(`  ${name.padEnd(30)} ${String(data.total).padStart(4)} listings  avg age: ${data.avgAge} days`);
  }
  console.log('');

  if (report.domAnomalies.length > 0) {
    console.log(`  DOM ANOMALIES (${report.domAnomalies.length}):`);
    report.domAnomalies.slice(0, 10).forEach((a) => {
      console.log(`    ${a.addr.padEnd(35)} DOM: ${String(a.dom).padStart(4)}  ${a.issue}`);
    });
    if (report.domAnomalies.length > 10) {
      console.log(`    ... and ${report.domAnomalies.length - 10} more`);
    }
    console.log('');
  }

  if (report.scrapePriorities.length > 0) {
    console.log('  RECOMMENDED SCRAPE PRIORITIES:');
    report.scrapePriorities.forEach((p) => {
      console.log(`    [${p.priority}] ${p.region} - ${p.listingsCount} listings, avg ${p.avgAge} days old`);
    });
  } else {
    console.log('  All data is within freshness threshold. No urgent scraping needed.');
  }

  console.log('\n' + '='.repeat(65) + '\n');
}

function main() {
  const opts = parseArgs();
  const inputPath = opts.input
    ? path.resolve(opts.input)
    : path.resolve(SCRIPT_DIR, '../../data/listings.json');

  const data = loadListings(inputPath);
  const report = calculateFreshness(data, opts.threshold);

  if (opts.json) {
    // Trim listing details for JSON output
    const jsonReport = { ...report };
    for (const key of ['fresh', 'recent', 'aging', 'stale']) {
      jsonReport.brackets[key].listings = jsonReport.brackets[key].listings.slice(0, 5);
    }
    console.log(JSON.stringify(jsonReport, null, 2));
  } else {
    printReport(report);
  }
}

module.exports = { calculateFreshness, calculateHealthScore };

if (require.main === module) {
  main();
}
