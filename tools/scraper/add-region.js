#!/usr/bin/env node
/**
 * add-region.js - Helper script to add a new region to the scraping pipeline
 *
 * Interactive CLI that prompts for region configuration and updates:
 *   - config.json (scraper sources, region bounds, neighborhood-region map)
 *   - data/benchmarks.json (neighborhood benchmarks, trend bonuses, market trends)
 *
 * Usage:
 *   node tools/scraper/add-region.js
 *   node tools/scraper/add-region.js --non-interactive --name "Fraser Valley" --neighborhoods "Abbotsford,Chilliwack,Mission"
 *
 * Options:
 *   --non-interactive       Skip prompts, use command-line arguments
 *   --name <name>           Region display name
 *   --neighborhoods <list>  Comma-separated neighborhood list
 *   --rew-url <url>         REW.ca search URL path
 *   --lat-min <n>           Minimum latitude
 *   --lat-max <n>           Maximum latitude
 *   --lng-min <n>           Minimum longitude
 *   --lng-max <n>           Maximum longitude
 *   --similar-to <region>   Base benchmark estimates on this existing region
 *   --dry-run               Show changes without writing files
 */

'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const SCRIPT_DIR = __dirname;
const CONFIG_PATH = path.join(SCRIPT_DIR, 'config.json');
const BENCHMARKS_PATH = path.resolve(SCRIPT_DIR, '../../data/benchmarks.json');

// ---------------------------------------------------------------------------
// CLI helpers
// ---------------------------------------------------------------------------

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    nonInteractive: false,
    name: null,
    neighborhoods: null,
    rewUrl: null,
    latMin: null,
    latMax: null,
    lngMin: null,
    lngMax: null,
    similarTo: null,
    dryRun: false,
  };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--non-interactive':
        opts.nonInteractive = true;
        break;
      case '--name':
        opts.name = args[++i];
        break;
      case '--neighborhoods':
        opts.neighborhoods = args[++i];
        break;
      case '--rew-url':
        opts.rewUrl = args[++i];
        break;
      case '--lat-min':
        opts.latMin = parseFloat(args[++i]);
        break;
      case '--lat-max':
        opts.latMax = parseFloat(args[++i]);
        break;
      case '--lng-min':
        opts.lngMin = parseFloat(args[++i]);
        break;
      case '--lng-max':
        opts.lngMax = parseFloat(args[++i]);
        break;
      case '--similar-to':
        opts.similarTo = args[++i];
        break;
      case '--dry-run':
        opts.dryRun = true;
        break;
    }
  }
  return opts;
}

function createPrompt() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function ask(rl, question, defaultVal = '') {
  const suffix = defaultVal ? ` [${defaultVal}]` : '';
  return new Promise((resolve) => {
    rl.question(`  ${question}${suffix}: `, (answer) => {
      resolve(answer.trim() || defaultVal);
    });
  });
}

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

// ---------------------------------------------------------------------------
// Region slug generation
// ---------------------------------------------------------------------------

function toSlug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

// ---------------------------------------------------------------------------
// Benchmark estimation
// ---------------------------------------------------------------------------

/**
 * Generate benchmark estimates for a neighborhood based on a similar existing region.
 * Applies a small random variation to make values slightly different.
 */
function estimateBenchmarks(existingBenchmarks, similarRegionNeighborhoods) {
  // Find an existing neighborhood to use as a base
  let baseBenchmark = null;
  for (const hood of similarRegionNeighborhoods) {
    if (existingBenchmarks[hood]) {
      baseBenchmark = existingBenchmarks[hood];
      break;
    }
  }

  if (!baseBenchmark) {
    // Use defaults if no similar region found
    return {
      House: 800000,
      Townhouse: 550000,
      'Apt/Condo': 400000,
      'Land/Lot': 350000,
      Duplex: 650000,
      'Mfd Home': 300000,
    };
  }

  // Apply a small random variation (+-10%)
  const result = {};
  for (const [type, price] of Object.entries(baseBenchmark)) {
    const variation = 0.9 + Math.random() * 0.2; // 0.9 to 1.1
    result[type] = Math.round(price * variation / 1000) * 1000; // Round to nearest thousand
  }
  return result;
}

