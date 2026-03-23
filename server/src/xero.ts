import { XeroClient } from 'xero-node';
import crypto from 'crypto';
import { prisma } from './db.js';

const XERO_CLIENT_ID = process.env.XERO_CLIENT_ID || '';
const XERO_CLIENT_SECRET = process.env.XERO_CLIENT_SECRET || '';
const BASE_URL = process.env.VITE_API_URL || 'http://localhost:4100';
const TOKEN_KEY = process.env.TOKEN_ENCRYPTION_KEY || '';

export function encryptToken(plaintext: string): string {
  if (!TOKEN_KEY) return plaintext;
  const key = Buffer.from(TOKEN_KEY, 'hex');
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decryptToken(ciphertext: string): string {
  if (!TOKEN_KEY) return ciphertext;
  // Graceful fallback: if it doesn't look encrypted (starts with {), return as-is
  if (ciphertext.startsWith('{')) return ciphertext;
  const [ivHex, authTagHex, encHex] = ciphertext.split(':');
  if (!ivHex || !authTagHex || !encHex) return ciphertext;
  const key = Buffer.from(TOKEN_KEY, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  return decipher.update(Buffer.from(encHex, 'hex')) + decipher.final('utf8');
}

export function isXeroConfigured(): boolean {
  return !!XERO_CLIENT_ID && !!XERO_CLIENT_SECRET;
}

export function createXeroClient(): XeroClient {
  return new XeroClient({
    clientId: XERO_CLIENT_ID,
    clientSecret: XERO_CLIENT_SECRET,
    redirectUris: [`${BASE_URL}/api/xero/callback`],
    scopes: 'openid profile email offline_access accounting.invoices accounting.payments accounting.contacts accounting.settings'.split(' '),
  });
}

export async function getXeroClientForHoa(hoaId: string): Promise<{ xero: XeroClient; tenantId: string } | null> {
  const hoa = await prisma.hoa.findUnique({ where: { id: hoaId } });
  if (!hoa?.xeroConnected || !hoa.xeroTokenSet || !hoa.xeroTenantId) return null;

  const xero = createXeroClient();
  const tokenSet = JSON.parse(decryptToken(hoa.xeroTokenSet));
  await xero.setTokenSet(tokenSet);

  // Refresh if expired
  if (tokenSet.expires_at && tokenSet.expires_at * 1000 < Date.now()) {
    const newTokenSet = await xero.refreshToken();
    await prisma.hoa.update({
      where: { id: hoaId },
      data: { xeroTokenSet: encryptToken(JSON.stringify(newTokenSet)) },
    });
  }

  return { xero, tenantId: hoa.xeroTenantId };
}

// Sync a unit owner to Xero as a contact
export async function syncContactToXero(hoaId: string, unit: {
  id: string; ownerName?: string | null; ownerEmail?: string | null; ownerPhone?: string | null; address: string; xeroContactId?: string | null;
}): Promise<string | null> {
  const client = await getXeroClientForHoa(hoaId);
  if (!client) return null;

  const contactName = unit.ownerName || `Unit - ${unit.address}`;

  if (unit.xeroContactId) {
    // Update existing
    await client.xero.accountingApi.updateContact(client.tenantId, unit.xeroContactId, {
      contacts: [{
        name: contactName,
        emailAddress: unit.ownerEmail || undefined,
      }],
    });
    return unit.xeroContactId;
  }

  // Create new
  const response = await client.xero.accountingApi.createContacts(client.tenantId, {
    contacts: [{
      name: contactName,
      emailAddress: unit.ownerEmail || undefined,
      contactNumber: unit.id,
    }],
  });

  const xeroContactId = response.body.contacts?.[0]?.contactID || null;
  if (xeroContactId) {
    await prisma.unit.update({ where: { id: unit.id }, data: { xeroContactId } });
  }
  return xeroContactId;
}

// Push an invoice to Xero
export async function pushInvoiceToXero(hoaId: string, invoice: {
  id: string; invoiceNumber: number; amount: number; lateFeeAmount: number; description: string;
  dueDate: Date; createdAt: Date; unitId: string;
  lineItems: { description: string; amount: number; type: string }[];
}): Promise<string | null> {
  const client = await getXeroClientForHoa(hoaId);
  if (!client) return null;

  const unit = await prisma.unit.findUnique({ where: { id: invoice.unitId } });
  if (!unit) return null;

  // Ensure contact exists in Xero
  let contactId = unit.xeroContactId;
  if (!contactId) {
    contactId = await syncContactToXero(hoaId, unit);
  }
  if (!contactId) return null;

  const typeToAccount: Record<string, string> = {
    assessment: '400',
    special_assessment: '401',
    late_fee: '410',
    fine: '411',
    credit: '400',
  };

  const lineItems = invoice.lineItems.length > 0
    ? invoice.lineItems.map(li => ({
        description: li.description,
        quantity: 1,
        unitAmount: li.amount / 100,
        accountCode: typeToAccount[li.type] || '400',
      }))
    : [{
        description: invoice.description,
        quantity: 1,
        unitAmount: invoice.amount / 100,
        accountCode: '400',
      }];

  const response = await client.xero.accountingApi.createInvoices(client.tenantId, {
    invoices: [{
      type: 'ACCREC' as any,
      contact: { contactID: contactId },
      date: invoice.createdAt.toISOString().split('T')[0],
      dueDate: invoice.dueDate.toISOString().split('T')[0],
      invoiceNumber: `HOA-${String(invoice.invoiceNumber).padStart(5, '0')}`,
      reference: `Unit ${unit.address}`,
      status: 'AUTHORISED' as any,
      lineAmountTypes: 'NoTax' as any,
      lineItems,
    }],
  });

  const xeroInvoiceId = response.body.invoices?.[0]?.invoiceID || null;
  if (xeroInvoiceId) {
    await prisma.invoice.update({ where: { id: invoice.id }, data: { xeroInvoiceId } });
  }
  return xeroInvoiceId;
}

// Record a payment in Xero
export async function recordPaymentInXero(hoaId: string, invoice: {
  xeroInvoiceId?: string | null; amount: number; lateFeeAmount: number;
}): Promise<boolean> {
  if (!invoice.xeroInvoiceId) return false;

  const client = await getXeroClientForHoa(hoaId);
  if (!client) return false;

  try {
    await client.xero.accountingApi.createPayments(client.tenantId, {
      payments: [{
        invoice: { invoiceID: invoice.xeroInvoiceId },
        account: { code: '090' }, // Default bank account
        date: new Date().toISOString().split('T')[0],
        amount: (invoice.amount + invoice.lateFeeAmount) / 100,
      }],
    });
    return true;
  } catch (err) {
    console.error('Xero payment sync failed:', err);
    return false;
  }
}
