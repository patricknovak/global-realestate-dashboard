const request = require('supertest');
const path = require('path');
const fs = require('fs');

const TEST_DB_PATH = path.join(__dirname, 'test-data.db');

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
// GET /api/v1/data/benchmarks - Return benchmarks data
// ---------------------------------------------------------------
describe('GET /api/v1/data/benchmarks', () => {
  it('should return benchmarks data', async () => {
    const res = await request(app).get('/api/v1/data/benchmarks');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.neighborhoodBenchmarks).toBeDefined();
    expect(res.body.data.trendBonus).toBeDefined();
    expect(res.body.data.marketTrends).toBeDefined();
    expect(res.body.data.metadata).toBeDefined();
  });
});

// ---------------------------------------------------------------
// GET /api/v1/data/neighborhoods - Neighborhood enrichment data
// ---------------------------------------------------------------
describe('GET /api/v1/data/neighborhoods', () => {
  it('should return neighborhoods array', async () => {
    const res = await request(app).get('/api/v1/data/neighborhoods');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.meta).toBeDefined();
    expect(typeof res.body.meta.count).toBe('number');
  });
});

// ---------------------------------------------------------------
// GET /api/v1/data/freshness - Data freshness report
// ---------------------------------------------------------------
describe('GET /api/v1/data/freshness', () => {
  it('should return freshness report', async () => {
    const res = await request(app).get('/api/v1/data/freshness');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(Array.isArray(res.body.data.byRegion)).toBe(true);
    expect(res.body.data.overall).toBeDefined();
    expect(typeof res.body.data.overall.total_listings).toBe('number');
  });
});

// ---------------------------------------------------------------
// GET /api/v1/data/export - Export all data as JSON
// ---------------------------------------------------------------
describe('GET /api/v1/data/export', () => {
  it('should return full export', async () => {
    const res = await request(app).get('/api/v1/data/export');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.exportedAt).toBeDefined();
    expect(Array.isArray(res.body.data.listings)).toBe(true);
    expect(Array.isArray(res.body.data.priceHistory)).toBe(true);
    expect(Array.isArray(res.body.data.comparableSales)).toBe(true);
    expect(Array.isArray(res.body.data.communityFlags)).toBe(true);
    expect(Array.isArray(res.body.data.viewings)).toBe(true);
    expect(Array.isArray(res.body.data.neighborhoodData)).toBe(true);
    expect(Array.isArray(res.body.data.scrapeJobs)).toBe(true);
    expect(res.body.data.benchmarks).toBeDefined();
  });
});