/**
 * Generate default market trend data for a new neighborhood.
 */
function defaultMarketTrend() {
  return {
    yoyChange: 0.0,
    medianDOM: 35,
    inventory: 'balanced',
    avgSaleToList: 0.96,
    recentSales: 10,
  };
}

/**
 * Generate default trend bonus (market score 1-10).
 */
function defaultTrendBonus() {
  return 5;
}

// ---------------------------------------------------------------------------
// Config updaters
// ---------------------------------------------------------------------------

function updateConfig(config, regionData) {
  const slug = toSlug(regionData.name);

  // Add to REW source
  const rewSource = config.sources.find((s) => s.name === 'rew');
  if (rewSource) {
    rewSource.regions[slug] = {
      searchUrl: regionData.rewUrl || `/properties/search/${slug}?type=all&status=active`,
      neighborhoods: regionData.neighborhoods,
    };
  }

  // Add to Realtor source
  const realtorSource = config.sources.find((s) => s.name === 'realtor');
  if (realtorSource) {
    realtorSource.regions[slug] = {
      apiParams: {
        LatitudeMin: regionData.latMin,
        LatitudeMax: regionData.latMax,
        LongitudeMin: regionData.lngMin,
        LongitudeMax: regionData.lngMax,
      },
    };
  }

  // Add to validation.validRegions
  if (!config.validation.validRegions.includes(regionData.name)) {
    config.validation.validRegions.push(regionData.name);
  }

  // Add to regionBounds
  config.regionBounds[regionData.name] = {
    latMin: regionData.latMin,
    latMax: regionData.latMax,
    lngMin: regionData.lngMin,
    lngMax: regionData.lngMax,
  };

  // Add to neighborhoodRegionMap
  for (const hood of regionData.neighborhoods) {
    config.neighborhoodRegionMap[hood] = regionData.name;
  }

  return config;
}

function updateBenchmarks(benchmarks, regionData, config) {
  // Find similar region neighborhoods for estimation
  let similarNeighborhoods = [];
  if (regionData.similarTo) {
    for (const [hood, region] of Object.entries(config.neighborhoodRegionMap)) {
      if (region === regionData.similarTo) {
        similarNeighborhoods.push(hood);
      }
    }
  }

  // If no similar region specified, use all existing neighborhoods
  if (similarNeighborhoods.length === 0) {
    similarNeighborhoods = Object.keys(benchmarks.neighborhoodBenchmarks);
  }

  // Add benchmarks for each new neighborhood
  for (const hood of regionData.neighborhoods) {
    if (!benchmarks.neighborhoodBenchmarks[hood]) {
      if (regionData.benchmarkPrices && regionData.benchmarkPrices[hood]) {
        benchmarks.neighborhoodBenchmarks[hood] = regionData.benchmarkPrices[hood];
      } else {
        benchmarks.neighborhoodBenchmarks[hood] = estimateBenchmarks(
          benchmarks.neighborhoodBenchmarks,
          similarNeighborhoods
        );
      }
    }

    if (!benchmarks.trendBonus[hood]) {
      benchmarks.trendBonus[hood] = defaultTrendBonus();
    }

    if (!benchmarks.marketTrends[hood]) {
      benchmarks.marketTrends[hood] = defaultMarketTrend();
    }
  }

  // Update metadata
  benchmarks.metadata.lastUpdated = new Date().toISOString();

  return benchmarks;
}

// ---------------------------------------------------------------------------
// Interactive mode
// ---------------------------------------------------------------------------

