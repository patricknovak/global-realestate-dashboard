# Scraping Pipeline

Manual scraping pipeline for the Global Real Estate Dashboard. Collects, validates, and merges listing data from multiple sources across British Columbia, Canada.

## Overview

This pipeline provides a complete workflow for gathering real estate listing data from public sources, validating it against quality standards, and merging it into the dashboard's dataset. It is designed to be run manually or on a schedule, with built-in safeguards for rate limiting, deduplication, and data integrity.

**Current target regions:**
- South Surrey / White Rock (10 neighborhoods)
- Vancouver Island (9 neighborhoods)

**Data sources:**
- REW.ca -- HTML web scraping with configurable CSS selectors
- Realtor.ca -- Public API integration (PropertySearch_Post endpoint)
- BC Assessment -- Supplementary source for assessed values (disabled by default)

## Architecture

```
config.json              Source configuration, validation rules, region bounds
scraper.js               Main scraping engine with source-specific adapters
validator.js             Data validation, schema checks, quality scoring
merger.js                Merge new scrapes with existing data, track price history
add-region.js            Interactive CLI to add new regions and neighborhoods
freshness-checker.js     Monitor data age, detect stale listings, prioritize scrapes
```

### Data Flow

```
Sources (REW, Realtor.ca)
          |
          v
     scraper.js -----> raw scraped data (normalized, deduplicated)
          |
          v
     validator.js ----> validation report (errors, warnings, quality score)
          |
          v
existing listings.json ---> merger.js <--- validated scrape data
                                |
                                v
                      merged listings.json (with backup)
                                |
                                v
                      freshness-checker.js (monitor data age)
                                |
                                v
                      seed.js ---> SQLite database ---> Dashboard API
```

## Quick Start

### 1. Run a Manual Scrape

```bash
# Dry run first -- fetches and parses but does not write files
node tools/scraper/scraper.js --dry-run

# Scrape all enabled sources
node tools/scraper/scraper.js

# Scrape a specific region only
node tools/scraper/scraper.js --region "Vancouver Island"

# Scrape a specific source only
node tools/scraper/scraper.js --source rew
node tools/scraper/scraper.js --source realtor

# Skip geocoding (faster, useful if coordinates already exist)
node tools/scraper/scraper.js --no-geocode

# Verbose output for debugging
node tools/scraper/scraper.js --verbose

# Push results to the dashboard API after scraping
node tools/scraper/scraper.js --api-push --api-url http://localhost:3000

# Write to a custom output file
node tools/scraper/scraper.js --output ./test-scrape.json
```

The scraper generates a report after each run showing:
- Total listings scraped per source and region
- Deduplication statistics
- New listings found vs. existing
- Price changes detected
- Errors encountered

### 2. Validate Data

```bash
# Validate the current listings dataset
node tools/scraper/validator.js

# Validate a specific file
node tools/scraper/validator.js --input path/to/listings.json

# Auto-fix correctable issues (type coercion, region mismatches)
node tools/scraper/validator.js --fix

# Strict mode -- treat warnings as errors (exit code 1)
node tools/scraper/validator.js --strict

# Output as JSON for programmatic use
node tools/scraper/validator.js --json

# Verbose -- show details for every listing
node tools/scraper/validator.js --verbose
```

Validation checks include:
- Required fields (addr, price, neighborhood, region)
- Data types (price is number, beds is number, etc.)
- Price range bounds ($50K - $50M)
- Property type validity
- Region validity
- Coordinate bounds per region (lat/lng within BC)
- Neighborhood-region consistency
- Stale listing detection (DOM > 180 days)
- Reasonable value checks (beds, baths, sqft, yearBuilt)
- Duplicate detection within the dataset

### 3. Merge Scraped Data

```bash
# Merge a scraped file into existing listings
node tools/scraper/merger.js --incoming scraped-data.json

# Use the last scraper output automatically
node tools/scraper/merger.js --from-scraper

# Dry run -- show what would change without writing
node tools/scraper/merger.js --incoming scraped-data.json --dry-run

# Mark removed listings as "possibly sold/delisted" instead of dropping
node tools/scraper/merger.js --incoming scraped-data.json --mark-removed

# Keep removed listings for 30 days before dropping
node tools/scraper/merger.js --incoming scraped-data.json --mark-removed --keep-removed 30

# Write to a different output file
node tools/scraper/merger.js --incoming scraped-data.json --output merged-output.json

# Skip backup creation
node tools/scraper/merger.js --incoming scraped-data.json --no-backup

# JSON report
node tools/scraper/merger.js --incoming scraped-data.json --json
```

