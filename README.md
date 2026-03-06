# Global Real Estate Dashboard

A free, open-source dashboard for unrepresented home buyers across multiple jurisdictions. Browse listings in British Columbia, Alberta, Ontario, and California. Generate offer letters, compare mortgages, score deals, and negotiate directly with sellers — no realtor required.

**Live site:** [patricknovak.github.io/global-realestate-dashboard](https://patricknovak.github.io/global-realestate-dashboard/)

## Supported Regions

### British Columbia (CA-BC)
- **South Surrey / White Rock** — White Rock, Crescent Beach, Morgan Creek, Grandview Heights, and more
- **Vancouver Island** — Parksville, Qualicum Beach, Nanaimo, Courtenay, Comox, Campbell River
- **Vancouver** — Downtown, Kitsilano, Mount Pleasant, Kerrisdale, Point Grey, and more
- **Burnaby / New Westminster** — Metrotown, Brentwood, Downtown NW, Sapperton
- **North Shore** — Lower Lonsdale, Lynn Valley, Deep Cove, Ambleside, British Properties
- **Tri-Cities** — Coquitlam, Port Coquitlam, Port Moody
- **Ridge Meadows** — Maple Ridge, Pitt Meadows
- **Langley / Delta** — Langley City, Willoughby, Fort Langley, Tsawwassen, Ladner
- **Richmond** — Richmond Centre, Steveston, Brighouse, Terra Nova
- **Surrey (Expanded)** — Fleetwood, Guildford, Cloverdale, Newton, Fraser Heights
- **Sunshine Coast** — Gibsons, Sechelt, Roberts Creek, Halfmoon Bay
- **Okanagan** — Kelowna, West Kelowna, Penticton, Vernon, Summerland
- **Sea to Sky** — Whistler, Pemberton, Squamish
- **Gulf Islands** — Salt Spring, Galiano, Mayne, Pender, Saturna, Gabriola

### Alberta (CA-AB)
- **Edmonton** — Downtown, Oliver, Strathcona, Windermere, St. Albert, Sherwood Park
- **Hinton** — Hinton, Edson

### Ontario (CA-ON)
- **Toronto** — Downtown Core, Yorkville, Liberty Village, Leslieville, North York, Scarborough, Mississauga, Markham

### California, USA (US-CA)
- **Laguna Beach** — Laguna Beach, Dana Point, San Clemente, Newport Beach

## Features

### Browse & Analyze
- **Deal Scoring** — Weighted algorithm scores every listing (0-100) based on DOM, benchmark pricing, $/sqft, age, and market trends
- **Interactive Map** — Leaflet + MarkerCluster map with color-coded pins by deal score
- **Stale Deal Finder** — Identifies high-DOM listings with motivated sellers
- **Investor Mode** — Toggle to show cap rate, cash flow, and rent estimates
- **Property Comparison** — Side-by-side comparison of up to 4 properties across 17 metrics
- **Neighborhood Comparison** — Walk scores, transit scores, crime indices, market trends

### Offers & Negotiation
- **Offer Generator** — Jurisdiction-aware PDF offer letter builder with legal disclaimers per province/state
- **Private Offers** — Target off-market properties with letter of intent generator
- **Quick Offer** — Lightning bolt shortcut on property cards
- **Rescission Calculator** — Jurisdiction-aware: BC (3 business days, 0.25% fee), ON (10-day condo cooling-off), AB/CA (no statutory rescission)
- **Email Templates** — Pre-built inquiry and negotiation templates

### Financial Tools (Jurisdiction-Aware)
- **Financing Hub** — Mortgage calculator with CMHC insurance (Canada) or PMI (US), stress test for Canadian mortgages
- **Transfer Tax Calculator** — BC PTT (4-tier), Ontario LTT + Toronto Municipal LTT, Alberta registration fee, California county transfer tax, with FTHB exemptions
- **Cash-to-Close** — Comprehensive closing day calculator adapted per jurisdiction
- **ROI Calculator** — Cap rate, cash-on-cash, DSCR, 5-year projections
- **Lender Directory** — Compare mortgage rates from major lenders

### Organization
- **Shortlist** — Star properties, add notes, track due diligence
- **Saved Search Alerts** — Filter configurations with notifications
- **My Offers** — Track offer status across all generated offers
- **Contact Log** — Record communications with agents, sellers, lawyers
- **Viewings** — Schedule and track property viewings
- **Documents** — Upload and organize transaction documents

### 21+ Dashboard Tabs
Dashboard, Listings, Map, Neighborhoods, Deals, Offers, My Offers, Shortlist, Compare, Financing, ROI, Lenders, Profile, Contact Log, Viewings, Documents, Price History, Area Intel, Data Health, No-Realtor Guide, Private Offers, Help

## Technical Details

- **Single-page application** — One HTML file + external CSS, no build step required
- **Zero backend** — All data stored in localStorage, no server or database needed
- **Lazy-loaded libraries** — Chart.js, Leaflet, and jsPDF loaded on demand
- **Mobile responsive** — Category-grouped dropdown navigation on mobile
- **Dark mode** — Toggle in header
- **Multi-jurisdiction** — Jurisdiction-aware tax calculators, offer templates, and rescission rules
- **Data pipeline** — Configurable scraping from REW.ca (BC), Realtor.ca (all Canada), with Zillow/Redfin stubs (US)

## Updating Listing Data

1. **Configure regions** — Edit `tools/scraper/config.json` to set target regions and sources
2. **Add new regions** — `node tools/scraper/add-region.js` (supports --country, --province, --currency flags)
3. **Run the scraper** — `node tools/scraper/scraper.js`
4. **Validate results** — `node tools/scraper/validator.js`
5. **Merge into dashboard** — `node tools/scraper/merger.js`
6. **Deploy** — Commit and push; GitHub Pages will update automatically

See [`tools/scraper/README.md`](tools/scraper/README.md) for full scraper documentation.

## Project Structure

```
index.html              Main application (single-page HTML + JS)
styles.css              Extracted CSS stylesheet
data/listings.json      Listing data (JSON, 600+ listings across all regions)
data/benchmarks.json    Market benchmarks, trends per neighborhood
data.json               Lenders, brokers
tools/scraper/          Scraping pipeline (config, scraper, validator, merger, add-region)
server/                 Optional Express.js API server with SQLite
```

## Deployment

Hosted on GitHub Pages. Push to `main` to deploy:

```bash
git add -A && git commit -m "Update listings" && git push origin main
```

## Disclaimer

This tool is for informational purposes only. It is not legal advice. Have a lawyer or notary in the applicable jurisdiction review any offer before submission. Tax calculations follow published government rates but should be verified with a legal professional. Rescission period calculations are estimates — consult applicable legislation and a lawyer for definitive deadlines.
