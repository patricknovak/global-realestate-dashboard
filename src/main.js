/**
 * Main entry point - this file is not used directly by esbuild.
 * The esbuild config uses a concat plugin to merge all src/ modules.
 * This file documents the module load order for reference.
 *
 * Module structure:
 *   utils.js       - HTML escaping, script loaders (escapeHtml, loadScript, loadLeaflet, etc.)
 *   membership.js  - Member gate, signup/login, member UI
 *   state.js       - Global state, data loading, shortlist, investor mode
 *   filters.js     - Filter init, deal scoring, applyFilters, rendering, detail modals
 *   deals.js       - Stale deals, seller motivation, email templates, negotiations
 *   offers.js      - Offer builder, PDF generation, jurisdiction-aware offers
 *   presets.js     - Saved filter presets, search alerts
 *   calculators.js - Rescission, affordability, mortgage, comparison, CMHC, cash-to-close
 *   tools.js       - Notes, tags, dashboard home, buyer profile, offers tracking, ROI, lenders
 *   views.js       - Dark mode, export, contact log, due diligence, viewings, documents, charts
 *   ui.js          - Welcome banner, jurisdiction tax, keyboard shortcuts, recently viewed
 */
