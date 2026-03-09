#!/usr/bin/env node
/**
 * scraper.js - Main scraping engine for the Global Real Estate Dashboard
 *
 * Reads config.json for source configuration, fetches listings from multiple
 * sources (REW.ca via HTML scraping, Realtor.ca via API), normalizes data,
 * deduplicates, optionally geocodes, and outputs to data/listings.json.
 *
 * Usage:
 *   node tools/scraper/scraper.js [options]
 *
 * Options:
 *   --dry-run              Fetch and parse but do not write output
 *   --region "<name>"      Only scrape a specific region (e.g., "Vancouver Island")
 *   --source "<name>"      Only scrape a specific source (e.g., "rew" or "realtor")
 *   --no-geocode           Skip geocoding step
 *   --verbose              Enable verbose logging
 *   --output <path>        Override output file path
 *   --jurisdiction "<code>" Only scrape regions in a jurisdiction (e.g., "CA-BC", "US-CA")
 *   --api-push             Also push results to the dashboard API (POST /api/listings)
 *   --api-url <url>        Dashboard API base URL (default: http://localhost:3000)
 */

'use strict';

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL, URLSearchParams } = require('url');

// ---------------------------------------------------------------------------
// Configuration & CLI Arguments
// ---------------------------------------------------------------------------

const SCRIPT_DIR = __dirname;
const CONFIG_PATH = path.join(SCRIPT_DIR, 'config.json');

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    fatal(`Config file not found: ${CONFIG_PATH}`);
  }
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
}

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    dryRun: false,
    region: null,
    source: null,
    jurisdiction: null,
    geocode: true,
    verbose: false,
    output: null,
    apiPush: false,
    apiUrl: 'http://localhost:3000',
  };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--dry-run':
        opts.dryRun = true;
        break;
      case '--region':
        opts.region = args[++i];
        break;
      case '--source':
        opts.source = args[++i];
        break;
      case '--jurisdiction':
        opts.jurisdiction = args[++i];
        break;
      case '--no-geocode':
        opts.geocode = false;
        break;
      case '--verbose':
        opts.verbose = true;
        break;
      case '--output':
        opts.output = args[++i];
        break;
      case '--api-push':
        opts.apiPush = true;
        break;
      case '--api-url':
        opts.apiUrl = args[++i];
        break;
      default:
        if (args[i].startsWith('--')) {
          warn(`Unknown option: ${args[i]}`);
        }
    }
  }
  return opts;
}

// ---------------------------------------------------------------------------
// Logging helpers
// ---------------------------------------------------------------------------

function timestamp() {
  return new Date().toISOString();
}

function log(msg) {
  console.log(`[${timestamp()}] ${msg}`);
}

function warn(msg) {
  console.warn(`[${timestamp()}] WARN: ${msg}`);
}

function fatal(msg) {
  console.error(`[${timestamp()}] FATAL: ${msg}`);
  process.exit(1);
}

function verbose(msg, opts) {
  if (opts && opts.verbose) {
    console.log(`[${timestamp()}] DEBUG: ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// HTTP helpers (zero-dependency)
// ---------------------------------------------------------------------------

/**
 * Simple HTTP(S) GET that returns the response body as a string.
 */
function httpGetOnce(url, headers = {}, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;
    const reqHeaders = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      ...headers,
    };

    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'GET',
      headers: reqHeaders,
      timeout: timeoutMs,
    };

    const req = lib.request(options, (res) => {
      // Follow redirects (up to 5)
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        const redirectUrl = res.headers.location.startsWith('http')
          ? res.headers.location
          : `${parsed.protocol}//${parsed.host}${res.headers.location}`;
        return httpGetOnce(redirectUrl, headers, timeoutMs).then(resolve).catch(reject);
      }
      let body = '';
      res.setEncoding('utf-8');
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 400) {
          resolve({ status: res.statusCode, body, headers: res.headers });
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${body.slice(0, 200)}`));
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Request timed out after ${timeoutMs}ms: ${url}`));
    });
    req.on('error', reject);
    req.end();
  });
}

/**
 * HTTP GET with retry logic and exponential backoff.
 * Retries up to maxRetries times on network errors (not HTTP 4xx/5xx).
 */
