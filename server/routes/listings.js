/**
 * Listings API routes
 *
 * GET    /api/v1/listings              - List all listings with filters, pagination, sorting
 * GET    /api/v1/listings/stats        - Aggregate statistics
 * GET    /api/v1/listings/stale        - Listings not updated in 7+ days
 * GET    /api/v1/listings/:id          - Single listing with price history
 * GET    /api/v1/listings/:id/price-history  - Price history for a listing
 * GET    /api/v1/listings/:id/comparables    - Comparable sales nearby
 * POST   /api/v1/listings/:id/flag     - Community flag a listing
 */

const express = require('express');
const router = express.Router();

module.exports = function (db) {
  // ---------------------------------------------------------------
  // GET /listings/stats - Aggregate statistics (defined before :id)
  // ---------------------------------------------------------------
  router.get('/stats', (req, res) => {
    try {
      const totalListings = db.prepare('SELECT COUNT(*) as count FROM listings').get();
      const activeListings = db.prepare("SELECT COUNT(*) as count FROM listings WHERE status = 'active'").get();

      const avgPrice = db.prepare('SELECT AVG(price) as avg FROM listings WHERE status = ?').get('active');
      const medianPrice = db.prepare(`
        SELECT price FROM listings WHERE status = 'active'
        ORDER BY price LIMIT 1
        OFFSET (SELECT COUNT(*) / 2 FROM listings WHERE status = 'active')
      `).get();

      const byRegion = db.prepare(`
        SELECT region, COUNT(*) as count, AVG(price) as avg_price,
               MIN(price) as min_price, MAX(price) as max_price
        FROM listings WHERE status = 'active'
        GROUP BY region
      `).all();

      const byType = db.prepare(`
        SELECT type, COUNT(*) as count, AVG(price) as avg_price
        FROM listings WHERE status = 'active'
        GROUP BY type ORDER BY count DESC
      `).all();

      const byNeighborhood = db.prepare(`
        SELECT neighborhood, COUNT(*) as count, AVG(price) as avg_price,
               AVG(dom) as avg_dom
        FROM listings WHERE status = 'active'
        GROUP BY neighborhood ORDER BY count DESC
      `).all();

      const avgDom = db.prepare('SELECT AVG(dom) as avg FROM listings WHERE status = ?').get('active');

      const priceRanges = db.prepare(`
        SELECT
          SUM(CASE WHEN price < 500000 THEN 1 ELSE 0 END) as under_500k,
          SUM(CASE WHEN price >= 500000 AND price < 1000000 THEN 1 ELSE 0 END) as "500k_1m",
          SUM(CASE WHEN price >= 1000000 AND price < 2000000 THEN 1 ELSE 0 END) as "1m_2m",
          SUM(CASE WHEN price >= 2000000 AND price < 5000000 THEN 1 ELSE 0 END) as "2m_5m",
          SUM(CASE WHEN price >= 5000000 THEN 1 ELSE 0 END) as over_5m
        FROM listings WHERE status = 'active'
      `).get();

      res.json({
        success: true,
        data: {
          total: totalListings.count,
          active: activeListings.count,
          avgPrice: avgPrice.avg ? Math.round(avgPrice.avg) : 0,
          medianPrice: medianPrice ? medianPrice.price : 0,
          avgDaysOnMarket: avgDom.avg ? Math.round(avgDom.avg) : 0,
          byRegion,
          byType,
          byNeighborhood,
          priceRanges,
        },
      });
    } catch (err) {
      console.error('[LISTINGS] Stats error:', err.message);
      res.status(500).json({ success: false, error: 'Failed to retrieve statistics.' });
    }
  });

  // ---------------------------------------------------------------
  // GET /listings/stale - Listings not updated in 7+ days
  // ---------------------------------------------------------------
  router.get('/stale', (req, res) => {
    try {
      const daysThreshold = parseInt(req.query.days, 10) || 7;
      const stale = db.prepare(`
        SELECT * FROM listings
        WHERE status = 'active'
          AND updated_at < datetime('now', ?)
        ORDER BY updated_at ASC
      `).all(`-${daysThreshold} days`);

      res.json({
        success: true,
        data: stale,
        meta: {
          threshold_days: daysThreshold,
          count: stale.length,
        },
      });
    } catch (err) {
      console.error('[LISTINGS] Stale error:', err.message);
      res.status(500).json({ success: false, error: 'Failed to retrieve stale listings.' });
    }
  });

  // ---------------------------------------------------------------
  // GET /listings - List all with filters, pagination, sorting
  // ---------------------------------------------------------------
  router.get('/', (req, res) => {
    try {
      const {
        region,
        neighborhood,
        type,
        status,
        min_price,
        max_price,
        min_beds,
        max_beds,
        min_baths,
        max_baths,
        water_view,
        sort_by = 'price',
        sort_order = 'DESC',
        page = 1,
        limit = 50,
        search,
      } = req.query;

      const conditions = [];
      const params = {};

      if (region) {
        conditions.push('region = @region');
        params.region = region;
      }
      if (neighborhood) {
        conditions.push('neighborhood = @neighborhood');
        params.neighborhood = neighborhood;
      }
      if (type) {
        conditions.push('type = @type');
        params.type = type;
      }
      if (status) {
        conditions.push('status = @status');
        params.status = status;
      }
      if (min_price) {
        conditions.push('price >= @min_price');
        params.min_price = parseFloat(min_price);
      }
      if (max_price) {
        conditions.push('price <= @max_price');
        params.max_price = parseFloat(max_price);
      }
      if (min_beds) {
        conditions.push('beds >= @min_beds');
        params.min_beds = parseInt(min_beds, 10);
      }
      if (max_beds) {
        conditions.push('beds <= @max_beds');
        params.max_beds = parseInt(max_beds, 10);
      }
      if (min_baths) {
        conditions.push('baths >= @min_baths');
        params.min_baths = parseInt(min_baths, 10);
      }
      if (max_baths) {
        conditions.push('baths <= @max_baths');
        params.max_baths = parseInt(max_baths, 10);
      }
      if (water_view === 'true' || water_view === '1') {
        conditions.push('water_view = 1');
      }
      if (search) {
        conditions.push('(addr LIKE @search OR agent LIKE @search OR neighborhood LIKE @search)');
        params.search = `%${search}%`;
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      // Validate sort column to prevent SQL injection
      const allowedSortColumns = ['price', 'beds', 'baths', 'sqft', 'dom', 'year_built', 'neighborhood', 'region', 'created_at', 'updated_at'];
      const safeSortBy = allowedSortColumns.includes(sort_by) ? sort_by : 'price';
      const safeSortOrder = sort_order.toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const pageSize = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
      const offset = (pageNum - 1) * pageSize;

      const countResult = db.prepare(`SELECT COUNT(*) as total FROM listings ${whereClause}`).get(params);
      const total = countResult.total;

      const listings = db.prepare(`
        SELECT * FROM listings ${whereClause}
        ORDER BY ${safeSortBy} ${safeSortOrder}
        LIMIT @limit OFFSET @offset
      `).all({ ...params, limit: pageSize, offset });

      res.json({
        success: true,
        data: listings,
        meta: {
          total,
          page: pageNum,
          limit: pageSize,
          totalPages: Math.ceil(total / pageSize),
        },
      });
    } catch (err) {
      console.error('[LISTINGS] List error:', err.message);
      res.status(500).json({ success: false, error: 'Failed to retrieve listings.' });
    }
  });

  // ---------------------------------------------------------------
  // GET /listings/:id - Single listing with price history
  // ---------------------------------------------------------------
  router.get('/:id', (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ success: false, error: 'Invalid listing ID.' });
      }

      const listing = db.prepare('SELECT * FROM listings WHERE id = ?').get(id);
      if (!listing) {
        return res.status(404).json({ success: false, error: 'Listing not found.' });
      }

      const priceHistory = db.prepare(
        'SELECT * FROM price_history WHERE listing_id = ? ORDER BY change_date DESC'
      ).all(id);

      const flags = db.prepare(
        'SELECT * FROM community_flags WHERE listing_id = ? ORDER BY created_at DESC'
      ).all(id);

      res.json({
        success: true,
        data: {
          ...listing,
          price_history: priceHistory,
          community_flags: flags,
        },
      });
    } catch (err) {
      console.error('[LISTINGS] Get error:', err.message);
      res.status(500).json({ success: false, error: 'Failed to retrieve listing.' });
    }
  });

  // ---------------------------------------------------------------
  // GET /listings/:id/price-history
  // ---------------------------------------------------------------
  router.get('/:id/price-history', (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ success: false, error: 'Invalid listing ID.' });
      }

      const listing = db.prepare('SELECT id, addr, price FROM listings WHERE id = ?').get(id);
      if (!listing) {
        return res.status(404).json({ success: false, error: 'Listing not found.' });
      }

      const history = db.prepare(
        'SELECT * FROM price_history WHERE listing_id = ? ORDER BY change_date DESC'
      ).all(id);

      res.json({
        success: true,
        data: {
          listing_id: listing.id,
          addr: listing.addr,
          current_price: listing.price,
          history,
        },
      });
    } catch (err) {
      console.error('[LISTINGS] Price history error:', err.message);
      res.status(500).json({ success: false, error: 'Failed to retrieve price history.' });
    }
  });

  // ---------------------------------------------------------------
  // GET /listings/:id/comparables - Find comparable sales nearby
  // ---------------------------------------------------------------
  router.get('/:id/comparables', (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ success: false, error: 'Invalid listing ID.' });
      }

      const listing = db.prepare('SELECT * FROM listings WHERE id = ?').get(id);
      if (!listing) {
        return res.status(404).json({ success: false, error: 'Listing not found.' });
      }

      const radiusPercent = parseFloat(req.query.price_range) || 0.2; // default 20% price range
      const minPrice = listing.price * (1 - radiusPercent);
      const maxPrice = listing.price * (1 + radiusPercent);

      // Find comparable sales in the same neighborhood with similar price range
      const comparables = db.prepare(`
        SELECT * FROM comparable_sales
        WHERE neighborhood = @neighborhood
          AND sold_price BETWEEN @min_price AND @max_price
        ORDER BY ABS(sold_price - @target_price) ASC
        LIMIT 10
      `).all({
        neighborhood: listing.neighborhood,
        min_price: minPrice,
        max_price: maxPrice,
        target_price: listing.price,
      });

      // Also find similar active listings for comparison
      const similarActive = db.prepare(`
        SELECT * FROM listings
        WHERE id != @id
          AND neighborhood = @neighborhood
          AND type = @type
          AND status = 'active'
          AND price BETWEEN @min_price AND @max_price
        ORDER BY ABS(price - @target_price) ASC
        LIMIT 10
      `).all({
        id,
        neighborhood: listing.neighborhood,
        type: listing.type,
        min_price: minPrice,
        max_price: maxPrice,
        target_price: listing.price,
      });

      res.json({
        success: true,
        data: {
          listing: { id: listing.id, addr: listing.addr, price: listing.price, type: listing.type },
          comparable_sales: comparables,
          similar_active: similarActive,
        },
      });
    } catch (err) {
      console.error('[LISTINGS] Comparables error:', err.message);
      res.status(500).json({ success: false, error: 'Failed to retrieve comparables.' });
    }
  });

  // ---------------------------------------------------------------
  // POST /listings/:id/flag - Community flag a listing
  // ---------------------------------------------------------------
  router.post('/:id/flag', (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ success: false, error: 'Invalid listing ID.' });
      }

      const listing = db.prepare('SELECT id FROM listings WHERE id = ?').get(id);
      if (!listing) {
        return res.status(404).json({ success: false, error: 'Listing not found.' });
      }

      const { flag_type, reported_value, notes, reporter_id } = req.body;

      const validFlagTypes = ['sold', 'price_wrong', 'delisted', 'info_incorrect', 'duplicate'];
      if (!flag_type || !validFlagTypes.includes(flag_type)) {
        return res.status(400).json({
          success: false,
          error: `flag_type is required and must be one of: ${validFlagTypes.join(', ')}`,
        });
      }

      const result = db.prepare(`
        INSERT INTO community_flags (listing_id, flag_type, reported_value, notes, reporter_id)
        VALUES (@listing_id, @flag_type, @reported_value, @notes, @reporter_id)
      `).run({
        listing_id: id,
        flag_type,
        reported_value: reported_value || null,
        notes: notes || null,
        reporter_id: reporter_id || null,
      });

      // If there are 3+ pending flags for the same listing, auto-flag the listing
      const flagCount = db.prepare(`
        SELECT COUNT(*) as count FROM community_flags
        WHERE listing_id = ? AND status = 'pending'
      `).get(id);

      if (flagCount.count >= 3) {
        db.prepare("UPDATE listings SET status = 'flagged', updated_at = datetime('now') WHERE id = ?").run(id);
      }

      res.status(201).json({
        success: true,
        data: {
          id: result.lastInsertRowid,
          listing_id: id,
          flag_type,
          status: 'pending',
        },
        message: 'Flag submitted successfully. It will be reviewed.',
      });
    } catch (err) {
      console.error('[LISTINGS] Flag error:', err.message);
      res.status(500).json({ success: false, error: 'Failed to submit flag.' });
    }
  });

  return router;
};
