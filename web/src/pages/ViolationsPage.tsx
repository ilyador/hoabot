import { useState } from 'react';
import { trpc } from '../trpc';
import { useToast } from '../components/Toast';

const statusBadge: Record<string, string> = {
  reported: 'badge badge-warning',
  notice_sent: 'badge badge-info',
  curing: 'badge badge-neutral',
  hearing_requested: 'badge badge-error',
  resolved: 'badge badge-success',
  escalated: 'badge badge-error',
};

const statusLabels: Record<string, string> = {
  reported: 'Reported',
  notice_sent: 'Notice Sent',
  curing: 'Curing',
  hearing_requested: 'Hearing Requested',
  resolved: 'Resolved',
  escalated: 'Escalated',
};

export function ViolationsPage() {
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const { data: violations, isLoading } = trpc.violations.list.useQuery();
  const { data: units } = trpc.units.list.useQuery();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ unitId: '', type: '', description: '', cureByDate: '', fineAmount: 0 });

  const createViolation = trpc.violations.create.useMutation({
    onSuccess: () => { utils.violations.list.invalidate(); utils.hoa.dashboard.invalidate(); setShowForm(false); setForm({ unitId: '', type: '', description: '', cureByDate: '', fineAmount: 0 }); toast('Violation reported'); },
  });
  const updateStatus = trpc.violations.updateStatus.useMutation({
    onSuccess: () => { utils.violations.list.invalidate(); utils.hoa.dashboard.invalidate(); toast('Status updated'); },
  });
  const deleteViolation = trpc.violations.delete.useMutation({
    onSuccess: () => { utils.violations.list.invalidate(); utils.hoa.dashboard.invalidate(); toast('Violation deleted', 'warning'); },
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1>Violations</h1>
        <button onClick={() => setShowForm(true)} className="btn btn-primary">
          + Report Violation
        </button>
      </div>

      {showForm && (
        <div className="card p-5 mb-6">
          <h2 className="mb-4">Report Violation</h2>
          <form onSubmit={e => { e.preventDefault(); createViolation.mutate({ ...form, fineAmount: form.fineAmount ? Math.round(form.fineAmount * 100) : undefined, cureByDate: form.cureByDate || undefined }); }}
            className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">Unit</label>
              <select value={form.unitId} onChange={e => setForm({ ...form, unitId: e.target.value })}
                className="input" required>
                <option value="">Select unit...</option>
                {units?.map((u: any) => <option key={u.id} value={u.id}>{u.address}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Type</label>
              <input type="text" value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}
                className="input"
                placeholder="e.g., Lawn maintenance, Noise, Parking" required />
            </div>
            <div className="md:col-span-2">
              <label className="label">Description</label>
              <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3}
                className="input" required />
            </div>
            <div>
              <label className="label">Cure By Date</label>
              <input type="date" value={form.cureByDate} onChange={e => setForm({ ...form, cureByDate: e.target.value })}
                className="input" />
            </div>
            <div>
              <label className="label">Fine Amount ($)</label>
              <input type="number" step="0.01" min="0" value={form.fineAmount} onChange={e => setForm({ ...form, fineAmount: parseFloat(e.target.value) || 0 })}
                className="input" />
            </div>
            <div className="md:col-span-2 flex gap-2">
              <button type="submit" disabled={createViolation.isPending} className="btn btn-primary">Report</button>
              <button type="button" onClick={() => setShowForm(false)} className="btn btn-secondary">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {isLoading ? (
        <div style={{ color: 'var(--text-tertiary)' }}>Loading...</div>
      ) : !violations?.length ? (
        <div className="empty-state">
          <h3>No violations reported</h3>
          <p>That's good news!</p>
        </div>
      ) : (
        <div className="space-y-4">
          {violations.map((v: any) => (
            <div key={v.id} className="card p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={statusBadge[v.status]}>{statusLabels[v.status]}</span>
                    <span style={{ color: 'var(--text-tertiary)', fontSize: '12px' }}>{v.type}</span>
                  </div>
                  <div style={{ color: 'var(--text-primary)', fontWeight: 500, marginTop: '4px' }}>{v.unit.address}</div>
                </div>
                <button onClick={() => { if (confirm('Delete?')) deleteViolation.mutate({ id: v.id }); }} className="btn btn-ghost btn-sm" style={{ color: 'var(--error)' }}>Delete</button>
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '8px' }}>{v.description}</p>
              {v.fineAmount && <p style={{ color: 'var(--warning)', fontSize: '13px', marginTop: '4px' }}>Fine: ${(v.fineAmount / 100).toFixed(2)}</p>}
              {v.cureByDate && <p style={{ color: 'var(--text-tertiary)', fontSize: '12px', marginTop: '4px' }}>Cure by: {new Date(v.cureByDate).toLocaleDateString()}</p>}

              {/* Owner Response */}
              {v.ownerResponse && (
                <div className="mt-3 p-3 rounded-[6px]" style={{ background: 'var(--accent-muted)', border: '1px solid var(--accent)20' }}>
                  <div className="text-[11px] font-semibold mb-1" style={{ color: 'var(--accent)' }}>
                    Homeowner Response {v.respondedAt && <span style={{ fontWeight: 400 }}>({new Date(v.respondedAt).toLocaleDateString()})</span>}
                  </div>
                  <p className="text-[13px]" style={{ color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>{v.ownerResponse}</p>
                </div>
              )}

              <div className="flex gap-2 mt-3">
                {v.status !== 'resolved' && (
                  <select value={v.status} onChange={e => updateStatus.mutate({ id: v.id, status: e.target.value as any })}
                    className="input" style={{ width: 'auto', padding: '4px 32px 4px 8px', fontSize: '13px' }}>
                    <option value="reported">Reported</option>
                    <option value="notice_sent">Notice Sent</option>
                    <option value="curing">Curing</option>
                    <option value="hearing_requested">Hearing Requested</option>
                    <option value="resolved">Resolved</option>
                    <option value="escalated">Escalated</option>
                  </select>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
