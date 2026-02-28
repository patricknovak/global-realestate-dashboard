/**
 * Viewings API routes
 *
 * GET    /api/v1/viewings              - All viewings (filter by listing_id or date range)
 * GET    /api/v1/viewings/calendar     - Calendar-formatted viewing data (month view)
 * POST   /api/v1/viewings              - Schedule a viewing
 * PUT    /api/v1/viewings/:id          - Update a viewing (reschedule, add feedback)
 * DELETE /api/v1/viewings/:id          - Cancel a viewing
 */

const express = require('express');
const router = express.Router();

module.exports = function (db) {
  // ---------------------------------------------------------------
  // GET /viewings/calendar - Calendar-formatted viewing data
  // ---------------------------------------------------------------
  router.get('/calendar', (req, res) => {
    try {
      const { year, month } = req.query;

      // Default to current month
      const now = new Date();
      const calYear = parseInt(year, 10) || now.getFullYear();
      const calMonth = parseInt(month, 10) || now.getMonth() + 1;

      // Build date range for the month
      const startDate = `${calYear}-${String(calMonth).padStart(2, '0')}-01`;
      const nextMonth = calMonth === 12 ? 1 : calMonth + 1;
      const nextYear = calMonth === 12 ? calYear + 1 : calYear;
      const endDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

      const viewings = db.prepare(`
        SELECT v.*, l.addr, l.price, l.neighborhood, l.type
        FROM viewings v
        LEFT JOIN listings l ON v.listing_id = l.id
        WHERE v.scheduled_date >= @start_date AND v.scheduled_date < @end_date
        ORDER BY v.scheduled_date ASC, v.scheduled_time ASC
      `).all({ start_date: startDate, end_date: endDate });

      // Group by date for calendar display
      const calendar = {};
      for (const viewing of viewings) {
        const date = viewing.scheduled_date;
        if (!calendar[date]) {
          calendar[date] = [];
        }
        calendar[date].push(viewing);
      }

      res.json({
        success: true,
        data: {
          year: calYear,
          month: calMonth,
          viewings: calendar,
          total: viewings.length,
        },
      });
    } catch (err) {
      console.error('[VIEWINGS] Calendar error:', err.message);
      res.status(500).json({ success: false, error: 'Failed to retrieve calendar data.' });
    }
  });

  // ---------------------------------------------------------------
  // GET /viewings - All viewings with optional filters
  // ---------------------------------------------------------------
  router.get('/', (req, res) => {
    try {
      const { listing_id, start_date, end_date, status } = req.query;

      const conditions = [];
      const params = {};

      if (listing_id) {
        conditions.push('v.listing_id = @listing_id');
        params.listing_id = parseInt(listing_id, 10);
      }
      if (start_date) {
        conditions.push('v.scheduled_date >= @start_date');
        params.start_date = start_date;
      }
      if (end_date) {
        conditions.push('v.scheduled_date <= @end_date');
        params.end_date = end_date;
      }
      if (status) {
        conditions.push('v.status = @status');
        params.status = status;
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const viewings = db.prepare(`
        SELECT v.*, l.addr, l.price, l.neighborhood, l.type
        FROM viewings v
        LEFT JOIN listings l ON v.listing_id = l.id
        ${whereClause}
        ORDER BY v.scheduled_date ASC, v.scheduled_time ASC
      `).all(params);

      res.json({
        success: true,
        data: viewings,
        meta: { count: viewings.length },
      });
    } catch (err) {
      console.error('[VIEWINGS] List error:', err.message);
      res.status(500).json({ success: false, error: 'Failed to retrieve viewings.' });
    }
  });

  // ---------------------------------------------------------------
  // POST /viewings - Schedule a new viewing
  // ---------------------------------------------------------------
  router.post('/', (req, res) => {
    try {
      const {
        listing_id,
        scheduled_date,
        scheduled_time,
        duration_minutes,
        notes,
        agent_name,
        agent_phone,
        agent_email,
      } = req.body;

      // Validation
      if (!listing_id || !scheduled_date || !scheduled_time) {
        return res.status(400).json({
          success: false,
          error: 'listing_id, scheduled_date (YYYY-MM-DD), and scheduled_time (HH:MM) are required.',
        });
      }

      // Verify listing exists
      const listing = db.prepare('SELECT id, addr FROM listings WHERE id = ?').get(listing_id);
      if (!listing) {
        return res.status(404).json({ success: false, error: 'Listing not found.' });
      }

      // Check for scheduling conflicts (within same time window)
      const conflict = db.prepare(`
        SELECT id FROM viewings
        WHERE scheduled_date = @scheduled_date
          AND scheduled_time = @scheduled_time
          AND status IN ('scheduled', 'rescheduled')
      `).get({ scheduled_date, scheduled_time });

      if (conflict) {
        return res.status(409).json({
          success: false,
          error: 'A viewing is already scheduled at this date and time.',
          conflicting_id: conflict.id,
        });
      }

      const result = db.prepare(`
        INSERT INTO viewings (listing_id, scheduled_date, scheduled_time,
          duration_minutes, notes, agent_name, agent_phone, agent_email)
        VALUES (@listing_id, @scheduled_date, @scheduled_time,
          @duration_minutes, @notes, @agent_name, @agent_phone, @agent_email)
      `).run({
        listing_id,
        scheduled_date,
        scheduled_time,
        duration_minutes: duration_minutes || 30,
        notes: notes || null,
        agent_name: agent_name || null,
        agent_phone: agent_phone || null,
        agent_email: agent_email || null,
      });

      const newViewing = db.prepare('SELECT * FROM viewings WHERE id = ?').get(result.lastInsertRowid);

      res.status(201).json({
        success: true,
        data: newViewing,
        message: `Viewing scheduled for ${listing.addr} on ${scheduled_date} at ${scheduled_time}.`,
      });
    } catch (err) {
      console.error('[VIEWINGS] Create error:', err.message);
      res.status(500).json({ success: false, error: 'Failed to schedule viewing.' });
    }
  });

  // ---------------------------------------------------------------
  // PUT /viewings/:id - Update a viewing
  // ---------------------------------------------------------------
  router.put('/:id', (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ success: false, error: 'Invalid viewing ID.' });
      }

      const existing = db.prepare('SELECT * FROM viewings WHERE id = ?').get(id);
      if (!existing) {
        return res.status(404).json({ success: false, error: 'Viewing not found.' });
      }

      const {
        scheduled_date,
        scheduled_time,
        duration_minutes,
        status,
        notes,
        agent_name,
        agent_phone,
        agent_email,
        rating,
        feedback,
      } = req.body;

      // Validate status if provided
      const validStatuses = ['scheduled', 'completed', 'cancelled', 'rescheduled'];
      if (status && !validStatuses.includes(status)) {
        return res.status(400).json({
          success: false,
          error: `status must be one of: ${validStatuses.join(', ')}`,
        });
      }

      // Validate rating if provided
      if (rating !== undefined && rating !== null && (rating < 1 || rating > 5)) {
        return res.status(400).json({
          success: false,
          error: 'rating must be between 1 and 5.',
        });
      }

      // If rescheduling, mark as rescheduled
      let newStatus = status || existing.status;
      if ((scheduled_date && scheduled_date !== existing.scheduled_date) ||
          (scheduled_time && scheduled_time !== existing.scheduled_time)) {
        newStatus = 'rescheduled';
      }

      db.prepare(`
        UPDATE viewings SET
          scheduled_date = @scheduled_date,
          scheduled_time = @scheduled_time,
          duration_minutes = @duration_minutes,
          status = @status,
          notes = @notes,
          agent_name = @agent_name,
          agent_phone = @agent_phone,
          agent_email = @agent_email,
          rating = @rating,
          feedback = @feedback
        WHERE id = @id
      `).run({
        id,
        scheduled_date: scheduled_date || existing.scheduled_date,
        scheduled_time: scheduled_time || existing.scheduled_time,
        duration_minutes: duration_minutes || existing.duration_minutes,
        status: newStatus,
        notes: notes !== undefined ? notes : existing.notes,
        agent_name: agent_name !== undefined ? agent_name : existing.agent_name,
        agent_phone: agent_phone !== undefined ? agent_phone : existing.agent_phone,
        agent_email: agent_email !== undefined ? agent_email : existing.agent_email,
        rating: rating !== undefined ? rating : existing.rating,
        feedback: feedback !== undefined ? feedback : existing.feedback,
      });

      const updated = db.prepare('SELECT * FROM viewings WHERE id = ?').get(id);

      res.json({
        success: true,
        data: updated,
        message: 'Viewing updated successfully.',
      });
    } catch (err) {
      console.error('[VIEWINGS] Update error:', err.message);
      res.status(500).json({ success: false, error: 'Failed to update viewing.' });
    }
  });

  // ---------------------------------------------------------------
  // DELETE /viewings/:id - Cancel a viewing
  // ---------------------------------------------------------------
  router.delete('/:id', (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ success: false, error: 'Invalid viewing ID.' });
      }

      const existing = db.prepare('SELECT * FROM viewings WHERE id = ?').get(id);
      if (!existing) {
        return res.status(404).json({ success: false, error: 'Viewing not found.' });
      }

      // Soft-delete by setting status to cancelled
      db.prepare("UPDATE viewings SET status = 'cancelled' WHERE id = ?").run(id);

      res.json({
        success: true,
        message: `Viewing #${id} cancelled successfully.`,
      });
    } catch (err) {
      console.error('[VIEWINGS] Delete error:', err.message);
      res.status(500).json({ success: false, error: 'Failed to cancel viewing.' });
    }
  });

  return router;
};
