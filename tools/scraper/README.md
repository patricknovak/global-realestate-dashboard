# Scraping Pipeline

Manual scraping pipeline for the Global Real Estate Dashboard. Collects, validates, and merges listing data from multiple sources.

## Architecture

```
config.json          → Source configuration and validation rules
scraper.js           → Main scraping engine (REW.ca, Realtor.ca)
validator.js         → Data validation and quality checks
merger.js            → Merge scraped data with existing listings
add-region.js        → Interactive helper to add new regions
freshness-checker.js → Monitor data age and freshness
```

## Quick Start

### Run a Full Scrape

```bash
# Scrape all enabled sources (dry run first)
node tools/scraper/scraper.js --dry-run

# Scrape for real
node tools/scraper/scraper.js

# Scrape a specific region
node tools/scraper/scraper.js --region "Vancouver Island"

# Scrape a specific source
node tools/scraper/scraper.js --source rew
```

### Validate Data

```bash
# Validate current listings data
node tools/scraper/validator.js

# Validate a specific file
node tools/scraper/validator.js --input path/to/listings.json

# Output as JSON
node tools/scraper/validator.js --json
```

### Merge Scraped Data

```bash
# Merge new scrape with existing data (creates backup automatically)
node tools/scraper/merger.js --incoming scraped-data.json

# Merge from last scraper output
node tools/scraper/merger.js --from-scraper

# Dry run (see what would change)
node tools/scraper/merger.js --incoming scraped-data.json --dry-run

# Mark removed listings instead of dropping them
node tools/scraper/merger.js --incoming scraped-data.json --mark-removed
```

### Add a New Region

```bash
# Interactive region setup
node tools/scraper/add-region.js

# This will:
# 1. Prompt for region name and neighborhoods
# 2. Set up scraping source URLs
# 3. Generate benchmark estimates
# 4. Update config.json and benchmarks.json
```

### Check Data Freshness

```bash
# Generate freshness report
node tools/scraper/freshness-checker.js

# Custom stale threshold
node tools/scraper/freshness-checker.js --threshold 7

# JSON output
node tools/scraper/freshness-checker.js --json
```

## Configuration

Edit `config.json` to customize:

- **sources**: Scraping targets (URLs, selectors, rate limits)
- **output**: Where scraped data is saved
- **scheduling**: Scrape frequency
- **validation**: Data quality rules

### Adding a New Source

Add an entry to `sources` in `config.json`:

```json
{
  "name": "new-source",
  "displayName": "New Source",
  "baseUrl": "https://example.com",
  "type": "web",
  "regions": { ... },
  "selectors": { ... },
  "rateLimit": { "requestsPerMinute": 10, "delayMs": 6000 },
  "enabled": true
}
```

## Data Flow

```
Sources (REW, Realtor.ca) → scraper.js → raw scraped data
                                              ↓
                                        validator.js → validation report
                                              ↓
existing listings.json → merger.js ← validated scrape data
                              ↓
                    merged listings.json (with backup)
                              ↓
                    seed.js → SQLite database
```

## Rate Limiting & Ethics

- All sources have configurable rate limits (default: 5-10 req/min)
- Respect `robots.txt` for each source
- Do not scrape more frequently than needed (daily is sufficient)
- Use user-agent strings that identify the scraper
- Cache responses to avoid duplicate requests
- If a source blocks you, respect the block and adjust timing

## Data Freshness Strategy

1. **Daily incremental scrapes**: Quick check for new listings and price changes
2. **Weekly full scrapes**: Complete re-scrape of all regions
3. **Community corrections**: Users can flag stale/incorrect data via the UI
4. **DOM monitoring**: Detect frozen DOM values that indicate stale data
5. **Price history**: Track all price changes for trend analysis

## Listing Data Format

Each listing must conform to this schema:

```json
{
  "addr": "123 Main St",        // Required
  "price": 850000,              // Required, number
  "beds": 3,                    // Integer
  "baths": 2,                   // Integer
  "sqft": 1800,                 // Integer
  "type": "House",              // One of: House, Apt/Condo, Townhouse, Land/Lot, Duplex, Mfd Home
  "lot": "50x120",              // String or null
  "agent": "Jane Doe, ABC Co",  // String
  "neighborhood": "White Rock", // Required, must match known neighborhoods
  "dom": 45,                    // Integer, days on market
  "yearBuilt": 2005,            // Integer
  "waterView": false,           // Boolean
  "latitude": 49.025,           // Required, number
  "longitude": -122.807,        // Required, number
  "region": "South Surrey / White Rock"  // Required, must match known regions
}
```
