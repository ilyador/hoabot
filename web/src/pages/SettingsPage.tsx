import { useState, useEffect } from 'react';
import { trpc } from '../trpc';
import { useToast } from '../components/Toast';
import { AddressAutocomplete } from '../components/AddressAutocomplete';

export function SettingsPage() {
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const { data: hoa } = trpc.hoa.get.useQuery();
  const { data: stripeStatus } = trpc.stripe.status.useQuery();
  const { data: emailStatus } = trpc.email.status.useQuery();
  const connectStripe = trpc.stripe.createConnectAccount.useMutation();
  const checkOnboarding = trpc.stripe.checkOnboarding.useMutation();
  const sendReminders = trpc.email.sendPaymentReminders.useMutation();
  const updateHoa = trpc.hoa.update.useMutation({
    onSuccess: () => { utils.hoa.get.invalidate(); toast('Settings saved'); },
    onError: (err) => toast(err.message, 'error'),
  });

  // HOA info form
  const [hoaForm, setHoaForm] = useState({ name: '', address: '', phone: '', email: '' });
  useEffect(() => {
    if (hoa) setHoaForm({ name: hoa.name, address: hoa.address || '', phone: hoa.phone || '', email: hoa.email || '' });
  }, [hoa]);

  // Phone auto-format: strip non-digits, format as (555) 123-4567
  function handlePhoneChange(raw: string) {
    const digits = raw.replace(/\D/g, '').slice(0, 10);
    let formatted = '';
    if (digits.length > 0) formatted = '(' + digits.slice(0, 3);
    if (digits.length >= 3) formatted += ') ' + digits.slice(3, 6);
    if (digits.length >= 6) formatted += '-' + digits.slice(6);
    setHoaForm({ ...hoaForm, phone: formatted });
  }

  // Field validation (on blur)
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const errors: Record<string, string> = {};
  if (touched.phone && hoaForm.phone && hoaForm.phone.replace(/\D/g, '').length < 10) errors.phone = 'Enter a 10-digit phone number';
  if (touched.email && hoaForm.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(hoaForm.email)) errors.email = 'Enter a valid email address';

  // Late fee form
  const [feeForm, setFeeForm] = useState({
    lateFeeEnabled: false,
    lateFeeType: 'flat' as 'flat' | 'percent',
    lateFeeAmount: 25,
    gracePeriodDays: 15,
  });
  useEffect(() => {
    if (hoa) setFeeForm({
      lateFeeEnabled: (hoa as any).lateFeeEnabled ?? false,
      lateFeeType: ((hoa as any).lateFeeType || 'flat') as 'flat' | 'percent',
      lateFeeAmount: (hoa as any).lateFeeType === 'percent' ? ((hoa as any).lateFeeAmount ?? 500) / 100 : ((hoa as any).lateFeeAmount ?? 2500) / 100,
      gracePeriodDays: (hoa as any).gracePeriodDays ?? 15,
    });
  }, [hoa]);

  async function handleConnectStripe() {
    try {
      const result = await connectStripe.mutateAsync();
      window.open(result.url, '_blank');
    } catch (err: any) {
      toast(err.message, 'error');
    }
  }

  async function handleSendReminders() {
    try {
      const results = await sendReminders.mutateAsync();
      const sent = results.filter((r: any) => r.sent).length;
      const failed = results.filter((r: any) => !r.sent).length;
      toast(`Payment reminders: ${sent} sent, ${failed} failed`, failed > 0 ? 'warning' : 'success');
    } catch (err: any) {
      toast(err.message, 'error');
    }
  }

  return (
    <div>
      <h1 className="mb-6">Settings</h1>

      {/* HOA Info */}
      <div className="card p-5 mb-6">
        <h2 className="mb-4">HOA Information</h2>
        <form onSubmit={e => { e.preventDefault(); updateHoa.mutate(hoaForm); }} className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">HOA Name</label>
            <input type="text" value={hoaForm.name} onChange={e => setHoaForm({ ...hoaForm, name: e.target.value })} className="input" required />
          </div>
          <div>
            <label className="label">Address</label>
            <AddressAutocomplete value={hoaForm.address} onChange={addr => setHoaForm({ ...hoaForm, address: addr })} />
          </div>
          <div>
            <label className="label">Phone</label>
            <input type="tel" value={hoaForm.phone} onChange={e => handlePhoneChange(e.target.value)} onBlur={() => setTouched(t => ({ ...t, phone: true }))} className="input" placeholder="(555) 123-4567" style={errors.phone ? { borderColor: 'var(--error)' } : {}} />
            {errors.phone && <div className="text-[11px] mt-1" style={{ color: 'var(--error)' }}>{errors.phone}</div>}
          </div>
          <div>
            <label className="label">Contact Email</label>
            <input type="email" value={hoaForm.email} onChange={e => setHoaForm({ ...hoaForm, email: e.target.value })} onBlur={() => setTouched(t => ({ ...t, email: true }))} className="input" placeholder="board@yourhoa.com" style={errors.email ? { borderColor: 'var(--error)' } : {}} />
            {errors.email && <div className="text-[11px] mt-1" style={{ color: 'var(--error)' }}>{errors.email}</div>}
          </div>
          <div className="md:col-span-2">
            <button type="submit" disabled={updateHoa.isPending} className="btn btn-primary">
              {updateHoa.isPending ? 'Saving...' : 'Save HOA Info'}
            </button>
          </div>
        </form>
      </div>

      {/* Late Fee Settings */}
      <div className="card p-5 mb-6">
        <h2 className="mb-4">Late Fee Policy</h2>
        <form onSubmit={e => {
          e.preventDefault();
          updateHoa.mutate({
            lateFeeEnabled: feeForm.lateFeeEnabled,
            lateFeeType: feeForm.lateFeeType,
            lateFeeAmount: feeForm.lateFeeType === 'percent'
              ? Math.round(feeForm.lateFeeAmount * 100)  // to basis points
              : Math.round(feeForm.lateFeeAmount * 100),  // to cents
            gracePeriodDays: feeForm.gracePeriodDays,
          });
        }} className="space-y-4">
          <div className="flex items-center gap-3">
            <input type="checkbox" checked={feeForm.lateFeeEnabled} onChange={e => setFeeForm({ ...feeForm, lateFeeEnabled: e.target.checked })}
              style={{ width: '16px', height: '16px', accentColor: 'var(--accent)' }} />
            <label className="text-[14px]" style={{ color: 'var(--text-primary)' }}>Enable automatic late fees</label>
          </div>

          {feeForm.lateFeeEnabled && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="label">Fee Type</label>
                <select value={feeForm.lateFeeType} onChange={e => setFeeForm({ ...feeForm, lateFeeType: e.target.value as any })} className="input">
                  <option value="flat">Flat Amount ($)</option>
                  <option value="percent">Percentage (%)</option>
                </select>
              </div>
              <div>
                <label className="label">{feeForm.lateFeeType === 'flat' ? 'Fee Amount ($)' : 'Fee Percentage (%)'}</label>
                <input type="number" step={feeForm.lateFeeType === 'flat' ? '0.01' : '0.1'} min="0"
                  value={feeForm.lateFeeAmount} onChange={e => setFeeForm({ ...feeForm, lateFeeAmount: parseFloat(e.target.value) || 0 })}
                  className="input" />
              </div>
              <div>
                <label className="label">Grace Period (days)</label>
                <input type="number" min="0" max="90" value={feeForm.gracePeriodDays}
                  onChange={e => setFeeForm({ ...feeForm, gracePeriodDays: parseInt(e.target.value) || 0 })}
                  className="input" />
              </div>
            </div>
          )}

          <p className="text-[12px]" style={{ color: 'var(--text-tertiary)' }}>
            {feeForm.lateFeeEnabled
              ? `A ${feeForm.lateFeeType === 'flat' ? `$${feeForm.lateFeeAmount.toFixed(2)}` : `${feeForm.lateFeeAmount}%`} late fee will be applied to invoices unpaid after ${feeForm.gracePeriodDays} days past due. Use "Apply Late Fees" on the Invoices page to run.`
              : 'Late fees are currently disabled.'
            }
          </p>

          <button type="submit" disabled={updateHoa.isPending} className="btn btn-primary">
            {updateHoa.isPending ? 'Saving...' : 'Save Late Fee Policy'}
          </button>
        </form>
      </div>

      {/* Stripe Connect */}
      <div className="card p-5 mb-6">
        <h2 className="mb-3">Payment Processing (Stripe)</h2>
        {stripeStatus ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: stripeStatus.stripeConfigured ? 'var(--success)' : 'var(--error)', flexShrink: 0 }} />
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                Stripe API: {stripeStatus.stripeConfigured ? 'Configured' : 'Not configured (set STRIPE_SECRET_KEY in .env)'}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: stripeStatus.accountConnected ? 'var(--success)' : 'var(--warning)', flexShrink: 0 }} />
              <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
                Bank Account: {stripeStatus.onboardingComplete ? 'Connected and verified' : stripeStatus.accountConnected ? 'Connected, onboarding incomplete' : 'Not connected'}
              </span>
            </div>
            {stripeStatus.stripeConfigured && (
              <div className="flex gap-2">
                <button onClick={handleConnectStripe} disabled={connectStripe.isPending} className="btn btn-primary">
                  {stripeStatus.accountConnected ? 'Update Bank Account' : 'Connect Bank Account'}
                </button>
                {stripeStatus.accountConnected && !stripeStatus.onboardingComplete && (
                  <button onClick={() => checkOnboarding.mutateAsync().then(r => toast(r.onboardingComplete ? 'Onboarding complete!' : 'Onboarding not yet complete', r.onboardingComplete ? 'success' : 'info'))}
                    className="btn btn-secondary">
                    Check Status
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          <div style={{ color: 'var(--text-tertiary)', fontSize: '13px' }}>Loading...</div>
        )}
      </div>

      {/* Email */}
      <div className="card p-5 mb-6">
        <h2 className="mb-3">Email Notifications (Resend)</h2>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: emailStatus?.configured ? 'var(--success)' : 'var(--error)', flexShrink: 0 }} />
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              {emailStatus?.configured ? 'Email configured and ready' : 'Not configured (set RESEND_API_KEY in .env)'}
            </span>
          </div>
          <button onClick={handleSendReminders} disabled={sendReminders.isPending} className="btn btn-primary">
            {sendReminders.isPending ? 'Sending...' : 'Send Payment Reminders (all pending/overdue)'}
          </button>
          {sendReminders.data && (
            <div style={{ fontSize: '13px', color: 'var(--text-tertiary)' }}>
              Last run: {sendReminders.data.filter((r: any) => r.sent).length} sent, {sendReminders.data.filter((r: any) => !r.sent).length} failed
            </div>
          )}
        </div>
      </div>

      {/* Subscription */}
      <SubscriptionSection />

      {/* Xero Integration */}
      <XeroSection />

      {/* AI Status */}
      <div className="card p-5">
        <h2 className="mb-3">AI Features (LM Studio)</h2>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--success)', flexShrink: 0 }} />
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Connected to local LM Studio</span>
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>
            AI-powered features: CC&R chatbot, violation notice generation, meeting minutes.
            Access via the AI Assistant page in the sidebar.
          </div>
        </div>
      </div>
    </div>
  );
}

