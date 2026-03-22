import { useState } from 'react';
import { trpc } from '../trpc';
import { useToast } from '../components/Toast';

const statusBadge: Record<string, string> = {
  pending: 'badge badge-warning',
  paid: 'badge badge-success',
  overdue: 'badge badge-error',
  cancelled: 'badge badge-neutral',
};

function fmt(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export function InvoicesPage() {
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const { data: invoices, isLoading } = trpc.invoices.list.useQuery();
  const { data: units } = trpc.units.list.useQuery();
  const [showForm, setShowForm] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [showLedger, setShowLedger] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [form, setForm] = useState({ unitId: '', amount: 0, description: 'Monthly HOA Dues', dueDate: '' });
  const [bulkForm, setBulkForm] = useState({ description: 'Monthly HOA Dues', dueDate: '' });

  const createInvoice = trpc.invoices.create.useMutation({
    onSuccess: () => { utils.invoices.list.invalidate(); utils.hoa.dashboard.invalidate(); setShowForm(false); toast('Invoice created'); },
    onError: (err) => toast(err.message, 'error'),
  });
  const bulkGenerate = trpc.invoices.generateBulk.useMutation({
    onSuccess: (data) => { utils.invoices.list.invalidate(); utils.hoa.dashboard.invalidate(); setShowBulk(false); toast(`Created ${data.count} invoices for ${data.billingPeriod}`); },
    onError: (err) => toast(err.message, 'error'),
  });
  const markPaid = trpc.invoices.markPaid.useMutation({
    onSuccess: () => { utils.invoices.list.invalidate(); utils.hoa.dashboard.invalidate(); toast('Marked as paid'); },
    onError: (err) => toast(err.message, 'error'),
  });
  const markOverdue = trpc.invoices.markOverdue.useMutation({
    onSuccess: () => { utils.invoices.list.invalidate(); utils.hoa.dashboard.invalidate(); },
    onError: (err) => toast(err.message, 'error'),
  });
  const cancelInvoice = trpc.invoices.cancel.useMutation({
    onSuccess: () => { utils.invoices.list.invalidate(); utils.hoa.dashboard.invalidate(); toast('Invoice cancelled', 'warning'); },
    onError: (err) => toast(err.message, 'error'),
  });
  const applyLateFees = trpc.invoices.applyLateFees.useMutation({
    onSuccess: (data) => { utils.invoices.list.invalidate(); toast(`Late fees applied to ${data.applied} invoices`); },
    onError: (err) => toast(err.message, 'error'),
  });

  const { data: ledgerData } = trpc.invoices.unitLedger.useQuery(
    { unitId: showLedger! },
    { enabled: !!showLedger }
  );

  const filtered = invoices?.filter((inv: any) => !statusFilter || inv.status === statusFilter);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1>Invoices</h1>
        <div className="flex gap-2">
          <button onClick={() => applyLateFees.mutate()} disabled={applyLateFees.isPending} className="btn btn-secondary" style={{ color: 'var(--warning)' }}>
            {applyLateFees.isPending ? 'Applying...' : 'Apply Late Fees'}
          </button>
          <button onClick={() => setShowBulk(true)} className="btn btn-primary" style={{ background: 'var(--success)' }}>
            Generate All Dues
          </button>
          <button onClick={() => setShowForm(true)} className="btn btn-primary">
            + New Invoice
          </button>
        </div>
      </div>

      {showBulk && (
        <div className="card p-5 mb-6">
          <h2 className="mb-4">Generate Dues for All Units</h2>
          <form onSubmit={e => { e.preventDefault(); bulkGenerate.mutate(bulkForm); }} className="flex gap-4 items-end flex-wrap">
            <div className="flex-1 min-w-[180px]">
              <label className="label">Description</label>
              <input type="text" value={bulkForm.description} onChange={e => setBulkForm({ ...bulkForm, description: e.target.value })}
                className="input" />
            </div>
            <div className="flex-1 min-w-[160px]">
              <label className="label">Due Date</label>
              <input type="date" value={bulkForm.dueDate} onChange={e => setBulkForm({ ...bulkForm, dueDate: e.target.value })}
                className="input" required />
            </div>
            <button type="submit" disabled={bulkGenerate.isPending} className="btn btn-primary" style={{ background: 'var(--success)' }}>
              {bulkGenerate.isPending ? 'Generating...' : 'Generate'}
            </button>
            <button type="button" onClick={() => setShowBulk(false)} className="btn btn-secondary">Cancel</button>
          </form>
          <p className="text-[12px] mt-2" style={{ color: 'var(--text-tertiary)' }}>
            Creates one invoice per unit based on each unit's configured monthly dues. Duplicate billing periods are prevented.
          </p>
        </div>
      )}

      {showForm && (
        <div className="card p-5 mb-6">
          <h2 className="mb-4">New Invoice</h2>
          <form onSubmit={e => { e.preventDefault(); createInvoice.mutate({ ...form, amount: Math.round(form.amount * 100) }); }} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">Unit</label>
              <select value={form.unitId} onChange={e => setForm({ ...form, unitId: e.target.value })}
                className="input" required>
                <option value="">Select unit...</option>
                {units?.map((u: any) => <option key={u.id} value={u.id}>{u.address} {u.ownerName ? `(${u.ownerName})` : ''}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Amount ($)</label>
              <input type="number" step="0.01" min="0.01" value={form.amount} onChange={e => setForm({ ...form, amount: parseFloat(e.target.value) || 0 })}
                className="input" required />
            </div>
            <div>
              <label className="label">Description</label>
              <input type="text" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}
                className="input" />
            </div>
            <div>
              <label className="label">Due Date</label>
              <input type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })}
                className="input" required />
            </div>
            <div className="md:col-span-2 flex gap-2">
              <button type="submit" disabled={createInvoice.isPending} className="btn btn-primary">Create</button>
              <button type="button" onClick={() => setShowForm(false)} className="btn btn-secondary">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {/* Unit Ledger Modal */}
      {showLedger && ledgerData && (
        <div className="card p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2>Account Ledger: {ledgerData.unit.address}</h2>
              <p className="text-[12px]" style={{ color: 'var(--text-tertiary)' }}>{ledgerData.unit.ownerName || 'No owner'}</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>Current Balance</div>
                <div className="text-[18px] font-semibold" style={{ color: ledgerData.currentBalance > 0 ? 'var(--error)' : 'var(--success)' }}>
                  {fmt(ledgerData.currentBalance)}
                </div>
              </div>
              <button onClick={() => setShowLedger(null)} className="btn btn-secondary btn-sm">Close</button>
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Description</th>
                  <th style={{ textAlign: 'right' }}>Charges</th>
                  <th style={{ textAlign: 'right' }}>Payments</th>
                  <th style={{ textAlign: 'right' }}>Balance</th>
                </tr>
              </thead>
              <tbody>
                {ledgerData.entries.map((entry: any, i: number) => (
                  <tr key={i}>
                    <td style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>{entry.date}</td>
                    <td>{entry.description}</td>
                    <td style={{ textAlign: 'right', color: entry.charges > 0 ? 'var(--text-primary)' : 'var(--text-tertiary)' }}>
                      {entry.charges > 0 ? fmt(entry.charges) : ''}
                    </td>
                    <td style={{ textAlign: 'right', color: entry.payments > 0 ? 'var(--success)' : 'var(--text-tertiary)' }}>
                      {entry.payments > 0 ? `-${fmt(entry.payments)}` : ''}
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 500 }}>{fmt(entry.balance)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-6 mt-3 text-[12px]" style={{ color: 'var(--text-tertiary)' }}>
            <span>Total Charges: {fmt(ledgerData.totalCharges)}</span>
            <span>Total Payments: {fmt(ledgerData.totalPayments)}</span>
          </div>
        </div>
      )}

      {/* Filters */}
      {invoices && invoices.length > 0 && (
        <div className="flex gap-2 mb-4">
          {['', 'pending', 'overdue', 'paid', 'cancelled'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`btn btn-sm ${statusFilter === s ? 'btn-primary' : 'btn-secondary'}`}>
              {s || 'All'}
            </button>
          ))}
        </div>
      )}

      {isLoading ? (
        <div style={{ color: 'var(--text-tertiary)' }}>Loading...</div>
      ) : !invoices?.length ? (
        <div className="empty-state">
          <h3>No invoices yet</h3>
          <p>Create your first invoice or generate dues for all units.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Unit</th>
                <th>Description</th>
                <th>Amount</th>
                <th>Late Fee</th>
                <th>Due</th>
                <th>Status</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered?.map((inv: any) => (
                <tr key={inv.id}>
                  <td style={{ color: 'var(--text-tertiary)', fontSize: '12px' }}>{String(inv.invoiceNumber).padStart(5, '0')}</td>
                  <td>
                    <button onClick={() => setShowLedger(inv.unitId)} className="font-medium" style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}>
                      {inv.unit.address}
                    </button>
                  </td>
                  <td style={{ color: 'var(--text-secondary)' }}>{inv.description}</td>
                  <td style={{ fontWeight: 500 }}>{fmt(inv.amount)}</td>
                  <td style={{ color: inv.lateFeeAmount > 0 ? 'var(--error)' : 'var(--text-tertiary)', fontSize: '13px' }}>
                    {inv.lateFeeAmount > 0 ? fmt(inv.lateFeeAmount) : '--'}
                  </td>
                  <td style={{ color: 'var(--text-secondary)' }}>{new Date(inv.dueDate).toLocaleDateString()}</td>
                  <td>
                    <span className={statusBadge[inv.status]}>{inv.status}</span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <a href={`/api/invoices/${inv.id}/pdf`} target="_blank" className="btn btn-ghost btn-sm" style={{ color: 'var(--accent)' }}>
                      PDF
                    </a>
                    {inv.status === 'pending' && (
                      <>
                        <button onClick={() => markPaid.mutate({ id: inv.id })} className="btn btn-ghost btn-sm" style={{ color: 'var(--success)' }}>Paid</button>
                        <button onClick={() => markOverdue.mutate({ id: inv.id })} className="btn btn-ghost btn-sm" style={{ color: 'var(--warning)' }}>Overdue</button>
                        <button onClick={() => cancelInvoice.mutate({ id: inv.id })} className="btn btn-ghost btn-sm" style={{ color: 'var(--error)' }}>Cancel</button>
                      </>
                    )}
                    {inv.status === 'overdue' && (
                      <>
                        <button onClick={() => markPaid.mutate({ id: inv.id })} className="btn btn-ghost btn-sm" style={{ color: 'var(--success)' }}>Paid</button>
                        <button onClick={() => cancelInvoice.mutate({ id: inv.id })} className="btn btn-ghost btn-sm" style={{ color: 'var(--error)' }}>Cancel</button>
                      </>
                    )}
                    {inv.status === 'paid' && (
                      <span style={{ color: 'var(--text-tertiary)', fontSize: '12px' }}>
                        {inv.paidAt ? new Date(inv.paidAt).toLocaleDateString() : ''}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
