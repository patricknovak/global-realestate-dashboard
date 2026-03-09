/**
 * Listings API routes
 *
 * GET    /api/v1/listings              - List all listings with filters, pagination, sorting
 * GET    /api/v1/listings/stats        - Aggregate statistics
 * GET    /api/v1/listings/stale        - Listings not updated in 7+ days
 * POST   /api/v1/listings              - Create a new listing
 * POST   /api/v1/listings/bulk         - Bulk import multiple listings
 * GET    /api/v1/listings/:id          - Single listing with price history
 * PUT    /api/v1/listings/:id          - Update a listing
 * DELETE /api/v1/listings/:id          - Delete a listing
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
  // Validation helpers
  // ---------------------------------------------------------------
  const VALID_TYPES = ['House', 'Apt/Condo', 'Townhouse', 'Land/Lot', 'Duplex', 'Mfd Home'];
  const VALID_STATUSES = ['active', 'sold', 'delisted', 'price_changed', 'flagged'];
  const VALID_JURISDICTIONS = ['CA-BC', 'CA-AB', 'CA-ON', 'US-CA'];

  function validateListing(body) {
    const errors = [];
    if (!body.addr || typeof body.addr !== 'string' || body.addr.trim().length === 0) {
      errors.push('addr is required and must be a non-empty string.');
    }
    if (body.price == null || typeof body.price !== 'number' || body.price <= 0) {
      errors.push('price is required and must be a positive number.');
    }
    if (body.type && !VALID_TYPES.includes(body.type)) {
      errors.push(`type must be one of: ${VALID_TYPES.join(', ')}`);
    }
    if (body.status && !VALID_STATUSES.includes(body.status)) {
      errors.push(`status must be one of: ${VALID_STATUSES.join(', ')}`);
    }
    if (body.jurisdiction && !VALID_JURISDICTIONS.includes(body.jurisdiction)) {
      errors.push(`jurisdiction must be one of: ${VALID_JURISDICTIONS.join(', ')}`);
    }
    if (body.beds != null && (typeof body.beds !== 'number' || body.beds < 0)) {
      errors.push('beds must be a non-negative number.');
    }
    if (body.baths != null && (typeof body.baths !== 'number' || body.baths < 0)) {
      errors.push('baths must be a non-negative number.');
    }
    if (body.latitude != null && (body.latitude < -90 || body.latitude > 90)) {
      errors.push('latitude must be between -90 and 90.');
    }
    if (body.longitude != null && (body.longitude < -180 || body.longitude > 180)) {
      errors.push('longitude must be between -180 and 180.');
    }
    return errors;
  }

  function toListingParams(body) {
    return {
      addr: body.addr.trim(),
      price: body.price,
      beds: body.beds ?? null,
      baths: body.baths ?? null,
      sqft: body.sqft ?? null,
      type: body.type || null,
      lot: body.lot || null,
      agent: body.agent || null,
      neighborhood: body.neighborhood || null,
      dom: body.dom ?? null,
      year_built: body.year_built ?? body.yearBuilt ?? null,
      water_view: body.water_view ?? body.waterView ? 1 : 0,
      latitude: body.latitude ?? null,
      longitude: body.longitude ?? null,
      region: body.region || null,
      country: body.country || 'CA',
      province_state: body.province_state ?? body.provinceState ?? 'BC',
      currency: body.currency || 'CAD',
      jurisdiction: body.jurisdiction || 'CA-BC',
      source: body.source || 'manual',
      source_url: body.source_url ?? body.sourceUrl ?? null,
      status: body.status || 'active',
    };
  }

  // ---------------------------------------------------------------
  // POST /listings - Create a new listing
  // ---------------------------------------------------------------
  router.post('/', (req, res) => {
    try {
      const errors = validateListing(req.body);
      if (errors.length > 0) {
        return res.status(400).json({ success: false, errors });
      }

      const params = toListingParams(req.body);

      const result = db.prepare(`
        INSERT INTO listings (addr, price, beds, baths, sqft, type, lot, agent,
          neighborhood, dom, year_built, water_view, latitude, longitude, region,
          country, province_state, currency, jurisdiction, source, source_url, status)
        VALUES (@addr, @price, @beds, @baths, @sqft, @type, @lot, @agent,
          @neighborhood, @dom, @year_built, @water_view, @latitude, @longitude, @region,
          @country, @province_state, @currency, @jurisdiction, @source, @source_url, @status)
      `).run(params);

      const listingId = Number(result.lastInsertRowid);

      // Create initial price history entry
      db.prepare(`
        INSERT INTO price_history (listing_id, price, change_type)
        VALUES (@listing_id, @price, 'initial')
      `).run({ listing_id: listingId, price: params.price });

      const listing = db.prepare('SELECT * FROM listings WHERE id = ?').get(listingId);

      res.status(201).json({
        success: true,
        data: listing,
        message: 'Listing created successfully.',
      });
    } catch (err) {
      console.error('[LISTINGS] Create error:', err.message);
      res.status(500).json({ success: false, error: 'Failed to create listing.' });
    }
  });

  // ---------------------------------------------------------------
  // POST /listings/bulk - Bulk import multiple listings
  // ---------------------------------------------------------------
  router.post('/bulk', (req, res) => {
    try {
      const { listings } = req.body;

      if (!Array.isArray(listings) || listings.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Request body must contain a non-empty "listings" array.',
        });
      }

      if (listings.length > 500) {
        return res.status(400).json({
          success: false,
          error: 'Bulk import limited to 500 listings per request.',
        });
      }

      const insertStmt = db.prepare(`
        INSERT INTO listings (addr, price, beds, baths, sqft, type, lot, agent,
          neighborhood, dom, year_built, water_view, latitude, longitude, region,
          country, province_state, currency, jurisdiction, source, source_url, status)
        VALUES (@addr, @price, @beds, @baths, @sqft, @type, @lot, @agent,
          @neighborhood, @dom, @year_built, @water_view, @latitude, @longitude, @region,
          @country, @province_state, @currency, @jurisdiction, @source, @source_url, @status)
      `);

      const insertPriceHistory = db.prepare(`
        INSERT INTO price_history (listing_id, price, change_type)
        VALUES (@listing_id, @price, 'initial')
      `);

      const checkDuplicate = db.prepare(
        'SELECT id FROM listings WHERE addr = @addr AND price = @price'
      );

      const results = { created: 0, skipped: 0, errors: [] };

      const bulkInsert = db.transaction(() => {
        for (let i = 0; i < listings.length; i++) {
          const item = listings[i];
          const errors = validateListing(item);
          if (errors.length > 0) {
            results.errors.push({ index: i, addr: item.addr || '(missing)', errors });
            results.skipped++;
            continue;
          }

          const params = toListingParams(item);

          // Skip duplicates (same address and price)
          const existing = checkDuplicate.get({ addr: params.addr, price: params.price });
          if (existing) {
            results.skipped++;
            continue;
          }

          const result = insertStmt.run(params);
          const listingId = Number(result.lastInsertRowid);
          insertPriceHistory.run({ listing_id: listingId, price: params.price });
          results.created++;
        }
      });

      bulkInsert();

      res.status(201).json({
        success: true,
        data: results,
        message: `Bulk import complete: ${results.created} created, ${results.skipped} skipped.`,
      });
    } catch (err) {
      console.error('[LISTINGS] Bulk import error:', err.message);
      res.status(500).json({ success: false, error: 'Failed to process bulk import.' });
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
  // PUT /listings/:id - Update a listing
  // ---------------------------------------------------------------
  router.put('/:id', (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ success: false, error: 'Invalid listing ID.' });
      }

      const existing = db.prepare('SELECT * FROM listings WHERE id = ?').get(id);
      if (!existing) {
        return res.status(404).json({ success: false, error: 'Listing not found.' });
      }

      const body = req.body;

      // Validate only fields that are being updated
      if (body.type && !VALID_TYPES.includes(body.type)) {
        return res.status(400).json({ success: false, error: `type must be one of: ${VALID_TYPES.join(', ')}` });
      }
      if (body.status && !VALID_STATUSES.includes(body.status)) {
        return res.status(400).json({ success: false, error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
      }
      if (body.price != null && (typeof body.price !== 'number' || body.price <= 0)) {
        return res.status(400).json({ success: false, error: 'price must be a positive number.' });
      }

      // Build dynamic update
      const updatable = [
        'addr', 'price', 'beds', 'baths', 'sqft', 'type', 'lot', 'agent',
        'neighborhood', 'dom', 'year_built', 'water_view', 'latitude', 'longitude',
        'region', 'country', 'province_state', 'currency', 'jurisdiction',
        'source', 'source_url', 'status',
      ];

      const setClauses = [];
      const params = { id };

      for (const field of updatable) {
        // Support camelCase aliases
        const camelAliases = { year_built: 'yearBuilt', water_view: 'waterView', province_state: 'provinceState', source_url: 'sourceUrl' };
        const alias = camelAliases[field];
        const value = body[field] !== undefined ? body[field] : (alias && body[alias] !== undefined ? body[alias] : undefined);

        if (value !== undefined) {
          setClauses.push(`${field} = @${field}`);
          params[field] = field === 'water_view' ? (value ? 1 : 0) : value;
        }
      }

      if (setClauses.length === 0) {
        return res.status(400).json({ success: false, error: 'No valid fields to update.' });
      }

      setClauses.push("updated_at = datetime('now')");

      db.prepare(`UPDATE listings SET ${setClauses.join(', ')} WHERE id = @id`).run(params);

      // Track price changes in price_history
      if (body.price != null && body.price !== existing.price) {
        const changeType = body.price > existing.price ? 'increase' : 'decrease';
        db.prepare(`
          INSERT INTO price_history (listing_id, price, change_type)
          VALUES (@listing_id, @price, @change_type)
        `).run({ listing_id: id, price: body.price, change_type: changeType });
      }

      const updated = db.prepare('SELECT * FROM listings WHERE id = ?').get(id);

      res.json({
        success: true,
        data: updated,
        message: 'Listing updated successfully.',
      });
    } catch (err) {
      console.error('[LISTINGS] Update error:', err.message);
      res.status(500).json({ success: false, error: 'Failed to update listing.' });
    }
  });

  // ---------------------------------------------------------------
  // DELETE /listings/:id - Delete a listing
  // ---------------------------------------------------------------
  router.delete('/:id', (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ success: false, error: 'Invalid listing ID.' });
      }

      const listing = db.prepare('SELECT id, addr FROM listings WHERE id = ?').get(id);
      if (!listing) {
        return res.status(404).json({ success: false, error: 'Listing not found.' });
      }

      const deleteListing = db.transaction(() => {
        db.prepare('DELETE FROM price_history WHERE listing_id = ?').run(id);
        db.prepare('DELETE FROM community_flags WHERE listing_id = ?').run(id);
        db.prepare('DELETE FROM viewings WHERE listing_id = ?').run(id);
        db.prepare('DELETE FROM documents WHERE listing_id = ?').run(id);
        db.prepare('DELETE FROM listings WHERE id = ?').run(id);
      });

      deleteListing();

      res.json({
        success: true,
        message: `Listing ${id} (${listing.addr}) deleted successfully.`,
      });
    } catch (err) {
      console.error('[LISTINGS] Delete error:', err.message);
      res.status(500).json({ success: false, error: 'Failed to delete listing.' });
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
