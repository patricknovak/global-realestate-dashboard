const request = require('supertest');
const path = require('path');
const fs = require('fs');

const TEST_DB_PATH = path.join(__dirname, 'test-viewings.db');

// Clean stale DB and reset modules for isolation
if (fs.existsSync(TEST_DB_PATH)) {
  fs.unlinkSync(TEST_DB_PATH);
}

beforeAll(() => {
  process.env.DB_PATH = TEST_DB_PATH;
  process.env.NODE_ENV = 'test';
  // Clear cached modules to get fresh DB connection
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

describe('GET /api/v1/viewings', () => {
  it('should return viewings array', async () => {
    const res = await request(app).get('/api/v1/viewings');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

describe('GET /api/v1/viewings/calendar', () => {
  it('should return calendar data for current month', async () => {
    const res = await request(app).get('/api/v1/viewings/calendar');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.year).toBeDefined();
    expect(res.body.data.month).toBeDefined();
    expect(typeof res.body.data.viewings).toBe('object');
  });

  it('should accept year and month params', async () => {
    const res = await request(app).get('/api/v1/viewings/calendar?year=2025&month=6');
    expect(res.status).toBe(200);
    expect(res.body.data.year).toBe(2025);
    expect(res.body.data.month).toBe(6);
  });
});

describe('POST /api/v1/viewings', () => {
  it('should return 400 when required fields are missing', async () => {
    const res = await request(app)
      .post('/api/v1/viewings')
      .send({ listing_id: 1 });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('should return 404 for non-existent listing', async () => {
    const res = await request(app)
      .post('/api/v1/viewings')
      .send({
        listing_id: 999999,
        scheduled_date: '2026-04-01',
        scheduled_time: '10:00',
      });
    expect(res.status).toBe(404);
  });
});

describe('PUT /api/v1/viewings/:id', () => {
  it('should return 400 for invalid id', async () => {
    const res = await request(app)
      .put('/api/v1/viewings/abc')
      .send({ notes: 'test' });
    expect(res.status).toBe(400);
  });

  it('should return 404 for non-existent viewing', async () => {
    const res = await request(app)
      .put('/api/v1/viewings/999999')
      .send({ notes: 'test' });
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/v1/viewings/:id', () => {
  it('should return 404 for non-existent viewing', async () => {
    const res = await request(app).delete('/api/v1/viewings/999999');
    expect(res.status).toBe(404);
  });
});