The merger:
- Detects new listings (not in existing dataset)
- Records price changes to a `price_history` array on each listing
- Detects removed listings (in existing but missing from new scrape)
- Resolves conflicts with "newer data wins" strategy
- Creates automatic backups in `data/backups/` before overwriting

### 4. Add a New Region

```bash
# Interactive mode -- guided prompts
node tools/scraper/add-region.js

# Non-interactive mode for scripting
node tools/scraper/add-region.js \
  --non-interactive \
  --name "Fraser Valley" \
  --neighborhoods "Abbotsford,Chilliwack,Mission,Langley,Hope" \
  --lat-min 49.0 \
  --lat-max 49.4 \
  --lng-min -122.5 \
  --lng-max -121.0 \
  --similar-to "South Surrey / White Rock"

# Preview changes without writing
node tools/scraper/add-region.js --dry-run
```

The add-region helper will:
1. Prompt for region name and neighborhood list
2. Configure REW.ca search URL and Realtor.ca coordinate bounds
3. Generate benchmark price estimates (based on a similar existing region or defaults)
4. Generate default market trend data
5. Update `config.json` with the new region
6. Update `data/benchmarks.json` with neighborhood benchmarks, trend bonuses, and market trends

### 5. Check Data Freshness

```bash
# Generate freshness report
node tools/scraper/freshness-checker.js

# Custom thresholds
node tools/scraper/freshness-checker.js --verify-threshold 5 --stale-threshold 10

# JSON output
node tools/scraper/freshness-checker.js --json

# Save report to a specific file
node tools/scraper/freshness-checker.js --output freshness-report.json

# Verbose mode
node tools/scraper/freshness-checker.js --verbose
```

The freshness checker reports:
- **Age distribution**: How many listings are fresh (<3d), recent (3-7d), aging (7-14d), or stale (>14d)
- **Freshness score**: 0-100 composite score
- **Region breakdown**: Average data age and stale percentage per region
- **Frozen DOM detection**: Listings where DOM values appear to be stuck
- **Scrape priorities**: Which regions need scraping most urgently
- **Verification queue**: Listings that need re-verification, sorted by staleness

## Configuration Reference

All configuration lives in `config.json`. Key sections:

### sources

Array of scraping sources. Each source has:

| Field | Description |
|-------|-------------|
| `name` | Internal identifier (e.g., "rew", "realtor") |
| `displayName` | Human-readable name |
| `baseUrl` | Base URL for the source |
| `type` | "web" (HTML scraping), "api" (REST API), or "supplementary" |
| `regions` | Region-specific configuration (URLs, API params, neighborhoods) |
| `selectors` | CSS selectors for HTML parsing (web type only) |
| `rateLimit` | `requestsPerMinute` and `delayMs` between requests |
| `enabled` | Boolean to enable/disable the source |

### validation

| Field | Description |
|-------|-------------|
| `requiredFields` | Fields that must be present on every listing |
| `priceRange` | Min/max valid price values |
| `validTypes` | Allowed property type strings |
| `validRegions` | Allowed region names |

### regionBounds

Latitude/longitude bounding boxes per region, used to validate coordinates.

### neighborhoodRegionMap

Maps each neighborhood name to its parent region, used to validate consistency.

### geocoding

Configuration for the Nominatim (OpenStreetMap) geocoding service used when listings are missing lat/lng coordinates.

### Adding a New Scraping Source

1. Add a source entry to the `sources` array in `config.json`
2. Create an adapter function in `scraper.js` (see `scrapeRew` and `scrapeRealtor` as examples)
3. Register the adapter in the main switch statement in `scraper.js`

```json
{
  "name": "new-source",
  "displayName": "New Source Name",
  "baseUrl": "https://example.com",
  "type": "web",
  "regions": {
    "region-slug": {
      "searchUrl": "/search/path",
      "neighborhoods": ["Hood1", "Hood2"]
    }
  },
  "selectors": {
    "listingContainer": ".card",
    "address": ".address",
    "price": ".price"
  },
  "rateLimit": { "requestsPerMinute": 10, "delayMs": 6000 },
  "enabled": true
}
```

