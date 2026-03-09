const request = require('supertest');
const path = require('path');
const fs = require('fs');

const TEST_DB_PATH = path.join(__dirname, 'test-documents.db');

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

describe('GET /api/v1/documents', () => {
  it('should return documents array', async () => {
    const res = await request(app).get('/api/v1/documents');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});

describe('POST /api/v1/documents', () => {
  it('should return 400 when no file is uploaded', async () => {
    const res = await request(app)
      .post('/api/v1/documents')
      .field('title', 'Test Doc');
    expect(res.status).toBe(400);
  });
});

describe('GET /api/v1/documents/:id', () => {
  it('should return 400 for invalid id', async () => {
    const res = await request(app).get('/api/v1/documents/abc');
    expect(res.status).toBe(400);
  });

  it('should return 404 for non-existent document', async () => {
    const res = await request(app).get('/api/v1/documents/999999');
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/v1/documents/:id', () => {
  it('should return 404 for non-existent document', async () => {
    const res = await request(app).delete('/api/v1/documents/999999');
    expect(res.status).toBe(404);
  });
});
