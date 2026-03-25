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

// ---------------------------------------------------------------
// POST /api/v1/listings - Create a listing
// ---------------------------------------------------------------
describe('POST /api/v1/listings', () => {
  const validListing = {
    addr: '123 Test St',
    price: 750000,
    beds: 3,
    baths: 2,
    sqft: 1800,
    type: 'House',
    neighborhood: 'White Rock',
    region: 'South Surrey / White Rock',
    country: 'CA',
    province_state: 'BC',
    currency: 'CAD',
    jurisdiction: 'CA-BC',
    latitude: 49.025,
    longitude: -122.808,
  };

  it('should create a listing and return 201', async () => {
    const res = await request(app)
      .post('/api/v1/listings')
      .send(validListing);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.addr).toBe('123 Test St');
    expect(res.body.data.price).toBe(750000);
    expect(res.body.data.id).toBeDefined();
  });

  it('should return 400 when addr is missing', async () => {
    const res = await request(app)
      .post('/api/v1/listings')
      .send({ price: 500000 });
    expect(res.status).toBe(400);
    expect(res.body.errors.length).toBeGreaterThan(0);
  });

  it('should return 400 when price is missing', async () => {
    const res = await request(app)
      .post('/api/v1/listings')
      .send({ addr: '456 No Price Rd' });
    expect(res.status).toBe(400);
  });

  it('should return 400 for invalid type', async () => {
    const res = await request(app)
      .post('/api/v1/listings')
      .send({ addr: '789 Bad Type Ave', price: 300000, type: 'Castle' });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------
// POST /api/v1/listings/bulk - Bulk import
// ---------------------------------------------------------------
describe('POST /api/v1/listings/bulk', () => {
  it('should bulk import listings', async () => {
    const res = await request(app)
      .post('/api/v1/listings/bulk')
      .send({
        listings: [
          { addr: '100 Bulk St', price: 500000, type: 'House' },
          { addr: '200 Bulk St', price: 600000, type: 'Townhouse' },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.created).toBe(2);
  });

  it('should skip duplicate listings', async () => {
    const res = await request(app)
      .post('/api/v1/listings/bulk')
      .send({
        listings: [
          { addr: '100 Bulk St', price: 500000, type: 'House' },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.data.skipped).toBe(1);
    expect(res.body.data.created).toBe(0);
  });

  it('should return 400 for empty array', async () => {
    const res = await request(app)
      .post('/api/v1/listings/bulk')
      .send({ listings: [] });
    expect(res.status).toBe(400);
  });

  it('should return 400 when listings is not an array', async () => {
    const res = await request(app)
      .post('/api/v1/listings/bulk')
      .send({ listings: 'not-an-array' });
    expect(res.status).toBe(400);
  });

  it('should report validation errors per item', async () => {
    const res = await request(app)
      .post('/api/v1/listings/bulk')
      .send({
        listings: [
          { addr: '', price: -1 },
          { addr: '300 Good St', price: 700000 },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.data.errors.length).toBe(1);
    expect(res.body.data.created).toBe(1);
  });
});

// ---------------------------------------------------------------
// PUT /api/v1/listings/:id - Update a listing
// ---------------------------------------------------------------
describe('PUT /api/v1/listings/:id', () => {
  let createdId;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/v1/listings')
      .send({ addr: '999 Update Test St', price: 800000, type: 'House' });
    createdId = res.body.data.id;
  });

  it('should update price and track history', async () => {
    const res = await request(app)
      .put(`/api/v1/listings/${createdId}`)
      .send({ price: 850000 });
    expect(res.status).toBe(200);
    expect(res.body.data.price).toBe(850000);

    // Check price history
    const histRes = await request(app).get(`/api/v1/listings/${createdId}/price-history`);
    expect(histRes.body.data.history.length).toBeGreaterThanOrEqual(2);
  });

  it('should update multiple fields', async () => {
    const res = await request(app)
      .put(`/api/v1/listings/${createdId}`)
      .send({ beds: 4, baths: 3, status: 'sold' });
    expect(res.status).toBe(200);
    expect(res.body.data.beds).toBe(4);
    expect(res.body.data.baths).toBe(3);
    expect(res.body.data.status).toBe('sold');
  });

  it('should return 404 for non-existent listing', async () => {
    const res = await request(app)
      .put('/api/v1/listings/999999')
      .send({ price: 100000 });
    expect(res.status).toBe(404);
  });

  it('should return 400 for no valid fields', async () => {
    const res = await request(app)
      .put(`/api/v1/listings/${createdId}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it('should return 400 for invalid type', async () => {
    const res = await request(app)
      .put(`/api/v1/listings/${createdId}`)
      .send({ type: 'Castle' });
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------
// DELETE /api/v1/listings/:id - Delete a listing
// ---------------------------------------------------------------
describe('DELETE /api/v1/listings/:id', () => {
  let createdId;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/v1/listings')
      .send({ addr: '888 Delete Test St', price: 600000 });
    createdId = res.body.data.id;
  });

  it('should delete a listing and its related data', async () => {
    const res = await request(app).delete(`/api/v1/listings/${createdId}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify it's gone
    const getRes = await request(app).get(`/api/v1/listings/${createdId}`);
    expect(getRes.status).toBe(404);
  });

  it('should return 404 for non-existent listing', async () => {
    const res = await request(app).delete('/api/v1/listings/999999');
    expect(res.status).toBe(404);
  });

  it('should return 400 for invalid id', async () => {
    const res = await request(app).delete('/api/v1/listings/abc');
    expect(res.status).toBe(400);
  });
});

// ---------------------------------------------------------------
// GET /api/v1/listings/:id/comparables - Comparable sales
// ---------------------------------------------------------------
describe('GET /api/v1/listings/:id/comparables', () => {
  it('should return 400 for invalid id', async () => {
    const res = await request(app).get('/api/v1/listings/abc/comparables');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('should return 404 for non-existent listing', async () => {
    const res = await request(app).get('/api/v1/listings/999999/comparables');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

// ---------------------------------------------------------------
// POST /api/v1/listings/:id/flag - Valid flag & invalid flag_type
// ---------------------------------------------------------------
describe('POST /api/v1/listings/:id/flag (extended)', () => {
  let flagListingId;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/v1/listings')
      .send({ addr: '500 Flag Test Ave', price: 650000, type: 'Townhouse' });
    flagListingId = res.body.data.id;
  });

  it('should accept a valid flag and create it', async () => {
    const res = await request(app)
      .post(`/api/v1/listings/${flagListingId}/flag`)
      .send({ flag_type: 'sold', notes: 'Appears sold on MLS' });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.flag_type).toBe('sold');
    expect(res.body.data.listing_id).toBe(flagListingId);
    expect(res.body.data.status).toBe('pending');
  });

  it('should reject an invalid flag_type', async () => {
    const res = await request(app)
      .post(`/api/v1/listings/${flagListingId}/flag`)
      .send({ flag_type: 'bogus_type' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/flag_type/i);
  });
});

// ---------------------------------------------------------------
// Community auto-flagging: 3 flags triggers status = 'flagged'
// ---------------------------------------------------------------
describe('Community auto-flagging', () => {
  let autoFlagListingId;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/v1/listings')
      .send({ addr: '600 AutoFlag Blvd', price: 900000, type: 'House' });
    autoFlagListingId = res.body.data.id;
  });

  it('should auto-flag a listing after 3 community flags', async () => {
    // Submit 3 flags
    await request(app)
      .post(`/api/v1/listings/${autoFlagListingId}/flag`)
      .send({ flag_type: 'price_wrong', reporter_id: 'user-1' });
    await request(app)
      .post(`/api/v1/listings/${autoFlagListingId}/flag`)
      .send({ flag_type: 'info_incorrect', reporter_id: 'user-2' });
    await request(app)
      .post(`/api/v1/listings/${autoFlagListingId}/flag`)
      .send({ flag_type: 'sold', reporter_id: 'user-3' });

    // Verify the listing status is now 'flagged'
    const getRes = await request(app).get(`/api/v1/listings/${autoFlagListingId}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.status).toBe('flagged');
  });
});

// ---------------------------------------------------------------
// PATCH /api/v1/listings/:id - Partial update
// ---------------------------------------------------------------
describe('PATCH /api/v1/listings/:id', () => {
  let patchListingId;

  beforeAll(async () => {
    const res = await request(app)
      .post('/api/v1/listings')
      .send({ addr: '700 Patch Test Rd', price: 500000, type: 'House', beds: 2, baths: 1 });
    patchListingId = res.body.data.id;
  });

  it('should update a listing with PATCH', async () => {
    const res = await request(app)
      .patch(`/api/v1/listings/${patchListingId}`)
      .send({ beds: 4, price: 550000 });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.beds).toBe(4);
    expect(res.body.data.price).toBe(550000);
    // Original fields should be preserved
    expect(res.body.data.baths).toBe(1);
    expect(res.body.data.addr).toBe('700 Patch Test Rd');
  });

  it('should return 404 for non-existent listing', async () => {
    const res = await request(app)
      .patch('/api/v1/listings/999999')
      .send({ price: 100000 });
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

// ---------------------------------------------------------------
// Input sanitization - addr longer than 500 chars
// ---------------------------------------------------------------
describe('Input sanitization', () => {
  it('should return 400 for addr longer than 500 characters', async () => {
    const longAddr = 'A'.repeat(501);
    const res = await request(app)
      .post('/api/v1/listings')
      .send({ addr: longAddr, price: 100000 });
    expect(res.status).toBe(400);
    expect(res.body.errors).toBeDefined();
    expect(res.body.errors.length).toBeGreaterThan(0);
    const addrError = res.body.errors.find((e) => e.includes('addr'));
    expect(addrError).toBeDefined();
  });
});

describe('404 handler', () => {
  it('should return 404 for unknown API routes', async () => {
    const res = await request(app).get('/api/v1/nonexistent');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