function SubscriptionSection() {
  const { toast } = useToast();
  const { data: subStatus } = trpc.subscription.status.useQuery();
  const createCheckout = trpc.subscription.createCheckout.useMutation();
  const portalUrl = trpc.subscription.portalUrl.useMutation();

  const statusColors: Record<string, string> = {
    trialing: 'var(--info)',
    active: 'var(--success)',
    past_due: 'var(--warning)',
    canceled: 'var(--error)',
    unpaid: 'var(--error)',
  };

  const statusLabels: Record<string, string> = {
    trialing: 'Free Trial',
    active: 'Active',
    past_due: 'Past Due',
    canceled: 'Canceled',
    unpaid: 'Unpaid',
  };

  return (
    <div className="card p-5 mb-6">
      <h2 className="mb-3">Subscription & Billing</h2>
      {subStatus ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: statusColors[subStatus.status] || 'var(--text-tertiary)', flexShrink: 0 }} />
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              Status: <strong>{statusLabels[subStatus.status] || subStatus.status}</strong>
            </span>
          </div>

          {subStatus.status === 'trialing' && subStatus.trialEndsAt && (
            <div className="text-[13px] p-3 rounded-[6px]" style={{ background: 'var(--info-muted)', color: 'var(--info)' }}>
              Your free trial ends on {new Date(subStatus.trialEndsAt).toLocaleDateString()}. After that, it's $20/month.
            </div>
          )}

          {subStatus.currentPeriodEnd && subStatus.status === 'active' && (
            <div className="text-[12px]" style={{ color: 'var(--text-tertiary)' }}>
              Next billing date: {new Date(subStatus.currentPeriodEnd).toLocaleDateString()}
            </div>
          )}

          {subStatus.status === 'past_due' && (
            <div className="text-[13px] p-3 rounded-[6px]" style={{ background: 'var(--warning-muted)', color: 'var(--warning)' }}>
              Your payment failed. Please update your payment method to avoid service interruption.
            </div>
          )}

          <div className="flex gap-2">
            {!subStatus.subscriptionId || subStatus.status === 'canceled' ? (
              <button onClick={async () => {
                try {
                  const r = await createCheckout.mutateAsync();
                  if (r.url) window.location.href = r.url;
                } catch (err: any) { toast(err.message, 'error'); }
              }} disabled={createCheckout.isPending || !subStatus.configured} className="btn btn-primary">
                {createCheckout.isPending ? 'Loading...' : 'Start Free Trial ($20/mo after 30 days)'}
              </button>
            ) : (
              <button onClick={async () => {
                try {
                  const r = await portalUrl.mutateAsync();
                  if (r.url) window.location.href = r.url;
                } catch (err: any) { toast(err.message, 'error'); }
              }} disabled={portalUrl.isPending} className="btn btn-secondary">
                {portalUrl.isPending ? 'Loading...' : 'Manage Billing'}
              </button>
            )}
          </div>

          {!subStatus.configured && (
            <div className="text-[12px]" style={{ color: 'var(--text-tertiary)' }}>
              Set STRIPE_PRICE_ID in .env to enable subscriptions.
            </div>
          )}
        </div>
      ) : (
        <div style={{ color: 'var(--text-tertiary)', fontSize: '13px' }}>Loading...</div>
      )}
    </div>
  );
}