async function httpGet(url, headers = {}, timeoutMs = 30000, maxRetries = 3) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await httpGetOnce(url, headers, timeoutMs);
    } catch (err) {
      lastError = err;
      const isNetworkError = err.code === 'ECONNRESET' || err.code === 'ECONNREFUSED' ||
        err.code === 'ETIMEDOUT' || err.code === 'ENOTFOUND' ||
        err.message.includes('timed out') || err.code === 'EAI_AGAIN';
      if (!isNetworkError || attempt === maxRetries) throw err;
      const delay = Math.pow(2, attempt + 1) * 1000;
      warn(`HTTP GET failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay / 1000}s: ${err.message}`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

/**
 * Simple HTTP(S) POST that sends form-encoded or JSON body.
 */
function httpPost(url, body, headers = {}, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;
    const isFormEncoded =
      (headers['Content-Type'] || '').includes('x-www-form-urlencoded');
    const payload = isFormEncoded
      ? typeof body === 'string'
        ? body
        : new URLSearchParams(body).toString()
      : typeof body === 'string'
      ? body
      : JSON.stringify(body);

    const reqHeaders = {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Content-Length': Buffer.byteLength(payload),
      ...headers,
    };

    const options = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: reqHeaders,
      timeout: timeoutMs,
    };

    const req = lib.request(options, (res) => {
      let respBody = '';
      res.setEncoding('utf-8');
      res.on('data', (chunk) => (respBody += chunk));
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 400) {
          resolve({ status: res.statusCode, body: respBody, headers: res.headers });
        } else {
          reject(new Error(`HTTP POST ${res.statusCode}: ${respBody.slice(0, 300)}`));
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`POST request timed out after ${timeoutMs}ms: ${url}`));
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Rate limiter
// ---------------------------------------------------------------------------

class RateLimiter {
  constructor(delayMs) {
    this.delayMs = delayMs;
    this.lastRequest = 0;
  }

  async wait() {
    const now = Date.now();
    const elapsed = now - this.lastRequest;
    if (elapsed < this.delayMs) {
      const waitTime = this.delayMs - elapsed;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
    this.lastRequest = Date.now();
  }
}

// ---------------------------------------------------------------------------
// HTML parsing helpers (regex-based, no cheerio dependency)
// ---------------------------------------------------------------------------

/**
 * Extracts text content that matches a given CSS class from HTML using regex.
 * This is a simplified approach -- handles class="foo" and class="... foo ..."
 * Returns an array of text contents found.
 */
function extractByClass(html, className) {
  // Match elements with the target class; capture inner text
  const classEscaped = className.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `<[^>]+class="[^"]*\\b${classEscaped}\\b[^"]*"[^>]*>([\\s\\S]*?)<\\/`,
    'gi'
  );
  const results = [];
  let match;
  while ((match = pattern.exec(html)) !== null) {
    // Strip inner HTML tags and trim
    const text = match[1].replace(/<[^>]*>/g, '').trim();
    if (text) results.push(text);
  }
  return results;
}

/**
 * Extracts listing blocks from HTML based on the container class.
 * Returns an array of HTML fragments, one per listing card.
 */
function extractListingBlocks(html, containerClass) {
  const classEscaped = containerClass
    .replace('.', '')
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Find opening tags with the container class, then capture until the next
  // occurrence of the same-level container or end of document.
  const pattern = new RegExp(
    `(<[^>]+class="[^"]*\\b${classEscaped}\\b[^"]*"[\\s\\S]*?)(?=<[^>]+class="[^"]*\\b${classEscaped}\\b|$)`,
    'gi'
  );
  const blocks = [];
  let match;
  while ((match = pattern.exec(html)) !== null) {
    blocks.push(match[1]);
  }
  return blocks;
}

// ---------------------------------------------------------------------------
// Source adapter: REW.ca
// ---------------------------------------------------------------------------

async function scrapeRew(source, config, opts) {
  const listings = [];
  const errors = [];
  const limiter = new RateLimiter(source.rateLimit.delayMs);
  const regionKeys = Object.keys(source.regions);
  const sourceJurisdiction = source.jurisdiction || 'CA-BC';

  for (const regionKey of regionKeys) {
    const regionConfig = source.regions[regionKey];
    const regionLabel = regionConfig.displayName || regionKey;

    // If a region filter is specified, skip non-matching regions
    if (opts.region && !regionLabel.toLowerCase().includes(opts.region.toLowerCase())) {
      verbose(`Skipping REW region: ${regionLabel} (filter: ${opts.region})`, opts);
      continue;
    }

    // If a jurisdiction filter is specified, skip non-matching regions
    if (opts.jurisdiction) {
      const regionJur = config.regionJurisdictionMap?.[regionLabel] || sourceJurisdiction;
      if (regionJur !== opts.jurisdiction) {
        verbose(`Skipping REW region: ${regionLabel} (jurisdiction filter: ${opts.jurisdiction}, region is ${regionJur})`, opts);
        continue;
      }
    }

    const url = source.baseUrl + regionConfig.searchUrl;
    log(`[REW] Fetching region "${regionLabel}": ${url}`);

    let page = 1;
    const maxPages = 10; // Safety limit
    let hasMore = true;

    while (hasMore && page <= maxPages) {
      await limiter.wait();

      const pageUrl = page === 1 ? url : `${url}&page=${page}`;
      verbose(`[REW] Page ${page}: ${pageUrl}`, opts);

      try {
        const resp = await httpGet(pageUrl);
        const html = resp.body;

        // Extract listing blocks
        const containerSelector = source.selectors.listingContainer.replace('.', '');
        const blocks = extractListingBlocks(html, containerSelector);

        if (blocks.length === 0) {
          verbose(`[REW] No listing blocks found on page ${page}`, opts);
          hasMore = false;
          break;
        }

        for (const block of blocks) {
          try {
            const listing = parseRewBlock(block, source.selectors, regionLabel, regionConfig.neighborhoods, sourceJurisdiction);
            if (listing) {
              listings.push(listing);
            }
          } catch (err) {
            errors.push({
              source: 'rew',
              region: regionLabel,
              page,
              error: err.message,
            });
          }
        }

        log(`[REW] Page ${page}: found ${blocks.length} listings (total so far: ${listings.length})`);

        // Check if there is a next page link
        hasMore = html.includes('rel="next"') || html.includes('class="next"') || html.includes('aria-label="Next"');
        page++;
      } catch (err) {
        errors.push({
          source: 'rew',
          region: regionLabel,
          page,
          error: err.message,
        });
        warn(`[REW] Error fetching page ${page} for ${regionLabel}: ${err.message}`);
        hasMore = false;
      }
    }
  }

  return { listings, errors };
}

/**
 * Parse a single REW listing HTML block into a normalized listing object.
 */
function parseRewBlock(html, selectors, region, neighborhoods, jurisdiction) {
  const get = (selector) => {
    const cls = selector.replace('.', '');
    const matches = extractByClass(html, cls);
    return matches.length > 0 ? matches[0] : null;
  };

  const addr = get(selectors.address);
  const priceRaw = get(selectors.price);
  const bedsRaw = get(selectors.beds);
  const bathsRaw = get(selectors.baths);
  const sqftRaw = get(selectors.sqft);
  const typeRaw = get(selectors.type);
  const agentRaw = get(selectors.agent);

  if (!addr && !priceRaw) return null;

  const price = priceRaw ? parsePrice(priceRaw) : null;
  const beds = bedsRaw ? parseInt(bedsRaw, 10) || null : null;
  const baths = bathsRaw ? parseInt(bathsRaw, 10) || null : null;
  const sqft = sqftRaw ? parseInt(sqftRaw.replace(/[^0-9]/g, ''), 10) || null : null;
  const type = normalizePropertyType(typeRaw);
  const neighborhood = guessNeighborhood(addr, neighborhoods);

  return {
    addr: addr || 'Unknown',
    price,
    beds,
    baths,
    sqft,
    type,
    lot: null,
    agent: agentRaw || null,
    neighborhood,
    dom: null,
    yearBuilt: null,
    waterView: false,
    latitude: null,
    longitude: null,
    region,
    jurisdiction: jurisdiction || 'CA-BC',
    source: 'rew',
    scraped_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Source adapter: Realtor.ca
// ---------------------------------------------------------------------------

async function scrapeRealtor(source, config, opts) {
  const listings = [];
  const errors = [];
  const limiter = new RateLimiter(source.rateLimit.delayMs);
  const regionKeys = Object.keys(source.regions);

  for (const regionKey of regionKeys) {
    const regionConfig = source.regions[regionKey];
    const regionLabel = regionConfig.displayName || regionKey;

    if (opts.region && !regionLabel.toLowerCase().includes(opts.region.toLowerCase())) {
      verbose(`Skipping Realtor region: ${regionLabel} (filter: ${opts.region})`, opts);
      continue;
    }

    // If a jurisdiction filter is specified, skip non-matching regions
    if (opts.jurisdiction) {
      const regionJur = regionConfig.jurisdiction || config.regionJurisdictionMap?.[regionLabel] || source.jurisdiction;
      if (regionJur !== opts.jurisdiction) {
        verbose(`Skipping Realtor region: ${regionLabel} (jurisdiction filter: ${opts.jurisdiction}, region is ${regionJur})`, opts);
        continue;
      }
    }

    log(`[Realtor.ca] Fetching region "${regionLabel}"`);

    let currentPage = 1;
    const maxPages = 20; // Safety limit
    let hasMore = true;

    while (hasMore && currentPage <= maxPages) {
      await limiter.wait();

      const params = {
        ZoomLevel: 10,
        LatitudeMin: regionConfig.apiParams.LatitudeMin,
        LatitudeMax: regionConfig.apiParams.LatitudeMax,
        LongitudeMin: regionConfig.apiParams.LongitudeMin,
        LongitudeMax: regionConfig.apiParams.LongitudeMax,
        Sort: '6-D', // Price descending
        PropertyTypeGroupID: 1, // Residential
        TransactionTypeId: 2, // For sale
        PropertySearchTypeId: 0,
        CurrentPage: currentPage,
        RecordsPerPage: 50,
        ApplicationId: 1,
        CultureId: 1,
        Version: '7.0',
      };

      try {
        const headers = source.headers || {
          Origin: 'https://www.realtor.ca',
          Referer: 'https://www.realtor.ca/',
          'Content-Type': 'application/x-www-form-urlencoded',
        };

        const resp = await httpPost(
          source.apiEndpoint || 'https://api.realtor.ca/Listing.svc/PropertySearch_Post',
          params,
          headers
        );

        let data;
        try {
          data = JSON.parse(resp.body);
        } catch (parseErr) {
          errors.push({
            source: 'realtor',
            region: regionLabel,
            page: currentPage,
            error: `JSON parse error: ${parseErr.message}`,
          });
          hasMore = false;
          break;
        }

        const results = data.Results || [];
        if (results.length === 0) {
          hasMore = false;
          break;
        }

        // Collect neighborhoods from all sources and the neighborhood-region map for this region
        const allNeighborhoods = [];
        for (const src of config.sources) {
          const srcRegion = src.regions?.[regionKey];
          if (srcRegion?.neighborhoods) {
            allNeighborhoods.push(...srcRegion.neighborhoods);
          }
        }
        // Also include neighborhoods from the neighborhood-region map for this region
        if (config.neighborhoodRegionMap) {
          for (const [hood, reg] of Object.entries(config.neighborhoodRegionMap)) {
            if (reg === regionLabel && !allNeighborhoods.includes(hood)) {
              allNeighborhoods.push(hood);
            }
          }
        }

        for (const result of results) {
          try {
            const jurisdictionCode = regionConfig.jurisdiction || source.jurisdiction || 'CA';
            const listing = parseRealtorResult(result, regionLabel, allNeighborhoods, jurisdictionCode);
            if (listing) {
              listings.push(listing);
            }
          } catch (err) {
            errors.push({
              source: 'realtor',
              region: regionLabel,
              page: currentPage,
              error: err.message,
            });
          }
        }

        const paging = data.Paging || {};
        const totalPages = paging.TotalPages || 1;
        hasMore = currentPage < totalPages;
        currentPage++;

        log(`[Realtor.ca] Page ${currentPage - 1}/${totalPages}: found ${results.length} listings (total: ${listings.length})`);
      } catch (err) {
        errors.push({
          source: 'realtor',
          region: regionLabel,
          page: currentPage,
          error: err.message,
        });
        warn(`[Realtor.ca] Error on page ${currentPage} for ${regionLabel}: ${err.message}`);
        hasMore = false;
      }
    }
  }

  return { listings, errors };
}

/**
 * Parse a Realtor.ca API result into a normalized listing.
 */
function parseRealtorResult(result, region, neighborhoods, jurisdiction) {
  const property = result.Property || {};
  const building = result.Building || {};
  const land = result.Land || {};
  const address = property.Address || {};

  const addrParts = [
    address.AddressText || '',
  ].filter(Boolean);
  const addr = addrParts.join(', ').split('|')[0].trim();

  if (!addr) return null;

  const priceRaw = property.Price || property.PriceUnformattedValue;
  const price = typeof priceRaw === 'number'
    ? priceRaw
    : priceRaw
    ? parsePrice(String(priceRaw))
    : null;

  const bedsAbove = parseInt(building.Bedrooms || 0, 10);
  const bedsBelow = parseInt(building.BedroomsBelow || 0, 10);
  const beds = bedsAbove + bedsBelow || null;

  const bathsRaw = building.BathroomTotal;
  const baths = bathsRaw ? parseInt(bathsRaw, 10) || null : null;

  const sqftRaw = building.SizeInterior;
  let sqft = null;
  if (sqftRaw) {
    const sqftMatch = String(sqftRaw).match(/([\d,]+)/);
    if (sqftMatch) sqft = parseInt(sqftMatch[1].replace(/,/g, ''), 10) || null;
  }

  const typeRaw = building.Type || property.Type || '';
  const type = normalizePropertyType(typeRaw);

  const lotSize = land.SizeTotal || null;

  const lat = property.Address?.Latitude
    ? parseFloat(property.Address.Latitude)
    : null;
  const lng = property.Address?.Longitude
    ? parseFloat(property.Address.Longitude)
    : null;

  const neighborhood = guessNeighborhood(addr, neighborhoods);

  // Days on market
  let dom = null;
  if (result.InsertedDateUTC) {
    const insertedDate = new Date(result.InsertedDateUTC);
    dom = Math.floor((Date.now() - insertedDate.getTime()) / (1000 * 60 * 60 * 24));
  }

  // Agent info
  const agents = result.Individual || [];
  const agentNames = agents.map((a) => [a.FirstName, a.LastName].filter(Boolean).join(' '));
  const agentOrg = agents.length > 0 ? agents[0].Organization?.Name : null;
  const agentStr = agentNames.length > 0
    ? agentNames.join(', ') + (agentOrg ? `, ${agentOrg}` : '')
    : null;

  return {
    addr,
    price,
    beds,
    baths,
    sqft,
    type,
    lot: lotSize,
    agent: agentStr,
    neighborhood,
    dom,
    yearBuilt: null,
    waterView: false,
    latitude: lat,
    longitude: lng,
    region,
    jurisdiction: jurisdiction || 'CA',
    source: 'realtor',
    scraped_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Source adapter: Zillow (stub)
// ---------------------------------------------------------------------------

async function scrapeZillow(source, config, opts) {
  const listings = [];
  const errors = [];
  const regionKeys = Object.keys(source.regions || {});

  for (const regionKey of regionKeys) {
    const regionConfig = source.regions[regionKey];
    const regionLabel = regionConfig.displayName || regionKey;
    const jurisdictionCode = regionConfig.jurisdiction || source.jurisdiction || 'US-CA';

    if (opts.region && !regionLabel.toLowerCase().includes(opts.region.toLowerCase())) {
      verbose(`Skipping Zillow region: ${regionLabel} (filter: ${opts.region})`, opts);
      continue;
    }

    log(`[Zillow] Region "${regionLabel}" - stub adapter (no live scraping yet)`);
    log(`[Zillow] Jurisdiction: ${jurisdictionCode}`);
    log(`[Zillow] To implement: parse ${source.baseUrl}${regionConfig.searchUrl}`);

    // Stub: returns empty array, ready for implementation
    // When implemented, each listing should include:
    //   { addr, price, beds, baths, sqft, type, neighborhood, region: regionLabel,
    //     jurisdiction: jurisdictionCode, country: 'US', province_state: 'CA', currency: 'USD',
    //     source: 'zillow', scraped_at: new Date().toISOString() }
  }

  return { listings, errors };
}

// ---------------------------------------------------------------------------
// Source adapter: Redfin (stub)
// ---------------------------------------------------------------------------

async function scrapeRedfin(source, config, opts) {
  const listings = [];
  const errors = [];
  const regionKeys = Object.keys(source.regions || {});

  for (const regionKey of regionKeys) {
    const regionConfig = source.regions[regionKey];
    const regionLabel = regionConfig.displayName || regionKey;
    const jurisdictionCode = regionConfig.jurisdiction || source.jurisdiction || 'US-CA';

    if (opts.region && !regionLabel.toLowerCase().includes(opts.region.toLowerCase())) {
      verbose(`Skipping Redfin region: ${regionLabel} (filter: ${opts.region})`, opts);
      continue;
    }

    log(`[Redfin] Region "${regionLabel}" - stub adapter (no live scraping yet)`);
    log(`[Redfin] Jurisdiction: ${jurisdictionCode}`);
    log(`[Redfin] To implement: parse ${source.baseUrl}${regionConfig.searchUrl}`);
  }

  return { listings, errors };
}

// ---------------------------------------------------------------------------
// Normalization helpers
// ---------------------------------------------------------------------------

function parsePrice(str) {
  if (!str) return null;
  const cleaned = String(str).replace(/[^0-9.]/g, '');
  const val = parseFloat(cleaned);
  return isNaN(val) ? null : Math.round(val);
}

function normalizePropertyType(raw) {
  if (!raw) return 'House';
  const lower = raw.toLowerCase().trim();

  if (lower.includes('condo') || lower.includes('apartment') || lower.includes('apt')) {
    return 'Apt/Condo';
  }
  if (lower.includes('townhouse') || lower.includes('town house') || lower.includes('row')) {
    return 'Townhouse';
  }
  if (lower.includes('land') || lower.includes('lot') || lower.includes('vacant')) {
    return 'Land/Lot';
  }
  if (lower.includes('duplex') || lower.includes('triplex') || lower.includes('multi')) {
    return 'Duplex';
  }
  if (lower.includes('manufactured') || lower.includes('mobile') || lower.includes('mfd')) {
    return 'Mfd Home';
  }
  if (
    lower.includes('house') ||
    lower.includes('single') ||
    lower.includes('detached') ||
    lower.includes('residential')
  ) {
    return 'House';
  }
  return 'House';
}

/**
 * Try to match an address string to one of the known neighborhoods.
 */
function guessNeighborhood(addr, neighborhoods) {
  if (!addr || !neighborhoods) return null;
  const addrLower = addr.toLowerCase();
  for (const n of neighborhoods) {
    if (addrLower.includes(n.toLowerCase())) {
      return n;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

/**
 * Normalize an address string for comparison.
 */
function normalizeAddress(addr) {
  if (!addr) return '';
  return addr
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\b(st|street|ave|avenue|rd|road|dr|drive|blvd|boulevard|cres|crescent|ct|court|ln|lane|way|pl|place|cir|circle)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check if two addresses are likely the same property.
 */
function addressesSimilar(addr1, addr2) {
  const n1 = normalizeAddress(addr1);
  const n2 = normalizeAddress(addr2);
  if (n1 === n2) return true;

  // Check if one contains the other (handles partial matches)
  if (n1.includes(n2) || n2.includes(n1)) return true;

  // Levenshtein-like similarity for short address strings
  if (n1.length > 5 && n2.length > 5) {
    const longer = n1.length > n2.length ? n1 : n2;
    const shorter = n1.length > n2.length ? n2 : n1;
    const similarity = 1 - levenshteinDistance(longer, shorter) / longer.length;
    return similarity > 0.85;
  }

  return false;
}

function levenshteinDistance(a, b) {
  const matrix = Array.from({ length: b.length + 1 }, (_, i) => [i]);
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b[i - 1] === a[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

/**
 * Check if two prices are close enough to be the same listing.
 * Allows up to 2% difference to account for formatting variations.
 */
function pricesClose(p1, p2) {
  if (p1 == null || p2 == null) return true; // If one is missing, consider them potentially matching
  if (p1 === 0 || p2 === 0) return false;
  const diff = Math.abs(p1 - p2);
  const avg = (p1 + p2) / 2;
  return diff / avg < 0.02;
}

/**
 * Deduplicate listings by address similarity + price proximity.
 * When duplicates are found, prefer the listing with more complete data.
 */
function deduplicateListings(listings) {
  const unique = [];
  const duplicateCount = { total: 0, details: [] };

  for (const listing of listings) {
    let isDuplicate = false;
    for (let i = 0; i < unique.length; i++) {
      if (
        addressesSimilar(listing.addr, unique[i].addr) &&
        pricesClose(listing.price, unique[i].price)
      ) {
        isDuplicate = true;
        duplicateCount.total++;
        duplicateCount.details.push({
          kept: unique[i].addr,
          dropped: listing.addr,
          sources: [unique[i].source, listing.source],
        });

        // Merge: fill in missing fields from the duplicate
        for (const key of Object.keys(listing)) {
          if (unique[i][key] == null && listing[key] != null) {
            unique[i][key] = listing[key];
          }
        }
        break;
      }
    }
    if (!isDuplicate) {
      unique.push({ ...listing });
    }
  }

  return { unique, duplicateCount };
}

// ---------------------------------------------------------------------------
// Geocoding (Nominatim / OpenStreetMap)
// ---------------------------------------------------------------------------

async function geocodeListing(listing, config, opts) {
  if (listing.latitude && listing.longitude) return listing;
  if (!opts.geocode) return listing;

  const geoConfig = config.geocoding;
  if (!geoConfig) return listing;

  // Determine jurisdiction-specific geocoding defaults
  let geoProvince = geoConfig.defaultProvince;
  let geoCountry = geoConfig.defaultCountry;
  if (listing.jurisdiction && geoConfig.jurisdictionDefaults && geoConfig.jurisdictionDefaults[listing.jurisdiction]) {
    const jurDefaults = geoConfig.jurisdictionDefaults[listing.jurisdiction];
    geoProvince = jurDefaults.province || geoProvince;
    geoCountry = jurDefaults.country || geoCountry;
  }

  const query = [
    listing.addr,
    listing.neighborhood,
    geoProvince,
    geoCountry,
  ]
    .filter(Boolean)
    .join(', ');

  try {
    const url = `${geoConfig.baseUrl}?format=json&q=${encodeURIComponent(query)}&limit=1`;
    verbose(`[Geocode] Querying: ${query}`, opts);

    const resp = await httpGet(url, {
      'User-Agent': 'GlobalRealEstateDashboard/1.0 (contact@example.com)',
    });

    const results = JSON.parse(resp.body);
    if (results.length > 0) {
      listing.latitude = parseFloat(results[0].lat);
      listing.longitude = parseFloat(results[0].lon);
      verbose(`[Geocode] Found: ${listing.latitude}, ${listing.longitude}`, opts);
    } else {
      verbose(`[Geocode] No results for: ${query}`, opts);
    }
  } catch (err) {
    verbose(`[Geocode] Error for "${query}": ${err.message}`, opts);
  }

  return listing;
}

async function geocodeBatch(listings, config, opts) {
  if (!opts.geocode) return listings;

  const needGeocode = listings.filter((l) => !l.latitude || !l.longitude);
  if (needGeocode.length === 0) {
    log('[Geocode] All listings already have coordinates.');
    return listings;
  }

  log(`[Geocode] ${needGeocode.length} listings need geocoding...`);
  const geoConfig = config.geocoding;
  const limiter = new RateLimiter(geoConfig?.rateLimit?.delayMs || 1100);

  let geocoded = 0;
  for (const listing of needGeocode) {
    await limiter.wait();
    await geocodeListing(listing, config, opts);
    if (listing.latitude && listing.longitude) geocoded++;
  }

  log(`[Geocode] Successfully geocoded ${geocoded}/${needGeocode.length} listings.`);
  return listings;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

function resolveOutputPath(config, opts) {
  if (opts.output) return path.resolve(opts.output);
  return path.resolve(SCRIPT_DIR, config.output.path);
}

function resolveBackupPath(config) {
  return path.resolve(SCRIPT_DIR, config.output.backupPath);
}

function loadExistingListings(outputPath) {
  if (!fs.existsSync(outputPath)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(outputPath, 'utf-8'));
    return data;
  } catch {
    warn(`Could not parse existing listings at ${outputPath}`);
    return null;
  }
}

function createBackup(outputPath, backupDir) {
  if (!fs.existsSync(outputPath)) return null;
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = path.join(backupDir, `listings-${timestamp}.json`);
  fs.copyFileSync(outputPath, backupFile);
  log(`Backup created: ${backupFile}`);
  return backupFile;
}

function writeOutput(listings, outputPath, config) {
  // Collect unique neighborhoods and regions
  const neighborhoods = [...new Set(listings.map((l) => l.neighborhood).filter(Boolean))].sort();
  const regions = [...new Set(listings.map((l) => l.region).filter(Boolean))].sort();

  // Remove scraper-internal fields before output (keep jurisdiction for downstream tools)
  const cleanListings = listings.map((l) => {
    const { source, scraped_at, ...rest } = l;
    return rest;
  });

  const output = {
    metadata: {
      lastUpdated: new Date().toISOString(),
      source: 'scraper',
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
  log(`Output written: ${outputPath} (${cleanListings.length} listings)`);
  return output;
}

// ---------------------------------------------------------------------------
// API push (optional)
// ---------------------------------------------------------------------------

async function pushToApi(listings, apiUrl) {
  const url = `${apiUrl}/api/listings/bulk`;
  log(`[API] Pushing ${listings.length} listings to ${url}...`);

  try {
    const resp = await httpPost(url, { listings }, {
      'Content-Type': 'application/json',
    });
    log(`[API] Push complete. Response status: ${resp.status}`);
    return true;
  } catch (err) {
    warn(`[API] Push failed: ${err.message}`);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Scrape report
// ---------------------------------------------------------------------------

function generateReport(scrapedListings, existingData, deduplicationResult, errors, startTime) {
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const existingListings = existingData?.listings || [];

  // Determine new vs updated vs removed
  const existingAddrs = new Set(existingListings.map((l) => normalizeAddress(l.addr)));
  const scrapedAddrs = new Set(scrapedListings.map((l) => normalizeAddress(l.addr)));

  const newListings = scrapedListings.filter(
    (l) => !existingAddrs.has(normalizeAddress(l.addr))
  );

  const potentiallyRemoved = existingListings.filter(
    (l) => !scrapedAddrs.has(normalizeAddress(l.addr))
  );

  const priceChanges = [];
  for (const scraped of scrapedListings) {
    const existing = existingListings.find((e) =>
      addressesSimilar(e.addr, scraped.addr)
    );
    if (existing && existing.price !== scraped.price && existing.price && scraped.price) {
      priceChanges.push({
        addr: scraped.addr,
        oldPrice: existing.price,
        newPrice: scraped.price,
        change: scraped.price - existing.price,
        changePercent: (((scraped.price - existing.price) / existing.price) * 100).toFixed(1),
      });
    }
  }

  const report = {
    timestamp: new Date().toISOString(),
    elapsedSeconds: parseFloat(elapsed),
    summary: {
      totalScraped: scrapedListings.length,
      afterDeduplication: deduplicationResult.unique.length,
      duplicatesRemoved: deduplicationResult.duplicateCount.total,
      newListings: newListings.length,
      priceChanges: priceChanges.length,
      potentiallyRemoved: potentiallyRemoved.length,
      errors: errors.length,
    },
    byRegion: {},
    byJurisdiction: {},
    priceChanges: priceChanges.slice(0, 20), // Top 20 price changes
    errors: errors.slice(0, 50), // Top 50 errors
  };

  // Breakdown by region
  const regions = [...new Set(scrapedListings.map((l) => l.region).filter(Boolean))];
  for (const region of regions) {
    const regionListings = scrapedListings.filter((l) => l.region === region);
    report.byRegion[region] = {
      total: regionListings.length,
      jurisdiction: regionListings[0]?.jurisdiction || 'unknown',
      byType: {},
      avgPrice: Math.round(
        regionListings
          .filter((l) => l.price)
          .reduce((sum, l) => sum + l.price, 0) / (regionListings.filter((l) => l.price).length || 1)
      ),
    };
    for (const l of regionListings) {
      const t = l.type || 'Unknown';
      report.byRegion[region].byType[t] = (report.byRegion[region].byType[t] || 0) + 1;
    }
  }

  // Breakdown by jurisdiction
  const jurisdictions = [...new Set(scrapedListings.map((l) => l.jurisdiction).filter(Boolean))];
  for (const jur of jurisdictions) {
    const jurListings = scrapedListings.filter((l) => l.jurisdiction === jur);
    const priced = jurListings.filter((l) => l.price);
    report.byJurisdiction[jur] = {
      total: jurListings.length,
      regions: [...new Set(jurListings.map((l) => l.region).filter(Boolean))],
      avgPrice: priced.length > 0
        ? Math.round(priced.reduce((sum, l) => sum + l.price, 0) / priced.length)
        : null,
    };
  }

  return report;
}

function printReport(report) {
  console.log('\n' + '='.repeat(70));
  console.log('  SCRAPE REPORT');
  console.log('='.repeat(70));
  console.log(`  Timestamp:          ${report.timestamp}`);
  console.log(`  Duration:           ${report.elapsedSeconds}s`);
  console.log('');
  console.log('  SUMMARY');
  console.log(`  Total scraped:      ${report.summary.totalScraped}`);
  console.log(`  After dedup:        ${report.summary.afterDeduplication}`);
  console.log(`  Duplicates removed: ${report.summary.duplicatesRemoved}`);
  console.log(`  New listings:       ${report.summary.newListings}`);
  console.log(`  Price changes:      ${report.summary.priceChanges}`);
  console.log(`  Possibly removed:   ${report.summary.potentiallyRemoved}`);
  console.log(`  Errors:             ${report.summary.errors}`);
  console.log('');

  if (Object.keys(report.byJurisdiction).length > 1) {
    console.log('  BY JURISDICTION');
    for (const [jur, data] of Object.entries(report.byJurisdiction)) {
      console.log(`    ${jur}: ${data.total} listings, avg $${data.avgPrice?.toLocaleString() || 'N/A'} (${data.regions.join(', ')})`);
    }
    console.log('');
  }

  for (const [region, data] of Object.entries(report.byRegion)) {
    console.log(`  REGION: ${region} (${data.jurisdiction || 'N/A'})`);
    console.log(`    Total:     ${data.total}`);
    console.log(`    Avg Price: $${data.avgPrice?.toLocaleString() || 'N/A'}`);
    for (const [type, count] of Object.entries(data.byType)) {
      console.log(`    ${type}: ${count}`);
    }
    console.log('');
  }

  if (report.priceChanges.length > 0) {
    console.log('  PRICE CHANGES (up to 20):');
    for (const pc of report.priceChanges) {
      const dir = pc.change > 0 ? '+' : '';
      console.log(
        `    ${pc.addr}: $${pc.oldPrice?.toLocaleString()} -> $${pc.newPrice?.toLocaleString()} (${dir}${pc.changePercent}%)`
      );
    }
    console.log('');
  }

  if (report.errors.length > 0) {
    console.log(`  ERRORS (${report.errors.length}):`);
    for (const err of report.errors.slice(0, 10)) {
      console.log(`    [${err.source}] ${err.region || ''} p${err.page || '?'}: ${err.error}`);
    }
    if (report.errors.length > 10) {
      console.log(`    ... and ${report.errors.length - 10} more`);
    }
  }

  console.log('='.repeat(70) + '\n');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const startTime = Date.now();
  const opts = parseArgs();
  const config = loadConfig();

  log('Global Real Estate Dashboard - Scraper');
  log(`Mode: ${opts.dryRun ? 'DRY RUN' : 'LIVE'}`);
  if (opts.region) log(`Region filter: ${opts.region}`);
  if (opts.source) log(`Source filter: ${opts.source}`);
  if (opts.jurisdiction) log(`Jurisdiction filter: ${opts.jurisdiction}`);
  log('');

  const allListings = [];
  const allErrors = [];

  // Process each enabled source
  for (const source of config.sources) {
    if (!source.enabled) {
      verbose(`Skipping disabled source: ${source.displayName}`, opts);
      continue;
    }

    if (opts.source && source.name !== opts.source) {
      verbose(`Skipping source: ${source.displayName} (filter: ${opts.source})`, opts);
      continue;
    }

    // Jurisdiction filter: skip sources that don't serve the requested jurisdiction
    if (opts.jurisdiction && source.jurisdiction) {
      const sourceJur = source.jurisdiction;
      if (sourceJur !== opts.jurisdiction && !opts.jurisdiction.startsWith(sourceJur)) {
        // Check if any region within this source matches the jurisdiction
        const hasMatchingRegion = Object.values(source.regions || {}).some(
          (r) => r.jurisdiction === opts.jurisdiction
        );
        if (!hasMatchingRegion) {
          verbose(`Skipping source: ${source.displayName} (jurisdiction filter: ${opts.jurisdiction})`, opts);
          continue;
        }
      }
    }

    log(`--- Processing source: ${source.displayName} (${source.type}) ---`);

    try {
      let result;
      switch (source.name) {
        case 'rew':
          result = await scrapeRew(source, config, opts);
          break;
        case 'realtor':
          result = await scrapeRealtor(source, config, opts);
          break;
        case 'zillow':
          result = await scrapeZillow(source, config, opts);
          break;
        case 'redfin':
          result = await scrapeRedfin(source, config, opts);
          break;
        default:
          verbose(`No adapter for source: ${source.name}`, opts);
          continue;
      }

      allListings.push(...result.listings);
      allErrors.push(...result.errors);
      log(`[${source.displayName}] Collected ${result.listings.length} listings, ${result.errors.length} errors`);
    } catch (err) {
      allErrors.push({ source: source.name, error: err.message });
      warn(`Source ${source.displayName} failed entirely: ${err.message}`);
    }
  }

  if (allListings.length === 0) {
    warn('No listings were scraped from any source.');
    warn('This may be expected if scraping live sites without proper access.');
    warn('The scraper infrastructure is ready -- populate with actual site adapters as needed.');
  }

  // Deduplicate
  log(`\nDeduplicating ${allListings.length} listings...`);
  const deduplicationResult = deduplicateListings(allListings);
  const uniqueListings = deduplicationResult.unique;
  log(`After deduplication: ${uniqueListings.length} unique listings`);

  // Geocode missing coordinates
  if (opts.geocode && uniqueListings.some((l) => !l.latitude || !l.longitude)) {
    await geocodeBatch(uniqueListings, config, opts);
  }

  // Load existing data for report
  const outputPath = resolveOutputPath(config, opts);
  const existingData = loadExistingListings(outputPath);

  // Generate report
  const report = generateReport(uniqueListings, existingData, deduplicationResult, allErrors, startTime);
  printReport(report);

  // Write output
  if (!opts.dryRun) {
    // Create backup
    const backupDir = resolveBackupPath(config);
    if (existingData) {
      createBackup(outputPath, backupDir);
    }

    writeOutput(uniqueListings, outputPath, config);

    // Save report
    const reportPath = path.join(SCRIPT_DIR, 'last-scrape-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf-8');
    log(`Report saved: ${reportPath}`);

    // API push if requested
    if (opts.apiPush) {
      await pushToApi(uniqueListings, opts.apiUrl);
    }
  } else {
    log('[DRY RUN] No files written.');
  }

  log('Scrape complete.');
}

// ---------------------------------------------------------------------------
// Module exports (for use by merger.js and others)
// ---------------------------------------------------------------------------

module.exports = {
  loadConfig,
  normalizeAddress,
  addressesSimilar,
  pricesClose,
  deduplicateListings,
  normalizePropertyType,
  parsePrice,
  guessNeighborhood,
  httpGet,
  httpPost,
  RateLimiter,
};

// Run if called directly
if (require.main === module) {
  main().catch((err) => {
    console.error(`\nFATAL: ${err.message}`);
    if (err.stack) console.error(err.stack);
    process.exit(1);
  });
}
