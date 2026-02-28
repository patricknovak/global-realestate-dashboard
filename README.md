# BC Real Estate Buyer's Dashboard

A free, open-source dashboard for unrepresented home buyers in British Columbia. Browse 400+ listings, generate offer letters, compare mortgages, score deals, and negotiate directly with sellers — no realtor required.

**Live site:** [patricknovak.github.io/global-realestate-dashboard](https://patricknovak.github.io/global-realestate-dashboard/)

## Features

- **Deal Scoring** — Weighted algorithm scores every listing (0–100) based on DOM, benchmark pricing, $/sqft, age, and market trends
- **Offer Generator** — PDF offer letter builder with BC-specific subject clauses, deposit terms, and irrevocability periods
- **Stale Deal Finder** — Identifies high-DOM listings with motivated sellers and generates negotiation strategies
- **Mortgage Calculator** — Amortization, CMHC insurance, and BC Property Transfer Tax (with FTHB exemption)
- **Neighborhood Comparison** — Side-by-side comparison of walk scores, transit scores, crime indices, and market trends
- **20 Dashboard Tabs** — Listings, map, deals, offers, shortlist, financing, ROI, lenders, contact log, viewings, documents, and more

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
data/listings.json      Listing data (JSON, loaded via fetch)
data.json               Market benchmarks, trends, lenders, brokers
tools/scraper/          Scraping pipeline (config, scraper, validator, merger)
```

## Deployment

Hosted on GitHub Pages. Push to `main` to deploy:

```bash
git add -A && git commit -m "Update listings" && git push origin main
```

## Disclaimer

This tool is for informational purposes only. It is not legal advice. Have a BC lawyer or notary review any offer before submission.
