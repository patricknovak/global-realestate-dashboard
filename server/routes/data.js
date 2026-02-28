/**
 * Data API routes - Benchmarks, neighborhoods, freshness, export
 *
 * GET /api/v1/data/benchmarks      - Return benchmarks, trends, trendBonus
 * GET /api/v1/data/neighborhoods    - Neighborhood enrichment data
 * GET /api/v1/data/freshness        - Data freshness report (how old data is per region)
 * GET /api/v1/data/export           - Export all data as JSON
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();

const BENCHMARKS_PATH = path.resolve(__dirname, '../../data/benchmarks.json');

module.exports = function (db) {
  // ---------------------------------------------------------------
  // GET /data/benchmarks - Return benchmarks, trends, trendBonus
  // ---------------------------------------------------------------
  router.get('/benchmarks', (req, res) => {
    try {
      if (!fs.existsSync(BENCHMARKS_PATH)) {
        return res.status(404).json({
          success: false,
          error: 'Benchmarks data file not found.',
        });
      }

      const benchmarks = JSON.parse(fs.readFileSync(BENCHMARKS_PATH, 'utf-8'));

      res.json({
        success: true,
        data: {
          neighborhoodBenchmarks: benchmarks.neighborhoodBenchmarks || {},
          trendBonus: benchmarks.trendBonus || {},
          marketTrends: benchmarks.marketTrends || {},
          metadata: benchmarks.metadata || {},
        },
      });
    } catch (err) {
      console.error('[DATA] Benchmarks error:', err.message);
      res.status(500).json({ success: false, error: 'Failed to retrieve benchmarks.' });
    }
  });

  // ---------------------------------------------------------------
  // GET /data/neighborhoods - Neighborhood enrichment data
  // ---------------------------------------------------------------
  router.get('/neighborhoods', (req, res) => {
    try {
      const { neighborhood, region } = req.query;

      const conditions = [];
      const params = {};

      if (neighborhood) {
        conditions.push('neighborhood = @neighborhood');
        params.neighborhood = neighborhood;
      }
      if (region) {
        conditions.push('region = @region');
        params.region = region;
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const neighborhoods = db.prepare(`
        SELECT * FROM neighborhood_data ${whereClause} ORDER BY neighborhood ASC
      `).all(params);

      // Parse JSON fields for each record
      const parsed = neighborhoods.map((n) => ({
        ...n,
        schools_nearby: n.schools_nearby ? JSON.parse(n.schools_nearby) : [],
        amenities: n.amenities ? JSON.parse(n.amenities) : [],
      }));

      res.json({
        success: true,
        data: parsed,
        meta: { count: parsed.length },
      });
    } catch (err) {
      console.error('[DATA] Neighborhoods error:', err.message);
      res.status(500).json({ success: false, error: 'Failed to retrieve neighborhood data.' });
    }
  });

  // ---------------------------------------------------------------
  // GET /data/freshness - Data freshness report per region
  // ---------------------------------------------------------------
  router.get('/freshness', (req, res) => {
    try {
      const freshness = db.prepare(`
        SELECT
          region,
          COUNT(*) as total_listings,
          MIN(updated_at) as oldest_update,
          MAX(updated_at) as newest_update,
          AVG(julianday('now') - julianday(updated_at)) as avg_age_days,
          SUM(CASE WHEN julianday('now') - julianday(updated_at) > 7 THEN 1 ELSE 0 END) as stale_count,
          SUM(CASE WHEN julianday('now') - julianday(updated_at) <= 1 THEN 1 ELSE 0 END) as fresh_count,
          SUM(CASE WHEN julianday('now') - julianday(updated_at) BETWEEN 1 AND 7 THEN 1 ELSE 0 END) as aging_count
        FROM listings
        WHERE status = 'active'
        GROUP BY region
        ORDER BY avg_age_days DESC
      `).all();

      const overall = db.prepare(`
        SELECT
          COUNT(*) as total_listings,
          MIN(updated_at) as oldest_update,
          MAX(updated_at) as newest_update,
          AVG(julianday('now') - julianday(updated_at)) as avg_age_days,
          SUM(CASE WHEN julianday('now') - julianday(updated_at) > 7 THEN 1 ELSE 0 END) as stale_count
        FROM listings
        WHERE status = 'active'
      `).get();

      res.json({
        success: true,
        data: {
          byRegion: freshness.map((r) => ({
            ...r,
            avg_age_days: r.avg_age_days ? Math.round(r.avg_age_days * 10) / 10 : 0,
          })),
          overall: {
            ...overall,
            avg_age_days: overall.avg_age_days ? Math.round(overall.avg_age_days * 10) / 10 : 0,
          },
        },
      });
    } catch (err) {
      console.error('[DATA] Freshness error:', err.message);
      res.status(500).json({ success: false, error: 'Failed to retrieve freshness data.' });
    }
  });

  // ---------------------------------------------------------------
  // GET /data/export - Export all data as JSON
  // ---------------------------------------------------------------
  router.get('/export', (req, res) => {
    try {
      const listings = db.prepare('SELECT * FROM listings ORDER BY id ASC').all();
      const priceHistory = db.prepare('SELECT * FROM price_history ORDER BY listing_id, change_date').all();
      const comparableSales = db.prepare('SELECT * FROM comparable_sales ORDER BY id ASC').all();
      const communityFlags = db.prepare('SELECT * FROM community_flags ORDER BY id ASC').all();
      const viewings = db.prepare('SELECT * FROM viewings ORDER BY id ASC').all();
      const neighborhoodData = db.prepare('SELECT * FROM neighborhood_data ORDER BY neighborhood ASC').all();
      const scrapeJobs = db.prepare('SELECT * FROM scrape_jobs ORDER BY id DESC LIMIT 100').all();

      // Read benchmarks file
      let benchmarks = {};
      if (fs.existsSync(BENCHMARKS_PATH)) {
        benchmarks = JSON.parse(fs.readFileSync(BENCHMARKS_PATH, 'utf-8'));
      }

      const exportData = {
        exportedAt: new Date().toISOString(),
        listings,
        priceHistory,
        comparableSales,
        communityFlags,
        viewings,
        neighborhoodData: neighborhoodData.map((n) => ({
          ...n,
          schools_nearby: n.schools_nearby ? JSON.parse(n.schools_nearby) : [],
          amenities: n.amenities ? JSON.parse(n.amenities) : [],
        })),
        scrapeJobs,
        benchmarks,
      };

      // Set headers for file download
      res.setHeader('Content-Type', 'application/json');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="realestate-export-${new Date().toISOString().split('T')[0]}.json"`
      );

      res.json({
        success: true,
        data: exportData,
      });
    } catch (err) {
      console.error('[DATA] Export error:', err.message);
      res.status(500).json({ success: false, error: 'Failed to export data.' });
    }
  });

  return router;
};