async function interactivePrompt() {
  const rl = createPrompt();

  console.log('\n' + '='.repeat(60));
  console.log('  ADD NEW REGION - Global Real Estate Dashboard');
  console.log('='.repeat(60));
  console.log('');
  console.log('  This wizard will add a new region to the scraping pipeline.');
  console.log('  It will update config.json and data/benchmarks.json.');
  console.log('');

  // Load existing config to show current regions
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  console.log('  Current regions:');
  for (const region of config.validation.validRegions) {
    console.log(`    - ${region}`);
  }
  console.log('');

  const name = await ask(rl, 'Region display name (e.g., "Fraser Valley")');
  if (!name) {
    console.error('  Region name is required.');
    rl.close();
    process.exit(1);
  }

  // Check if region already exists
  if (config.validation.validRegions.includes(name)) {
    console.error(`  Region "${name}" already exists.`);
    rl.close();
    process.exit(1);
  }

  const neighborhoodsRaw = await ask(
    rl,
    'Neighborhoods (comma-separated, e.g., "Abbotsford, Chilliwack, Mission")'
  );
  const neighborhoods = neighborhoodsRaw
    .split(',')
    .map((n) => n.trim())
    .filter(Boolean);

  if (neighborhoods.length === 0) {
    console.error('  At least one neighborhood is required.');
    rl.close();
    process.exit(1);
  }

  console.log(`\n  Neighborhoods: ${neighborhoods.join(', ')}`);

  const rewUrl = await ask(
    rl,
    'REW.ca search URL path',
    `/properties/search/${toSlug(name)}?type=all&status=active`
  );

  console.log('\n  Coordinate bounds for Realtor.ca API:');
  console.log('  (Tip: Use Google Maps to find approximate lat/lng bounds)');
  const latMin = parseFloat(await ask(rl, 'Latitude Min', '49.0'));
  const latMax = parseFloat(await ask(rl, 'Latitude Max', '49.5'));
  const lngMin = parseFloat(await ask(rl, 'Longitude Min', '-123.0'));
  const lngMax = parseFloat(await ask(rl, 'Longitude Max', '-121.5'));

  if (isNaN(latMin) || isNaN(latMax) || isNaN(lngMin) || isNaN(lngMax)) {
    console.error('  Invalid coordinate values.');
    rl.close();
    process.exit(1);
  }

  // Similar region for benchmark estimation
  console.log('\n  Benchmark price estimation:');
  console.log('  You can base estimates on an existing region, or leave blank for defaults.');
  const existingRegions = config.validation.validRegions;
  console.log(`  Available: ${existingRegions.join(', ')}`);
  const similarTo = await ask(rl, 'Base estimates on region (or press Enter for defaults)', '');

  // Custom benchmark prices (optional)
  const customBenchmarks = await ask(
    rl,
    'Enter custom benchmark prices per neighborhood? (y/n)',
    'n'
  );

  let benchmarkPrices = null;
  if (customBenchmarks.toLowerCase() === 'y') {
    benchmarkPrices = {};
    for (const hood of neighborhoods) {
      console.log(`\n  Benchmarks for ${hood}:`);
      const house = parseInt(await ask(rl, '    House', '800000'), 10);
      const townhouse = parseInt(await ask(rl, '    Townhouse', '550000'), 10);
      const condo = parseInt(await ask(rl, '    Apt/Condo', '400000'), 10);
      const land = parseInt(await ask(rl, '    Land/Lot', '350000'), 10);
      const duplex = parseInt(await ask(rl, '    Duplex', '650000'), 10);
      const mfd = parseInt(await ask(rl, '    Mfd Home', '300000'), 10);

      benchmarkPrices[hood] = {
        House: house,
        Townhouse: townhouse,
        'Apt/Condo': condo,
        'Land/Lot': land,
        Duplex: duplex,
        'Mfd Home': mfd,
      };
    }
  }

  rl.close();

  return {
    name,
    neighborhoods,
    rewUrl,
    latMin,
    latMax,
    lngMin,
    lngMax,
    similarTo: similarTo || null,
    benchmarkPrices,
  };
}

// ---------------------------------------------------------------------------
// Non-interactive mode
// ---------------------------------------------------------------------------

