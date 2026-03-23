import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuid } from 'uuid';
import { appRouter } from './router.js';
import { createContext } from './trpc.js';
import { prisma } from './db.js';
import { verifyToken } from './auth.js';
import { UPLOAD_DIR } from './routers/documents.js';
import { generateInvoicePdf } from './invoice-pdf.js';
import { createXeroClient, isXeroConfigured } from './xero.js';
import Stripe from 'stripe';
import { handleSubscriptionWebhook } from './routers/subscription.js';

const app = express();
const PORT = parseInt(process.env.PORT || '4100');

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    // Allow localhost and any LAN IP
    if (origin.match(/^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/)) {
      return callback(null, true);
    }
    callback(null, false);
  },
  credentials: true,
}));
app.use(cookieParser());

// Stripe webhook endpoint (must be before express.json() for raw body parsing)
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
app.post('/api/webhooks/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'] as string;
  if (!sig || !STRIPE_WEBHOOK_SECRET || STRIPE_WEBHOOK_SECRET === 'whsec_placeholder') {
    res.status(400).send('Webhook not configured');
    return;
  }

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '');
    const event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
    await handleSubscriptionWebhook(event);
    res.status(200).json({ received: true });
  } catch (err: any) {
    console.error('Stripe webhook error:', err.message);
    res.status(400).send(`Webhook Error: ${err.message}`);
  }
});

app.use(express.json());

// File upload endpoint (separate from tRPC because multer)
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => cb(null, `${uuid()}${path.extname(file.originalname)}`),
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'text/plain',
  'image/png',
  'image/jpeg',
  'image/gif',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

const INLINE_SAFE_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/gif',
]);

app.post('/api/documents/upload', upload.single('file'), async (req, res) => {
  try {
    const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
    if (!token) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const payload = verifyToken(token);
    if (!payload) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user?.hoaId) { res.status(403).json({ error: 'No HOA' }); return; }
    if (user.role !== 'admin' && user.role !== 'board_member') {
      res.status(403).json({ error: 'Admin or board member access required' }); return;
    }

    const file = req.file;
    if (!file) { res.status(400).json({ error: 'No file uploaded' }); return; }

    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      // Remove the uploaded file
      try { fs.unlinkSync(file.path); } catch (_e) { /* ignore */ }
      res.status(400).json({ error: `File type not allowed: ${file.mimetype}` }); return;
    }

    const category = (req.body.category || 'other') as any;

    const doc = await prisma.document.create({
      data: {
        hoaId: user.hoaId,
        name: req.body.name || file.originalname,
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        category,
        filePath: file.path,
        uploadedBy: user.id,
      },
    });

    res.json(doc);
  } catch (err) {
    console.error('Upload error:', err);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// Serve uploaded files
app.get('/api/documents/file/:id', async (req, res) => {
  try {
    const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
    if (!token) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const payload = verifyToken(token);
    if (!payload) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user?.hoaId) { res.status(403).json({ error: 'No HOA' }); return; }

    const doc = await prisma.document.findUnique({ where: { id: req.params.id } });
    if (!doc) { res.status(404).json({ error: 'Not found' }); return; }

    // Verify document belongs to user's HOA
    if (doc.hoaId !== user.hoaId) { res.status(403).json({ error: 'Forbidden' }); return; }

    // Prevent path traversal
    const resolvedPath = path.resolve(doc.filePath);
    const resolvedUploadDir = path.resolve(UPLOAD_DIR);
    if (!resolvedPath.startsWith(resolvedUploadDir + path.sep)) {
      res.status(403).json({ error: 'Invalid file path' }); return;
    }

    res.setHeader('Content-Type', doc.mimeType);
    const disposition = INLINE_SAFE_TYPES.has(doc.mimeType) ? 'inline' : 'attachment';
    res.setHeader('Content-Disposition', `${disposition}; filename="${doc.fileName}"`);
    res.sendFile(resolvedPath);
  } catch (err) {
    res.status(500).json({ error: 'Failed to serve file' });
  }
});

// Xero OAuth callback
app.get('/api/xero/callback', async (req, res) => {
  try {
    if (!isXeroConfigured()) { res.status(400).send('Xero not configured'); return; }

    const hoaId = req.query.state as string;
    if (!hoaId) { res.status(400).send('Missing state parameter'); return; }

    const xero = createXeroClient();
    const tokenSet = await xero.apiCallback(req.url);
    await xero.updateTenants();

    const tenantId = xero.tenants[0]?.tenantId;
    if (!tenantId) { res.status(400).send('No Xero organization found'); return; }

    await prisma.hoa.update({
      where: { id: hoaId },
      data: {
        xeroConnected: true,
        xeroTenantId: tenantId,
        xeroTokenSet: JSON.stringify(tokenSet),
      },
    });

    res.redirect('/settings?xero=connected');
  } catch (err) {
    console.error('Xero callback error:', err);
    res.redirect('/settings?xero=error');
  }
});