## Listing Data Format

Each listing is normalized to this schema:

```json
{
  "addr": "123 Main St",
  "price": 850000,
  "beds": 3,
  "baths": 2,
  "sqft": 1800,
  "type": "House",
  "lot": "50x120",
  "agent": "Jane Doe, ABC Realty",
  "neighborhood": "White Rock",
  "dom": 45,
  "yearBuilt": 2005,
  "waterView": false,
  "latitude": 49.025,
  "longitude": -122.807,
  "region": "South Surrey / White Rock"
}
```

Valid property types: `House`, `Apt/Condo`, `Townhouse`, `Land/Lot`, `Duplex`, `Mfd Home`

Valid regions: `South Surrey / White Rock`, `Vancouver Island` (extensible via add-region.js)

## Legal Considerations and Rate Limiting Ethics

This scraping pipeline is designed with responsible data collection in mind:

- **Rate limiting**: All sources have configurable rate limits. Default delays are 6-12 seconds between requests, well below typical abuse thresholds. Never set delays below 2 seconds.
- **robots.txt**: Always check and respect each source's `robots.txt` file before enabling a new source. If scraping is disallowed, do not scrape.
- **User-Agent identification**: The scraper sends a descriptive User-Agent string. Consider customizing it to include contact information.
- **Minimal footprint**: Only scrape what you need. Use region and source filters to limit requests. Use `--dry-run` to test without making unnecessary requests.
- **Caching**: Avoid re-scraping data that has not changed. The freshness checker helps identify what actually needs refreshing.
- **Terms of service**: Review each source's terms of service. Some sites explicitly prohibit automated scraping. Use API endpoints when available (Realtor.ca provides one).
- **Data use**: Scraped data should only be used for personal research and dashboard display, not for redistribution or commercial purposes without permission.
- **Graceful handling**: If a source returns errors or blocks requests, back off rather than retrying aggressively.

## Data Freshness Strategy

The pipeline supports a tiered freshness approach:

1. **Daily incremental scrapes**: Quick checks for new listings and price changes. Use `--region` to target specific areas.
2. **Weekly full scrapes**: Complete re-scrape of all regions every Sunday (configurable in `scheduling.fullScrapeDay`).
3. **Freshness monitoring**: Run `freshness-checker.js` regularly to identify stale data and prioritize scrape targets.
4. **DOM tracking**: The validator and freshness checker flag frozen DOM values, indicating data that needs refreshing.
5. **Price history**: All price changes are recorded by the merger, enabling trend analysis.
6. **Backup strategy**: Every merge creates a timestamped backup in `data/backups/`, allowing rollback if needed.

### Recommended Workflow

```bash
# 1. Check current data freshness
node tools/scraper/freshness-checker.js

# 2. Run a scrape (dry run first)
node tools/scraper/scraper.js --dry-run

# 3. Run the actual scrape
node tools/scraper/scraper.js

# 4. Validate the scraped data
node tools/scraper/validator.js

# 5. Merge into the main dataset
node tools/scraper/merger.js --from-scraper

# 6. Verify the merged data
node tools/scraper/validator.js

# 7. Seed the database
npm run seed
```

## Generated Reports

Each tool saves its last report as a JSON file in the scraper directory:

- `last-scrape-report.json` -- Scraper run summary
- `last-validation-report.json` -- Validation results and quality score
- `last-merge-report.json` -- Merge change log
- `last-freshness-report.json` -- Data freshness analysis

These files are overwritten on each run and are useful for monitoring pipeline health.

## Troubleshooting

**No listings scraped**: This is expected when running against live sites without proper access. The infrastructure is ready -- actual scraping results depend on the source sites being accessible and the selectors being up to date.

**Geocoding is slow**: Nominatim rate-limits to 1 request per second. Use `--no-geocode` if coordinates already exist in your data.

**Validation errors on merge**: Run `validator.js --fix` to auto-correct common issues (type coercion, region mismatches) before merging.

**Backups filling up disk**: Periodically clean `data/backups/`. Only the most recent backup is needed for rollback.