function nonInteractiveArgs(cliOpts) {
  if (!cliOpts.name) {
    console.error('--name is required in non-interactive mode.');
    process.exit(1);
  }
  if (!cliOpts.neighborhoods) {
    console.error('--neighborhoods is required in non-interactive mode.');
    process.exit(1);
  }

  return {
    name: cliOpts.name,
    neighborhoods: cliOpts.neighborhoods.split(',').map((n) => n.trim()).filter(Boolean),
    rewUrl: cliOpts.rewUrl || `/properties/search/${toSlug(cliOpts.name)}?type=all&status=active`,
    latMin: cliOpts.latMin || 49.0,
    latMax: cliOpts.latMax || 49.5,
    lngMin: cliOpts.lngMin || -123.0,
    lngMax: cliOpts.lngMax || -121.5,
    similarTo: cliOpts.similarTo || null,
    benchmarkPrices: null,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const cliOpts = parseArgs();

  let regionData;
  if (cliOpts.nonInteractive) {
    regionData = nonInteractiveArgs(cliOpts);
  } else {
    regionData = await interactivePrompt();
  }

  // Load current files
  log('Loading current configuration...');
  let config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  let benchmarks = null;
  if (fs.existsSync(BENCHMARKS_PATH)) {
    benchmarks = JSON.parse(fs.readFileSync(BENCHMARKS_PATH, 'utf-8'));
  }

  // Show summary before applying
  console.log('\n' + '-'.repeat(60));
  console.log('  CHANGES TO BE APPLIED');
  console.log('-'.repeat(60));
  console.log(`  Region name:        ${regionData.name}`);
  console.log(`  Slug:               ${toSlug(regionData.name)}`);
  console.log(`  Neighborhoods:      ${regionData.neighborhoods.join(', ')}`);
  console.log(`  REW URL:            ${regionData.rewUrl}`);
  console.log(`  Coordinates:        lat [${regionData.latMin}, ${regionData.latMax}], lng [${regionData.lngMin}, ${regionData.lngMax}]`);
  console.log(`  Similar to:         ${regionData.similarTo || '(defaults)'}`);
  console.log('');
  console.log('  Files to update:');
  console.log(`    - ${CONFIG_PATH}`);
  if (benchmarks) {
    console.log(`    - ${BENCHMARKS_PATH}`);
  }
  console.log('-'.repeat(60));

  if (cliOpts.dryRun) {
    log('[DRY RUN] No files modified.');
    console.log('\nTo apply changes, run again without --dry-run.');
    return;
  }

  // Apply changes
  log('Updating config.json...');
  config = updateConfig(config, regionData);
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
  log(`config.json updated successfully.`);

  if (benchmarks) {
    log('Updating benchmarks.json...');
    benchmarks = updateBenchmarks(benchmarks, regionData, config);
    fs.writeFileSync(BENCHMARKS_PATH, JSON.stringify(benchmarks, null, 2), 'utf-8');
    log(`benchmarks.json updated successfully.`);
  } else {
    log('benchmarks.json not found, skipping benchmark updates.');
  }

  console.log('\n  Region added successfully!');
  console.log('');
  console.log('  Next steps:');
  console.log(`  1. Verify the REW.ca search URL works: https://www.rew.ca${regionData.rewUrl}`);
  console.log(`  2. Run a test scrape: node tools/scraper/scraper.js --region "${regionData.name}" --dry-run`);
  console.log(`  3. Review and adjust benchmark prices in data/benchmarks.json`);
  console.log(`  4. Run validation: node tools/scraper/validator.js`);
  console.log('');
}

// ---------------------------------------------------------------------------
// Module exports
// ---------------------------------------------------------------------------

module.exports = {
  updateConfig,
  updateBenchmarks,
  toSlug,
  estimateBenchmarks,
};

if (require.main === module) {
  main().catch((err) => {
    console.error(`\nError: ${err.message}`);
    process.exit(1);
  });
}
