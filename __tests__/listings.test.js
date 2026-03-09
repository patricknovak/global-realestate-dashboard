const request = require('supertest');
const path = require('path');
const fs = require('fs');

const TEST_DB_PATH = path.join(__dirname, 'test-listings.db');

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

describe('GET /api/v1/health', () => {
  it('should return health status', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('running');
    expect(res.body.data.database).toBe('ok');
  });
});

describe('GET /api/v1/listings', () => {
  it('should return listings array with meta', async () => {
    const res = await request(app).get('/api/v1/listings');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toBeDefined();
    expect(res.body.meta.total).toBeGreaterThanOrEqual(0);
    expect(res.body.meta.page).toBe(1);
  });

  it('should support pagination parameters', async () => {
    const res = await request(app).get('/api/v1/listings?page=1&limit=5');
    expect(res.status).toBe(200);
    expect(res.body.meta.limit).toBe(5);
  });

  it('should cap limit at 200', async () => {
    const res = await request(app).get('/api/v1/listings?limit=999');
    expect(res.status).toBe(200);
    expect(res.body.meta.limit).toBeLessThanOrEqual(200);
  });

  it('should reject SQL injection in sort_by', async () => {
    const res = await request(app).get('/api/v1/listings?sort_by=price;DROP TABLE listings');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('GET /api/v1/listings/stats', () => {
  it('should return aggregate statistics', async () => {
    const res = await request(app).get('/api/v1/listings/stats');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(typeof res.body.data.total).toBe('number');
    expect(typeof res.body.data.avgPrice).toBe('number');
  });
});

describe('GET /api/v1/listings/:id', () => {
  it('should return 400 for invalid id', async () => {
    const res = await request(app).get('/api/v1/listings/abc');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('should return 404 for non-existent listing', async () => {
    const res = await request(app).get('/api/v1/listings/999999');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

describe('POST /api/v1/listings/:id/flag', () => {
  it('should return 400 for invalid id', async () => {
    const res = await request(app)
      .post('/api/v1/listings/abc/flag')
      .send({ flag_type: 'sold' });
    expect(res.status).toBe(400);
  });

  it('should return 404 for non-existent listing', async () => {
    const res = await request(app)
      .post('/api/v1/listings/999999/flag')
      .send({ flag_type: 'sold' });
    expect(res.status).toBe(404);
  });
});

describe('GET /api/v1/listings/stale', () => {
  it('should return stale listings', async () => {
    const res = await request(app).get('/api/v1/listings/stale');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta.threshold_days).toBe(7);
  });

  it('should accept custom days threshold', async () => {
    const res = await request(app).get('/api/v1/listings/stale?days=30');
    expect(res.status).toBe(200);
    expect(res.body.meta.threshold_days).toBe(30);
  });
});

describe('404 handler', () => {
  it('should return 404 for unknown API routes', async () => {
    const res = await request(app).get('/api/v1/nonexistent');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
