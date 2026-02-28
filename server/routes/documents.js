/**
 * Documents API routes (Document Vault)
 *
 * GET    /api/v1/documents          - List documents (optionally by listing_id)
 * POST   /api/v1/documents          - Upload a document (multipart form)
 * GET    /api/v1/documents/:id      - Download a document
 * DELETE /api/v1/documents/:id      - Delete a document
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const router = express.Router();

// Configure upload directory
const UPLOAD_DIR = path.resolve(__dirname, '../../uploads/documents');

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    // Prefix with timestamp to avoid collisions
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    const ext = path.extname(file.originalname);
    const baseName = path.basename(file.originalname, ext)
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .substring(0, 100);
    cb(null, `${uniqueSuffix}-${baseName}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 25 * 1024 * 1024, // 25 MB max
  },
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/gif',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'text/plain',
      'text/csv',
    ];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${file.mimetype} is not allowed. Allowed types: PDF, JPEG, PNG, GIF, DOC, DOCX, XLS, XLSX, TXT, CSV`));
    }
  },
});

module.exports = function (db) {
  // ---------------------------------------------------------------
  // GET /documents - List documents
  // ---------------------------------------------------------------
  router.get('/', (req, res) => {
    try {
      const { listing_id, doc_type } = req.query;

      const conditions = [];
      const params = {};

      if (listing_id) {
        conditions.push('d.listing_id = @listing_id');
        params.listing_id = parseInt(listing_id, 10);
      }
      if (doc_type) {
        conditions.push('d.doc_type = @doc_type');
        params.doc_type = doc_type;
      }

      const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

      const documents = db.prepare(`
        SELECT d.*, l.addr as listing_addr
        FROM documents d
        LEFT JOIN listings l ON d.listing_id = l.id
        ${whereClause}
        ORDER BY d.created_at DESC
      `).all(params);

      res.json({
        success: true,
        data: documents,
        meta: { count: documents.length },
      });
    } catch (err) {
      console.error('[DOCUMENTS] List error:', err.message);
      res.status(500).json({ success: false, error: 'Failed to retrieve documents.' });
    }
  });

  // ---------------------------------------------------------------
  // POST /documents - Upload a document
  // ---------------------------------------------------------------
  router.post('/', upload.single('file'), (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'No file uploaded. Send a file with the field name "file".',
        });
      }

      const { listing_id, title, doc_type, notes } = req.body;

      if (!title) {
        // Clean up uploaded file if validation fails
        fs.unlinkSync(req.file.path);
        return res.status(400).json({
          success: false,
          error: 'title is required.',
        });
      }

      const validDocTypes = ['inspection', 'title_search', 'strata_docs', 'disclosure', 'appraisal', 'contract', 'other'];
      if (doc_type && !validDocTypes.includes(doc_type)) {
        fs.unlinkSync(req.file.path);
        return res.status(400).json({
          success: false,
          error: `doc_type must be one of: ${validDocTypes.join(', ')}`,
        });
      }

      // If listing_id is provided, verify it exists
      if (listing_id) {
        const listing = db.prepare('SELECT id FROM listings WHERE id = ?').get(parseInt(listing_id, 10));
        if (!listing) {
          fs.unlinkSync(req.file.path);
          return res.status(404).json({ success: false, error: 'Listing not found.' });
        }
      }

      const result = db.prepare(`
        INSERT INTO documents (listing_id, title, doc_type, file_name, file_path, file_size, mime_type, notes)
        VALUES (@listing_id, @title, @doc_type, @file_name, @file_path, @file_size, @mime_type, @notes)
      `).run({
        listing_id: listing_id ? parseInt(listing_id, 10) : null,
        title,
        doc_type: doc_type || 'other',
        file_name: req.file.originalname,
        file_path: req.file.path,
        file_size: req.file.size,
        mime_type: req.file.mimetype,
        notes: notes || null,
      });

      const newDoc = db.prepare('SELECT * FROM documents WHERE id = ?').get(result.lastInsertRowid);

      res.status(201).json({
        success: true,
        data: newDoc,
        message: 'Document uploaded successfully.',
      });
    } catch (err) {
      console.error('[DOCUMENTS] Upload error:', err.message);
      // Clean up file on error
      if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
      res.status(500).json({ success: false, error: 'Failed to upload document.' });
    }
  });

  // ---------------------------------------------------------------
  // GET /documents/:id - Download a document
  // ---------------------------------------------------------------
  router.get('/:id', (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ success: false, error: 'Invalid document ID.' });
      }

      const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(id);
      if (!doc) {
        return res.status(404).json({ success: false, error: 'Document not found.' });
      }

      if (!doc.file_path || !fs.existsSync(doc.file_path)) {
        return res.status(404).json({
          success: false,
          error: 'Document file not found on disk.',
        });
      }

      res.setHeader('Content-Disposition', `attachment; filename="${doc.file_name}"`);
      res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
      res.sendFile(path.resolve(doc.file_path));
    } catch (err) {
      console.error('[DOCUMENTS] Download error:', err.message);
      res.status(500).json({ success: false, error: 'Failed to download document.' });
    }
  });

  // ---------------------------------------------------------------
  // DELETE /documents/:id - Delete a document
  // ---------------------------------------------------------------
  router.delete('/:id', (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return res.status(400).json({ success: false, error: 'Invalid document ID.' });
      }

      const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(id);
      if (!doc) {
        return res.status(404).json({ success: false, error: 'Document not found.' });
      }

      // Remove file from disk if it exists
      if (doc.file_path && fs.existsSync(doc.file_path)) {
        fs.unlinkSync(doc.file_path);
      }

      db.prepare('DELETE FROM documents WHERE id = ?').run(id);

      res.json({
        success: true,
        message: `Document "${doc.title}" deleted successfully.`,
      });
    } catch (err) {
      console.error('[DOCUMENTS] Delete error:', err.message);
      res.status(500).json({ success: false, error: 'Failed to delete document.' });
    }
  });

  // ---------------------------------------------------------------
  // Multer error handler
  // ---------------------------------------------------------------
  router.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({
          success: false,
          error: 'File too large. Maximum size is 25 MB.',
        });
      }
      return res.status(400).json({ success: false, error: err.message });
    }
    if (err) {
      return res.status(400).json({ success: false, error: err.message });
    }
    next();
  });

  return router;
};
