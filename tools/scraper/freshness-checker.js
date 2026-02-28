#!/usr/bin/env node
/**
 * freshness-checker.js - Data freshness monitoring tool
 *
 * Analyzes the current listings data for staleness and data quality:
 *   - Calculates data age per listing (based on scraped_at, lastUpdated, or metadata)
 *   - Identifies listings that need re-verification (>7 days old)
 *   - Detects frozen DOM values (DOM unchanged across scrapes)
 *   - Generates a freshness report with age brackets and priorities
 *
 * Usage:
 *   node tools/scraper/freshness-checker.js [options]
 *
 * Options:
 *   --input <path>         Path to listings file (default: ../../data/listings.json)
 *   --json                 Output report as JSON
 *   --stale-threshold <n>  Days after which data is considered stale (default: 14)
 *   --verify-threshold <n> Days after which re-verification is needed (default: 7)
 *   --output <path>        Save report to file
 *   --verbose              Show per-listing details
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
    json: false,
    staleThreshold: 14,
    verifyThreshold: 7,
    output: null,
    verbose: false,
  };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--input':
        opts.input = args[++i];
        break;
      case '--json':
        opts.json = true;
        break;
      case '--stale-threshold':
        opts.staleThreshold = parseInt(args[++i], 10) || 14;
        break;
      case '--verify-threshold':
        opts.verifyThreshold = parseInt(args[++i], 10) || 7;
        break;
      case '--threshold':
        // Backwards compatibility with old --threshold flag
        opts.staleThreshold = parseInt(args[++i], 10) || 14;
        break;
      case '--output':
        opts.output = args[++i];
        break;
      case '--verbose':
        opts.verbose = true;
        break;
    }
  }
  return opts;
}

// ---------------------------------------------------------------------------
// Date / age helpers
// ---------------------------------------------------------------------------

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Determine the "data date" for a listing.
 * Checks lastUpdated, scraped_at, then falls back to metadata lastUpdated.
 */