function XeroSection() {
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const { data: xeroStatus } = trpc.xero.status.useQuery();
  const connectXero = trpc.xero.connectUrl.useMutation();
  const disconnectXero = trpc.xero.disconnect.useMutation({
    onSuccess: () => { utils.xero.status.invalidate(); toast('Xero disconnected'); },
  });
  const syncContacts = trpc.xero.syncContacts.useMutation({
    onSuccess: (data) => toast(`Synced ${data.synced} contacts to Xero${data.failed ? `, ${data.failed} failed` : ''}`),
    onError: (err) => toast(err.message, 'error'),
  });
  const syncInvoices = trpc.xero.syncInvoices.useMutation({
    onSuccess: (data) => toast(`Synced ${data.synced} invoices to Xero${data.failed ? `, ${data.failed} failed` : ''}`),
    onError: (err) => toast(err.message, 'error'),
  });

  return (
    <div className="card p-5 mb-6">
      <h2 className="mb-3">Accounting (Xero)</h2>
      {xeroStatus ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: xeroStatus.connected ? 'var(--success)' : xeroStatus.configured ? 'var(--warning)' : 'var(--error)', flexShrink: 0 }} />
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
              {xeroStatus.connected ? 'Connected to Xero' : xeroStatus.configured ? 'Not connected' : 'Not configured (set XERO_CLIENT_ID and XERO_CLIENT_SECRET in .env)'}
            </span>
          </div>

          {xeroStatus.configured && !xeroStatus.connected && (
            <button onClick={async () => {
              try {
                const r = await connectXero.mutateAsync();
                window.location.href = r.url;
              } catch (err: any) { toast(err.message, 'error'); }
            }} disabled={connectXero.isPending} className="btn btn-primary">
              {connectXero.isPending ? 'Loading...' : 'Connect Xero'}
            </button>
          )}

          {xeroStatus.connected && (
            <>
              <div className="flex gap-2">
                <button onClick={() => syncContacts.mutate()} disabled={syncContacts.isPending} className="btn btn-secondary btn-sm">
                  {syncContacts.isPending ? 'Syncing...' : 'Sync Contacts'}
                </button>
                <button onClick={() => syncInvoices.mutate()} disabled={syncInvoices.isPending} className="btn btn-secondary btn-sm">
                  {syncInvoices.isPending ? 'Syncing...' : 'Sync Invoices'}
                </button>
                <button onClick={() => { if (confirm('Disconnect Xero?')) disconnectXero.mutate(); }} className="btn btn-ghost btn-sm" style={{ color: 'var(--error)' }}>
                  Disconnect
                </button>
              </div>
              <p className="text-[12px]" style={{ color: 'var(--text-tertiary)' }}>
                New invoices and payments are automatically synced to Xero. Use the buttons above to sync existing data.
              </p>
            </>
          )}
        </div>
      ) : (
        <div style={{ color: 'var(--text-tertiary)', fontSize: '13px' }}>Loading...</div>
      )}
    </div>
  );
}
