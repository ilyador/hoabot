import { Resend } from 'resend';

const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const FROM_EMAIL = process.env.FROM_EMAIL || 'HOABot <onboarding@resend.dev>';

export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function getResend(): Resend | null {
  if (!RESEND_API_KEY || RESEND_API_KEY === 'placeholder') return null;
  return new Resend(RESEND_API_KEY);
}

export async function sendPaymentReminder(to: string, data: {
  ownerName: string;
  hoaName: string;
  amount: number;
  dueDate: string;
  unitAddress: string;
}): Promise<{ sent: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) return { sent: false, error: 'Email not configured (set RESEND_API_KEY)' };

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: `Payment Reminder: ${data.hoaName} - $${(data.amount / 100).toFixed(2)} due ${data.dueDate}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1e293b;">Payment Reminder</h2>
          <p>Dear ${escapeHtml(data.ownerName)},</p>
          <p>This is a reminder that your HOA dues payment is due.</p>
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <tr><td style="padding: 8px; border-bottom: 1px solid #e2e8f0; color: #64748b;">HOA</td><td style="padding: 8px; border-bottom: 1px solid #e2e8f0; font-weight: bold;">${escapeHtml(data.hoaName)}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #e2e8f0; color: #64748b;">Property</td><td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${escapeHtml(data.unitAddress)}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #e2e8f0; color: #64748b;">Amount Due</td><td style="padding: 8px; border-bottom: 1px solid #e2e8f0; font-weight: bold; color: #dc2626;">$${(data.amount / 100).toFixed(2)}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #e2e8f0; color: #64748b;">Due Date</td><td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${escapeHtml(data.dueDate)}</td></tr>
          </table>
          <p>Please make your payment at your earliest convenience.</p>
          <p style="color: #94a3b8; font-size: 12px;">This is an automated message from ${escapeHtml(data.hoaName)} via HOABot.</p>
        </div>
      `,
    });
    return { sent: true };
  } catch (err: any) {
    return { sent: false, error: err.message };
  }
}

export async function sendViolationNotice(to: string, data: {
  ownerName: string;
  hoaName: string;
  noticeText: string;
}): Promise<{ sent: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) return { sent: false, error: 'Email not configured (set RESEND_API_KEY)' };

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: `Violation Notice - ${data.hoaName}`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1e293b;">Violation Notice</h2>
          <div style="white-space: pre-wrap; line-height: 1.6;">${escapeHtml(data.noticeText)}</div>
          <p style="color: #94a3b8; font-size: 12px; margin-top: 30px;">This is an automated message from ${escapeHtml(data.hoaName)} via HOABot.</p>
        </div>
      `,
    });
    return { sent: true };
  } catch (err: any) {
    return { sent: false, error: err.message };
  }
}

export async function sendAnnouncement(recipients: string[], data: {
  hoaName: string;
  title: string;
  body: string;
}): Promise<{ sent: number; failed: number; errors: string[] }> {
  const resend = getResend();
  if (!resend) return { sent: 0, failed: 0, errors: ['Email not configured (set RESEND_API_KEY)'] };

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const to of recipients) {
    try {
      await resend.emails.send({
        from: FROM_EMAIL,
        to,
        subject: `${data.hoaName}: ${data.title}`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #1e293b;">${escapeHtml(data.title)}</h2>
            <div style="white-space: pre-wrap; line-height: 1.6;">${escapeHtml(data.body)}</div>
            <p style="color: #94a3b8; font-size: 12px; margin-top: 30px;">From ${escapeHtml(data.hoaName)} via HOABot.</p>
          </div>
        `,
      });
      sent++;
    } catch (err: any) {
      failed++;
      errors.push(`${to}: ${err.message}`);
    }
  }

  return { sent, failed, errors };
}

export function isEmailConfigured(): boolean {
  return !!RESEND_API_KEY && RESEND_API_KEY !== 'placeholder';
}

export async function sendInviteEmail(to: string, data: {
  hoaName: string;
  role: string;
  inviterName: string;
  joinUrl: string;
  unitAddress?: string;
}): Promise<{ sent: boolean; error?: string }> {
  const resend = getResend();
  if (!resend) return { sent: false, error: 'Email not configured (set RESEND_API_KEY)' };

  const roleLabel = data.role === 'board_member' ? 'Board Member' : 'Homeowner';
  const unitLine = data.unitAddress
    ? `<tr><td style="padding: 8px; border-bottom: 1px solid #e2e8f0; color: #64748b;">Unit</td><td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${escapeHtml(data.unitAddress)}</td></tr>`
    : '';

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject: `You're invited to ${data.hoaName} on HOABot`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1e293b;">You've been invited!</h2>
          <p>${escapeHtml(data.inviterName)} has invited you to join <strong>${escapeHtml(data.hoaName)}</strong> as a <strong>${roleLabel}</strong>.</p>
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <tr><td style="padding: 8px; border-bottom: 1px solid #e2e8f0; color: #64748b;">HOA</td><td style="padding: 8px; border-bottom: 1px solid #e2e8f0; font-weight: bold;">${escapeHtml(data.hoaName)}</td></tr>
            <tr><td style="padding: 8px; border-bottom: 1px solid #e2e8f0; color: #64748b;">Role</td><td style="padding: 8px; border-bottom: 1px solid #e2e8f0;">${roleLabel}</td></tr>
            ${unitLine}
          </table>
          <p><a href="${escapeHtml(data.joinUrl)}" style="display: inline-block; padding: 12px 24px; background: #4A5D3F; color: #fff; text-decoration: none; border-radius: 4px; font-weight: 600;">Accept Invitation</a></p>
          <p style="color: #94a3b8; font-size: 12px; margin-top: 24px;">This invite expires in 30 days. If you didn't expect this, you can safely ignore it.</p>
        </div>
      `,
    });
    return { sent: true };
  } catch (err: any) {
    return { sent: false, error: err.message || 'Failed to send email' };
  }
}
