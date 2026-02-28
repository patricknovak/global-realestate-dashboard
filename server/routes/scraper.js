/**
 * Scraper API routes - Trigger and monitor scrape jobs
 *
 * POST /api/v1/scraper/run          - Trigger a manual scrape job
 * GET  /api/v1/scraper/jobs         - List scrape job history
 * GET  /api/v1/scraper/jobs/:id     - Status of a specific job
 */

const express = require('express');
const router = express.Router();

module.exports = function (db) {
  // ---------------------------------------------------------------
  // POST /scraper/run - Trigger a manual scrape job
  // ---------------------------------------------------------------
  router.post('/run', (req, res) => {
    try {
      const { source, region } = req.body;

      if (!source) {
        return res.status(400).json({
          success: false,
          error: 'source is required (e.g., "realtor.ca", "rew.ca", "manual").',
        });
      }

      // Check if there's already a running job for this source+region
      const runningJob = db.prepare(`
        SELECT id FROM scrape_jobs
        WHERE source = @source
          AND (@region IS NULL OR region = @region)
          AND status = 'running'
      `).get({ source, region: region || null });

      if (runningJob) {
        return res.status(409).json({
          success: false,
          error: `A scrape job for "${source}" is already running.`,
          job_id: runningJob.id,
        });
      }

      // Create a new scrape job record
      const result = db.prepare(`
        INSERT INTO scrape_jobs (source, region, status, started_at)
        VALUES (@source, @region, 'running', datetime('now'))
      `).run({
        source,
        region: region || null,
      });

      const jobId = result.lastInsertRowid;

      // In a real implementation, this would trigger an actual scraping process.
      // For now, we simulate a quick completion after creating the job record.
      //
      // To implement real scraping:
      //   1. Create scraper modules in server/scraper/ for each source
      //   2. Use child_process.fork() or a job queue (e.g., bull) to run them
      //   3. Update the job record as the scraper progresses
      //   4. Handle errors and partial completion
      //
      // For the placeholder, we'll mark the job as completed with 0 results
      // to demonstrate the flow.

      setTimeout(() => {
        try {
          db.prepare(`
            UPDATE scrape_jobs SET
              status = 'completed',
              listings_found = 0,
              listings_new = 0,
              listings_updated = 0,
              completed_at = datetime('now')
            WHERE id = ?
          `).run(jobId);
        } catch (err) {
          console.error(`[SCRAPER] Failed to update job ${jobId}:`, err.message);
        }
      }, 2000);

      const job = db.prepare('SELECT * FROM scrape_jobs WHERE id = ?').get(jobId);

      res.status(202).json({
        success: true,
        data: job,
        message: `Scrape job #${jobId} started for source "${source}". Poll GET /api/v1/scraper/jobs/${jobId} for status.`,
      });
    } catch (err) {
      console.error('[SCRAPER] Run error:', err.message);
      res.status(500).json({ success: false, error: 'Failed to start scrape job.' });
    }
  });

  // ---------------------------------------------------------------
  // GET /scraper/jobs - List scrape job history
  // ---------------------------------------------------------------
  router.get('/jobs', (req, res) => {
    try {
      const { source, status, limit: queryLimit } = req.query;

      const conditions = [];
      const params = {};

      if (source) {
        conditions.push('source = @source');
        params.source = source;
      }
      if (status) {
        conditions.push('status = @status');
        params.status = status;
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      const maxResults = Math.min(100, Math.max(1, parseInt(queryLimit, 10) || 50));

      const jobs = db.prepare(`
        SELECT * FROM scrape_jobs
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT @limit
      `).all({ ...params, limit: maxResults });

      res.json({
        success: true,
        data: jobs,
        meta: { count: jobs.length },
      });
    } catch (err) {
      console.error('[SCRAPER] Jobs list error:', err.message);
      res.status(500).json({ success: false, error: 'Failed to retrieve scrape jobs.' });
    }
  });

  // ---------------------------------------------------------------
  // GET /scraper/jobs/:id - Status of a specific job
  // ---------------------------------------------------------------
  router.get('/jobs/:id', (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ success: false, error: 'Invalid job ID.' });
      }

      const job = db.prepare('SELECT * FROM scrape_jobs WHERE id = ?').get(id);
      if (!job) {
        return res.status(404).json({ success: false, error: 'Scrape job not found.' });
      }

      // Calculate duration if job has started
      let durationSeconds = null;
      if (job.started_at) {
        const endTime = job.completed_at ? new Date(job.completed_at) : new Date();
        const startTime = new Date(job.started_at);
        durationSeconds = Math.round((endTime - startTime) / 1000);
      }

      res.json({
        success: true,
        data: {
          ...job,
          duration_seconds: durationSeconds,
        },
      });
    } catch (err) {
      console.error('[SCRAPER] Job status error:', err.message);
      res.status(500).json({ success: false, error: 'Failed to retrieve job status.' });
    }
  });

  return router;
};
