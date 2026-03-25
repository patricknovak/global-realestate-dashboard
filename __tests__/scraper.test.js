const request = require('supertest');
const path = require('path');
const fs = require('fs');

const TEST_DB_PATH = path.join(__dirname, 'test-scraper.db');

if (fs.existsSync(TEST_DB_PATH)) {
  fs.unlinkSync(TEST_DB_PATH);
}

beforeAll(() => {
  process.env.DB_PATH = TEST_DB_PATH;
  process.env.NODE_ENV = 'test';
  delete require.cache[require.resolve('../server/db/database')];
  delete require.cache[require.resolve('../server.js')];
  Object.keys(require.cache).forEach((key) => {
    if (key.includes('/server/routes/')) {
      delete require.cache[key];
    }
  });
});

let app;
beforeAll(() => {
  app = require('../server.js');
});

afterAll(() => {
  const { closeDatabase } = require('../server/db/database');
  closeDatabase();
  if (fs.existsSync(TEST_DB_PATH)) {
    fs.unlinkSync(TEST_DB_PATH);
  }
});

// ---------------------------------------------------------------
// POST /api/v1/scraper/run - Trigger a manual scrape job
// ---------------------------------------------------------------
describe('POST /api/v1/scraper/run', () => {
  it('should require source field', async () => {
    const res = await request(app)
      .post('/api/v1/scraper/run')
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/source/i);
  });

  it('should create a job and return 202', async () => {
    const res = await request(app)
      .post('/api/v1/scraper/run')
      .send({ source: 'rew.ca', region: 'South Surrey / White Rock' });
    expect(res.status).toBe(202);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.source).toBe('rew.ca');
    expect(res.body.data.status).toBe('running');
    expect(res.body.data.id).toBeDefined();
  });

  it('should return 409 conflict for a running job with the same source', async () => {
    // The previous test created a running job for 'rew.ca'.
    // Attempting to start another for the same source should conflict.
    const res = await request(app)
      .post('/api/v1/scraper/run')
      .send({ source: 'rew.ca', region: 'South Surrey / White Rock' });
    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/already running/i);
    expect(res.body.job_id).toBeDefined();
  });
});

// ---------------------------------------------------------------
// GET /api/v1/scraper/jobs - List scrape job history
// ---------------------------------------------------------------
describe('GET /api/v1/scraper/jobs', () => {
  beforeAll(async () => {
    // Create a second job with a different source so we can test filtering
    await request(app)
      .post('/api/v1/scraper/run')
      .send({ source: 'realtor.ca' });
  });

  it('should return a job list', async () => {
    const res = await request(app).get('/api/v1/scraper/jobs');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    expect(res.body.meta).toBeDefined();
    expect(res.body.meta.count).toBeGreaterThanOrEqual(2);
  });

  it('should filter jobs by source', async () => {
    const res = await request(app).get('/api/v1/scraper/jobs?source=realtor.ca');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    res.body.data.forEach((job) => {
      expect(job.source).toBe('realtor.ca');
    });
  });
});

// ---------------------------------------------------------------
// GET /api/v1/scraper/jobs/:id - Status of a specific job
// ---------------------------------------------------------------
describe('GET /api/v1/scraper/jobs/:id', () => {
  it('should return 400 for invalid id', async () => {
    const res = await request(app).get('/api/v1/scraper/jobs/abc');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('should return 404 for missing job', async () => {
    const res = await request(app).get('/api/v1/scraper/jobs/999999');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