function getListingDataDate(listing, metadataDate) {
  if (listing.lastUpdated) {
    const d = new Date(listing.lastUpdated);
    if (!isNaN(d.getTime())) return d;
  }
  if (listing.scraped_at) {
    const d = new Date(listing.scraped_at);
    if (!isNaN(d.getTime())) return d;
  }
  if (metadataDate) {
    const d = new Date(metadataDate);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

/**
 * Calculate the age of a listing's data in days.
 */
function getDataAgeDays(listing, metadataDate, now) {
  const dataDate = getListingDataDate(listing, metadataDate);
  if (!dataDate) return null;
  return Math.max(0, Math.floor((now.getTime() - dataDate.getTime()) / MS_PER_DAY));
}

/**
 * Classify a listing into an age bracket.
 */
function getAgeBracket(ageDays, verifyThreshold, staleThreshold) {
  if (ageDays === null) return 'unknown';
  if (ageDays <= 3) return 'fresh';
  if (ageDays <= verifyThreshold) return 'recent';
  if (ageDays <= staleThreshold) return 'aging';
  return 'stale';
}

// ---------------------------------------------------------------------------
// Analysis functions
// ---------------------------------------------------------------------------

/**
 * Detect listings with potentially frozen DOM values.
 * If DOM is a static value and data is old, the DOM likely was not updated.
 */
function detectFrozenDom(listings, metadataDate, now) {
  const frozen = [];

  for (let i = 0; i < listings.length; i++) {
    const listing = listings[i];
    if (listing.dom == null) continue;

    const ageDays = getDataAgeDays(listing, metadataDate, now);
    if (ageDays === null) continue;

    // Flag DOM anomalies:
    // 1. DOM = 0 is suspicious (newly listed or missing data)
    // 2. DOM > 180 may be stale or a relisted property
    // 3. If data is >7 days old, DOM is likely frozen at its scraped value
    if (listing.dom === 0) {
      frozen.push({
        index: i,
        addr: listing.addr,
        dom: listing.dom,
        dataAgeDays: ageDays,
        region: listing.region,
        neighborhood: listing.neighborhood,
        note: 'Zero DOM -- newly listed or missing data',
      });
    } else if (listing.dom > 180) {
      frozen.push({
        index: i,
        addr: listing.addr,
        dom: listing.dom,
        dataAgeDays: ageDays,
        region: listing.region,
        neighborhood: listing.neighborhood,
        note: `DOM > 180 (${listing.dom} days) -- verify listing is still active`,
      });
    } else if (ageDays > 7) {
      frozen.push({
        index: i,
        addr: listing.addr,
        dom: listing.dom,
        dataAgeDays: ageDays,
        region: listing.region,
        neighborhood: listing.neighborhood,
        note: `DOM value (${listing.dom}) may be frozen -- data is ${ageDays} days old`,
      });
    }
  }

  return frozen;
}

/**
 * Calculate freshness statistics per region.
 */
function regionStats(listings, metadataDate, now, verifyThreshold, staleThreshold) {
  const stats = {};

  for (const listing of listings) {
    const region = listing.region || 'Unknown';
    if (!stats[region]) {
      stats[region] = {
        total: 0,
        brackets: { fresh: 0, recent: 0, aging: 0, stale: 0, unknown: 0 },
        ages: [],
        oldestListing: null,
        oldestAge: 0,
        newestListing: null,
        newestAge: Infinity,
        needsVerification: 0,
      };
    }

    const s = stats[region];
    s.total++;

    const ageDays = getDataAgeDays(listing, metadataDate, now);
    const bracket = getAgeBracket(ageDays, verifyThreshold, staleThreshold);
    s.brackets[bracket]++;

    if (ageDays !== null) {
      s.ages.push(ageDays);
      if (ageDays > s.oldestAge) {
        s.oldestAge = ageDays;
        s.oldestListing = listing.addr;
      }
      if (ageDays < s.newestAge) {
        s.newestAge = ageDays;
        s.newestListing = listing.addr;
      }
      if (ageDays > verifyThreshold) {
        s.needsVerification++;
      }
    }
  }

  // Calculate averages and medians
  for (const region of Object.keys(stats)) {
    const s = stats[region];
    if (s.ages.length > 0) {
      s.averageAge = parseFloat(
        (s.ages.reduce((a, b) => a + b, 0) / s.ages.length).toFixed(1)
      );
      const sorted = [...s.ages].sort((a, b) => a - b);
      s.medianAge = parseFloat(sorted[Math.floor(sorted.length / 2)].toFixed(1));
    } else {
      s.averageAge = null;
      s.medianAge = null;
    }
    delete s.ages; // Remove raw data from report
    if (s.newestAge === Infinity) s.newestAge = null;
  }

  return stats;
}

/**
 * Calculate freshness statistics per neighborhood.
 */
function neighborhoodStats(listings, metadataDate, now, verifyThreshold, staleThreshold) {
  const stats = {};

  for (const listing of listings) {
    const hood = listing.neighborhood || 'Unknown';
    if (!stats[hood]) {
      stats[hood] = {
        total: 0,
        fresh: 0,
        stale: 0,
        ages: [],
        region: listing.region,
      };
    }

    const s = stats[hood];
    s.total++;

    const ageDays = getDataAgeDays(listing, metadataDate, now);
    if (ageDays !== null) {
      s.ages.push(ageDays);
      if (ageDays <= 3) s.fresh++;
      if (ageDays > staleThreshold) s.stale++;
    }
  }

  // Calculate averages and stale percentage
  for (const hood of Object.keys(stats)) {
    const s = stats[hood];
    if (s.ages.length > 0) {
      s.averageAge = parseFloat(
        (s.ages.reduce((a, b) => a + b, 0) / s.ages.length).toFixed(1)
      );
    } else {
      s.averageAge = null;
    }
    s.stalePercent = s.total > 0 ? parseFloat(((s.stale / s.total) * 100).toFixed(1)) : 0;
    delete s.ages;
  }

  return stats;
}

/**
 * Generate scrape priority recommendations.
 */
function generatePriorities(regionStatsData, neighborhoodStatsData) {
  const priorities = [];

  // Regions with stalest data get highest priority
  const regionsByAge = Object.entries(regionStatsData)
    .filter(([, s]) => s.averageAge !== null)
    .sort(([, a], [, b]) => (b.averageAge || 0) - (a.averageAge || 0));

  for (const [region, stats] of regionsByAge) {
    const stalePercent =
      stats.total > 0
        ? ((stats.brackets.stale / stats.total) * 100).toFixed(1)
        : 0;

    let priority = 'low';
    let reason = 'Data is relatively fresh';

    if (stats.averageAge > 14) {
      priority = 'critical';
      reason = `Average data age is ${stats.averageAge} days, ${stalePercent}% stale`;
    } else if (stats.averageAge > 7) {
      priority = 'high';
      reason = `Average data age is ${stats.averageAge} days, needs refresh`;
    } else if (stats.averageAge > 3) {
      priority = 'medium';
      reason = `Average data age is ${stats.averageAge} days`;
    }

    priorities.push({
      region,
      priority,
      reason,
      averageAge: stats.averageAge,
      stalePercent: parseFloat(stalePercent),
      needsVerification: stats.needsVerification,
    });
  }

  // Neighborhoods with highest stale percentage
  const staleNeighborhoods = Object.entries(neighborhoodStatsData)
    .filter(([, s]) => s.stalePercent > 50)
    .sort(([, a], [, b]) => b.stalePercent - a.stalePercent)
    .map(([hood, s]) => ({
      neighborhood: hood,
      region: s.region,
      stalePercent: s.stalePercent,
      total: s.total,
    }));

  return { regions: priorities, staleNeighborhoods };
}

// ---------------------------------------------------------------------------
// Health score calculation
// ---------------------------------------------------------------------------

/**
 * Calculate an overall freshness health score (0-100).
 */
function calculateHealthScore(ageBrackets, total) {
  if (total === 0) return 0;
  const effectiveTotal = total - (ageBrackets['unknown age'] || 0);
  if (effectiveTotal <= 0) return 0;

  const freshCount = ageBrackets['fresh (0-3d)'] || 0;
  const recentCount = Object.values(ageBrackets).find((_, i) =>
    Object.keys(ageBrackets)[i]?.startsWith('recent')
  ) || 0;
  const agingCount = Object.values(ageBrackets).find((_, i) =>
    Object.keys(ageBrackets)[i]?.startsWith('aging')
  ) || 0;
  const staleCount = Object.values(ageBrackets).find((_, i) =>
    Object.keys(ageBrackets)[i]?.startsWith('stale')
  ) || 0;

  const score = Math.round(
    (freshCount * 100 + recentCount * 75 + agingCount * 40 + staleCount * 10) / effectiveTotal
  );
  return Math.min(100, Math.max(0, score));
}

// ---------------------------------------------------------------------------
// Report generation
// ---------------------------------------------------------------------------

function generateReport(listings, metadataDate, opts) {
  const now = new Date();

  // Overall age brackets
  const overall = {
    fresh: 0,
    recent: 0,
    aging: 0,
    stale: 0,
    unknown: 0,
  };

  const listingsNeedingVerification = [];

  for (let i = 0; i < listings.length; i++) {
    const listing = listings[i];
    const ageDays = getDataAgeDays(listing, metadataDate, now);
    const bracket = getAgeBracket(ageDays, opts.verifyThreshold, opts.staleThreshold);
    overall[bracket]++;

    if (ageDays !== null && ageDays > opts.verifyThreshold) {
      listingsNeedingVerification.push({
        index: i,
        addr: listing.addr,
        region: listing.region,
        neighborhood: listing.neighborhood,
        ageDays,
        price: listing.price,
      });
    }
  }

  // Sort by age descending (stalest first)
  listingsNeedingVerification.sort((a, b) => b.ageDays - a.ageDays);

  // Frozen DOM detection
  const frozenDom = detectFrozenDom(listings, metadataDate, now);

  // Region and neighborhood stats
  const regStats = regionStats(listings, metadataDate, now, opts.verifyThreshold, opts.staleThreshold);
  const hoodStats = neighborhoodStats(listings, metadataDate, now, opts.verifyThreshold, opts.staleThreshold);

  // Priorities
  const priorities = generatePriorities(regStats, hoodStats);

  // Build age brackets with descriptive keys
  const ageBrackets = {
    'fresh (0-3d)': overall.fresh,
    [`recent (3-${opts.verifyThreshold}d)`]: overall.recent,
    [`aging (${opts.verifyThreshold}-${opts.staleThreshold}d)`]: overall.aging,
    [`stale (>${opts.staleThreshold}d)`]: overall.stale,
    'unknown age': overall.unknown,
  };

  // Health score
  const effectiveTotal = listings.length - overall.unknown;
  const freshnessScore = effectiveTotal > 0
    ? Math.round(
        (overall.fresh * 100 + overall.recent * 75 + overall.aging * 40 + overall.stale * 10) / effectiveTotal
      )
    : 0;

  // Global data age from metadata
  const globalDataAge = metadataDate
    ? Math.max(0, Math.floor((now.getTime() - new Date(metadataDate).getTime()) / MS_PER_DAY))
    : null;

  const report = {
    timestamp: now.toISOString(),
    metadataLastUpdated: metadataDate || 'unknown',
    globalDataAge,
    thresholds: {
      verifyDays: opts.verifyThreshold,
      staleDays: opts.staleThreshold,
    },
    totalListings: listings.length,
    ageBrackets,
    freshnessScore: Math.min(100, Math.max(0, freshnessScore)),
    regionStats: regStats,
    neighborhoodStats: hoodStats,
    priorities: priorities.regions,
    staleNeighborhoods: priorities.staleNeighborhoods,
    frozenDomCount: frozenDom.length,
    frozenDomExamples: frozenDom.slice(0, 10),
    listingsNeedingVerification: listingsNeedingVerification.length,
    verificationSample: listingsNeedingVerification.slice(0, 20),
  };

  return report;
}

function printReport(report) {
  console.log('\n' + '='.repeat(70));
  console.log('  DATA FRESHNESS REPORT');
  console.log('='.repeat(70));
  console.log(`  Generated:              ${report.timestamp}`);
  console.log(`  Metadata last updated:  ${report.metadataLastUpdated}`);
  if (report.globalDataAge !== null) {
    console.log(`  Global data age:        ${report.globalDataAge} days`);
  }
  console.log(`  Total listings:         ${report.totalListings}`);
  console.log(`  Freshness score:        ${report.freshnessScore}/100`);
  console.log(`  Verify threshold:       ${report.thresholds.verifyDays} days`);
  console.log(`  Stale threshold:        ${report.thresholds.staleDays} days`);
  console.log('');

  console.log('  AGE DISTRIBUTION');
  for (const [bracket, count] of Object.entries(report.ageBrackets)) {
    const pct =
      report.totalListings > 0
        ? ((count / report.totalListings) * 100).toFixed(1)
        : '0.0';
    const bar = '#'.repeat(Math.round((count / Math.max(report.totalListings, 1)) * 40));
    console.log(`    ${bracket.padEnd(22)} ${String(count).padStart(5)} (${String(pct).padStart(5)}%)  ${bar}`);
  }
  console.log('');

  console.log('  REGION FRESHNESS');
  for (const [region, stats] of Object.entries(report.regionStats)) {
    console.log(`    ${region}:`);
    console.log(`      Total: ${stats.total}  |  Avg age: ${stats.averageAge ?? 'N/A'}d  |  Median: ${stats.medianAge ?? 'N/A'}d`);
    console.log(`      Fresh: ${stats.brackets.fresh}  Recent: ${stats.brackets.recent}  Aging: ${stats.brackets.aging}  Stale: ${stats.brackets.stale}  Unknown: ${stats.brackets.unknown}`);
    console.log(`      Needs verification: ${stats.needsVerification}`);
    if (stats.oldestListing) {
      console.log(`      Oldest: "${stats.oldestListing}" (${stats.oldestAge}d)`);
    }
    console.log('');
  }

  if (report.priorities.length > 0) {
    console.log('  SCRAPE PRIORITIES');
    for (const p of report.priorities) {
      const icon =
        p.priority === 'critical'
          ? '[!!!]'
          : p.priority === 'high'
          ? '[!! ]'
          : p.priority === 'medium'
          ? '[!  ]'
          : '[   ]';
      console.log(`    ${icon} ${p.region.padEnd(30)} ${p.priority.toUpperCase().padEnd(10)} ${p.reason}`);
    }
    console.log('');
  }

  if (report.staleNeighborhoods.length > 0) {
    console.log('  STALE NEIGHBORHOODS (>50% stale):');
    for (const sn of report.staleNeighborhoods) {
      console.log(`    ${sn.neighborhood} (${sn.region}): ${sn.stalePercent}% stale (${sn.total} listings)`);
    }
    console.log('');
  }

  if (report.frozenDomCount > 0) {
    console.log(`  FROZEN / ANOMALOUS DOM VALUES: ${report.frozenDomCount} listings`);
    for (const fd of report.frozenDomExamples) {
      console.log(`    ${fd.addr}: DOM=${fd.dom}, data age=${fd.dataAgeDays}d -- ${fd.note}`);
    }
    if (report.frozenDomCount > 10) {
      console.log(`    ... and ${report.frozenDomCount - 10} more`);
    }
    console.log('');
  }

  console.log(`  VERIFICATION NEEDED: ${report.listingsNeedingVerification} listings`);
  if (report.verificationSample.length > 0) {
    console.log('  Sample (stalest first):');
    for (const v of report.verificationSample.slice(0, 10)) {
      console.log(
        `    ${v.addr} [${v.neighborhood || 'N/A'}, ${v.region}] -- ${v.ageDays}d old ($${v.price?.toLocaleString() || 'N/A'})`
      );
    }
    if (report.listingsNeedingVerification > 10) {
      console.log(`    ... and ${report.listingsNeedingVerification - 10} more`);
    }
  }

  // Recommendations
  console.log('');
  console.log('  RECOMMENDATIONS');
  if (report.freshnessScore >= 80) {
    console.log('    Data is in good shape. Continue with scheduled scrapes.');
  } else if (report.freshnessScore >= 50) {
    console.log('    Data is aging. Consider running a full scrape soon.');
    for (const p of report.priorities.filter((pp) => pp.priority === 'high' || pp.priority === 'critical')) {
      console.log(`    -> Priority scrape: node tools/scraper/scraper.js --region "${p.region}"`);
    }
  } else {
    console.log('    Data is significantly stale. Immediate full scrape recommended.');
    console.log('    Run: node tools/scraper/scraper.js');
  }

  console.log('\n' + '='.repeat(70) + '\n');
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
  const metadataDate = data.metadata?.lastUpdated || null;

  console.log(`Loaded ${listings.length} listings (metadata date: ${metadataDate || 'unknown'}).`);

  if (listings.length === 0) {
    console.log('No listings to check.');
    process.exit(0);
  }

  // Generate report
  const report = generateReport(listings, metadataDate, opts);

  // Display
  if (opts.json) {
    // Trim verbose data for JSON output
    const trimmed = { ...report };
    console.log(JSON.stringify(trimmed, null, 2));
  } else {
    printReport(report);
  }

  // Save report
  if (opts.output) {
    const outputPath = path.resolve(opts.output);
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(outputPath, JSON.stringify(report, null, 2), 'utf-8');
    console.log(`Report saved to: ${outputPath}`);
  }

  // Always save to default location
  const defaultReportPath = path.join(SCRIPT_DIR, 'last-freshness-report.json');
  fs.writeFileSync(defaultReportPath, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`Report saved to: ${defaultReportPath}`);
}

// ---------------------------------------------------------------------------
// Module exports
// ---------------------------------------------------------------------------

module.exports = {
  generateReport,
  getDataAgeDays,
  getAgeBracket,
  detectFrozenDom,
  regionStats,
  neighborhoodStats,
  generatePriorities,
  calculateHealthScore,
};

if (require.main === module) {
  main();
}
