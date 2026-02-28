# BC Real Estate Buyer's Dashboard

A free, open-source dashboard for unrepresented home buyers in British Columbia. Browse 400+ listings, generate offer letters, compare mortgages, score deals, and negotiate directly with sellers — no realtor required.

**Live site:** [patricknovak.github.io/global-realestate-dashboard](https://patricknovak.github.io/global-realestate-dashboard/)

## Features

### Browse & Analyze
- **Deal Scoring** — Weighted algorithm scores every listing (0–100) based on DOM, benchmark pricing, $/sqft, age, and market trends. Customizable score weights.
- **Interactive Map** — Leaflet + MarkerCluster map with color-coded pins by deal score
- **Stale Deal Finder** — Identifies high-DOM listings with motivated sellers, generates negotiation strategies, and suggests lowball offers
- **Investor Mode** — Toggle to show estimated cap rate, cash flow, and rent on every listing. Filter by minimum cap rate or cash flow.
- **Property Comparison** — Select up to 4 properties and compare side-by-side with "winner" highlighting across 17 metrics
- **Neighborhood Comparison** — Compare walk scores, transit scores, crime indices, market trends, and closing costs across areas

### Offers & Negotiation
- **Offer Generator** — PDF offer letter builder with BC-specific subject clauses, deposit terms, irrevocability periods, and legal disclaimer
- **Private Offers** — Target off-market properties with letter of intent generator (3 variants), private sale offer generator with PDF, and process guide
- **Quick Offer** — Lightning bolt shortcut on property cards opens offer builder instantly
- **Rescission Calculator** — BC Home Buyer Rescission Period calculator (3 business days, excludes weekends and BC statutory holidays, 0.25% fee)
- **Email Templates** — Pre-built inquiry and negotiation templates for stale listings

### Financial Tools
- **Financing Hub** — Mortgage calculator with CMHC insurance, amortization schedule, and full payment breakdown
- **Property Transfer Tax** — Accurate BC PTT with 4-tier rates (1%, 2%, 3%, 5%) and FTHB/new build exemptions per gov.bc.ca
- **Cash-to-Close** — Comprehensive closing day calculator: down payment, PTT, legal fees, inspection, insurance, moving costs, and emergency reserve
- **ROI Calculator** — Cap rate, cash-on-cash, DSCR, price-to-rent, 1% rule, break-even analysis, 5-year appreciation projections, and 3-scenario comparison
- **Lender Directory** — Compare mortgage rates from major Canadian lenders and BC mortgage brokers

### Organization
- **Shortlist** — Star properties to save them, add notes, track due diligence checklists
- **Saved Search Alerts** — Save filter configurations and get notified when new listings match
- **My Offers** — Track offer status (pending, accepted, rejected, countered) across all generated offers
- **Contact Log** — Record all communications with agents, sellers, lawyers, and inspectors
- **Viewings** — Schedule and track property viewings with notes and ratings
- **Documents** — Upload and organize transaction documents

### 21+ Dashboard Tabs
Dashboard, Listings, Map, Neighborhoods, Deals, Offers, My Offers, Shortlist, Compare, Financing, ROI, Lenders, Profile, Contact Log, Viewings, Documents, Price History, Area Intel, Data Health, No-Realtor Guide, Private Offers, Help

## Technical Details

- **Single-page application** — One HTML file + external CSS, no build step required
- **Zero backend** — All data stored in localStorage, no server or database needed
- **Lazy-loaded libraries** — Chart.js, Leaflet, and jsPDF loaded on demand for fast initial page load
- **Mobile responsive** — Category-grouped dropdown navigation on mobile, responsive tables and modals
- **Dark mode** — Toggle in header for comfortable viewing
- **Data export** — CSV export for filtered listings and shortlist

## Updating Listing Data

The dashboard ships with sample listings. To populate with real data:

1. **Configure regions** — Edit `tools/scraper/config.json` to set target regions and sources
2. **Run the scraper** — `node tools/scraper/scraper.js`
3. **Validate results** — `node tools/scraper/validator.js`
4. **Merge into dashboard** — `node tools/scraper/merger.js` (outputs to `data/listings.json`)
5. **Deploy** — Commit and push; GitHub Pages will update automatically

See [`tools/scraper/README.md`](tools/scraper/README.md) for full scraper documentation.

## Project Structure

```
index.html              Main application (single-page HTML + JS)
styles.css              Extracted CSS stylesheet
data/listings.json      Listing data (JSON, 417 listings)
data.json               Market benchmarks, trends, lenders, brokers
tools/scraper/          Scraping pipeline (config, scraper, validator, merger)
```

## Deployment

Hosted on GitHub Pages. Push to `main` to deploy:

```bash
git add -A && git commit -m "Update listings" && git push origin main
```

## Disclaimer

This tool is for informational purposes only. It is not legal advice. Have a BC lawyer or notary review any offer before submission. The Property Transfer Tax calculations follow the published BC government rates but should be verified with a legal professional. Rescission period calculations are estimates — consult the BC Property Law Act and a lawyer for definitive deadlines.