// Invoice PDF download
app.get('/api/invoices/:id/pdf', async (req, res) => {
  try {
    const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
    if (!token) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const payload = verifyToken(token);
    if (!payload) { res.status(401).json({ error: 'Unauthorized' }); return; }

    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user?.hoaId) { res.status(403).json({ error: 'No HOA' }); return; }

    const invoice = await prisma.invoice.findUnique({
      where: { id: req.params.id },
      include: { unit: true, hoa: true, lineItems: true },
    });
    if (!invoice) { res.status(404).json({ error: 'Not found' }); return; }
    if (invoice.hoaId !== user.hoaId) { res.status(403).json({ error: 'Forbidden' }); return; }

    // Calculate previous balance (sum of unpaid invoices for this unit before this one)
    const previousInvoices = await prisma.invoice.findMany({
      where: {
        hoaId: user.hoaId,
        unitId: invoice.unitId,
        createdAt: { lt: invoice.createdAt },
        status: { in: ['pending', 'overdue'] },
      },
    });
    const previousBalance = previousInvoices.reduce((sum, inv) => sum + inv.amount + inv.lateFeeAmount, 0);

    const pdfBuffer = await generateInvoicePdf({
      invoiceNumber: invoice.invoiceNumber,
      status: invoice.status,
      createdAt: invoice.createdAt,
      dueDate: invoice.dueDate,
      paidAt: invoice.paidAt,
      amount: invoice.amount,
      lateFeeAmount: invoice.lateFeeAmount,
      description: invoice.description,
      billingPeriod: invoice.billingPeriod,
      hoa: invoice.hoa,
      unit: invoice.unit,
      lineItems: invoice.lineItems.map(li => ({
        description: li.description,
        amount: li.amount,
        type: li.type,
      })),
      previousBalance,
    });

    const filename = `invoice-${String(invoice.invoiceNumber).padStart(5, '0')}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('PDF generation error:', err);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
});

// LinkedIn OAuth callback
app.get('/api/linkedin/callback', async (req, res) => {
  const code = req.query.code as string;
  if (!code) { res.status(400).send('Missing code parameter'); return; }

  try {
    const tokenRes = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.LINKEDIN_REDIRECT_URI || 'http://192.168.1.192:4100/api/linkedin/callback',
        client_id: process.env.LINKEDIN_CLIENT_ID || '',
        client_secret: process.env.LINKEDIN_CLIENT_SECRET || '',
      }),
    });
    const tokenData = await tokenRes.json() as any;
    if (tokenData.error) { res.status(400).send(`OAuth error: ${tokenData.error_description}`); return; }

    // Get user info
    const meRes = await fetch('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const me = await meRes.json() as any;

    // Save token to file for content pipeline
    const tokenFile = path.join(process.cwd(), 'content/.linkedin-token.json');
    const fs = await import('fs');
    fs.writeFileSync(tokenFile, JSON.stringify({
      access_token: tokenData.access_token,
      expires_at: Date.now() + (tokenData.expires_in * 1000),
      person_id: me.sub,
      name: me.name,
      email: me.email,
    }, null, 2));

    res.send(`<h2>LinkedIn connected!</h2><p>Authenticated as: ${me.name} (${me.email})</p><p>Token saved. You can close this window.</p>`);
  } catch (err: any) {
    console.error('LinkedIn callback error:', err);
    res.status(500).send(`Error: ${err.message}`);
  }
});

// Waitlist email collection
app.post('/api/waitlist', async (req, res) => {
  const { email } = req.body;
  if (!email || !email.includes('@')) {
    res.status(400).json({ error: 'Valid email required' });
    return;
  }
  try {
    await prisma.waitlistEmail.upsert({
      where: { email },
      create: { email },
      update: {},
    });
    res.json({ success: true, message: "You'll hear from us when the app is launched." });
  } catch (err: any) {
    console.error('Waitlist error:', err.message);
    res.status(500).json({ error: 'Something went wrong' });
  }
});

// tRPC
app.use('/api/trpc', createExpressMiddleware({
  router: appRouter,
  createContext,
}));

// Serve landing page at root
app.use('/landing', express.static(path.join(process.cwd(), 'landing')));
app.get('/', (_req, res) => {
  res.sendFile(path.join(process.cwd(), 'landing/index.html'));
});

// Serve React app at /app
app.use('/app', express.static(path.join(process.cwd(), 'web/dist')));
app.get('/app/{*path}', (_req, res) => {
  res.sendFile(path.join(process.cwd(), 'web/dist', 'index.html'));
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`HOABot server running on http://0.0.0.0:${PORT}`);
});

function gracefulShutdown(signal: string) {
  console.log(`\n${signal} received. Shutting down gracefully...`);
  server.close(() => {
    prisma.$disconnect().then(() => {
      console.log('Server closed.');
      process.exit(0);
    });
  });
  // Force exit after 10s
  setTimeout(() => process.exit(1), 10000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
