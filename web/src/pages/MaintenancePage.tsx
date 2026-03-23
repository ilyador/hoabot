import { useState } from 'react';
import { trpc } from '../trpc';
import { useToast } from '../components/Toast';
import { CardSkeleton } from '../components/LoadingSkeleton';
import { formatDateTime } from '../lib/format';

const statusBadge: Record<string, string> = {
  submitted: 'badge badge-warning',
  acknowledged: 'badge badge-info',
  in_progress: 'badge badge-neutral',
  completed: 'badge badge-success',
};

const priorityStyle: Record<string, string> = {
  low: 'var(--text-tertiary)',
  medium: 'var(--info)',
  high: 'var(--warning)',
  urgent: 'var(--error)',
};

const statusLabels: Record<string, string> = {
  submitted: 'Submitted',
  acknowledged: 'Acknowledged',
  in_progress: 'In Progress',
  completed: 'Completed',
};

export function MaintenancePage() {
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const { data: requests, isLoading } = trpc.maintenance.list.useQuery();
  const { data: units } = trpc.units.list.useQuery();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ unitId: '', title: '', description: '', priority: 'medium' as const });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [statusNote, setStatusNote] = useState('');

  const createReq = trpc.maintenance.create.useMutation({
    onSuccess: () => {
      utils.maintenance.list.invalidate();
      utils.hoa.dashboard.invalidate();
      setShowForm(false);
      setForm({ unitId: '', title: '', description: '', priority: 'medium' });
      toast('Request submitted');
    },
    onError: (err) => toast(err.message, 'error'),
  });
  const updateStatus = trpc.maintenance.updateStatus.useMutation({
    onSuccess: () => {
      utils.maintenance.list.invalidate();
      utils.hoa.dashboard.invalidate();
      setStatusNote('');
      toast('Status updated');
    },
    onError: (err) => toast(err.message, 'error'),
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1>Maintenance Requests</h1>
        <button onClick={() => setShowForm(true)} className="btn btn-primary">
          + New Request
        </button>
      </div>

      {showForm && (
        <div className="card p-5 mb-6">
          <h2 className="mb-4">New Maintenance Request</h2>
          <form onSubmit={e => { e.preventDefault(); createReq.mutate({ ...form, unitId: form.unitId || undefined }); }}
            className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">Unit (optional)</label>
              <select value={form.unitId} onChange={e => setForm({ ...form, unitId: e.target.value })}
                className="input">
                <option value="">Common area / General</option>
                {units?.map((u: any) => <option key={u.id} value={u.id}>{u.address}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Priority</label>
              <select value={form.priority} onChange={e => setForm({ ...form, priority: e.target.value as any })}
                className="input">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="label">Title</label>
              <input type="text" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                className="input"
                placeholder="e.g., Pool pump broken" required />
            </div>
            <div className="md:col-span-2">
              <label className="label">Description</label>
              <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3}
                className="input" required />
            </div>
            <div className="md:col-span-2 flex gap-2">
              <button type="submit" disabled={createReq.isPending} className="btn btn-primary">
                {createReq.isPending ? 'Submitting...' : 'Submit'}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="btn btn-secondary">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {isLoading ? (
        <CardSkeleton count={3} />
      ) : !requests?.length ? (
        <div className="empty-state">
          <h3>No maintenance requests</h3>
          <p>Submit a request when something needs attention.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {requests.map((req: any) => (
            <div key={req.id} className="card p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className={statusBadge[req.status]}>{statusLabels[req.status] || req.status}</span>
                    <span style={{ color: priorityStyle[req.priority], fontSize: '12px', fontWeight: 500 }}>{req.priority}</span>
                  </div>
                  <h3 style={{ marginTop: '4px' }}>{req.title}</h3>
                  {req.unit && <div style={{ color: 'var(--text-tertiary)', fontSize: '12px', marginTop: '2px' }}>{req.unit.address}</div>}
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={req.status}
                    onChange={e => {
                      const newStatus = e.target.value;
                      if (expandedId === req.id) {
                        updateStatus.mutate({ id: req.id, status: newStatus as any, note: statusNote || undefined });
                      } else {
                        updateStatus.mutate({ id: req.id, status: newStatus as any });
                      }
                    }}
                    disabled={updateStatus.isPending}
                    className="input"
                    style={{ width: 'auto', padding: '4px 32px 4px 8px', fontSize: '13px' }}
                  >
                    <option value="submitted">Submitted</option>
                    <option value="acknowledged">Acknowledged</option>
                    <option value="in_progress">In Progress</option>
                    <option value="completed">Completed</option>
                  </select>
                  <button onClick={() => setExpandedId(expandedId === req.id ? null : req.id)}
                    className="btn btn-ghost btn-sm" title="View timeline">
                    {expandedId === req.id ? 'Hide' : 'Details'}
                  </button>
                </div>
              </div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginTop: '8px' }}>{req.description}</p>

              {req.adminNotes && (
                <div className="mt-2 p-2 rounded-[4px] text-[12px]" style={{ background: 'var(--info-muted)', color: 'var(--info)' }}>
                  Admin note: {req.adminNotes}
                </div>
              )}

              {/* Timeline */}
              {expandedId === req.id && (
                <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
                  <div className="text-[12px] font-semibold mb-2" style={{ color: 'var(--text-tertiary)' }}>Status Timeline</div>
                  <div className="space-y-2 mb-3">
                    {req.statusHistory?.map((entry: any, i: number) => (
                      <div key={i} className="flex items-start gap-3">
                        <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: i === req.statusHistory.length - 1 ? 'var(--accent)' : 'var(--border)' }} />
                        <div>
                          <div className="text-[13px]" style={{ color: 'var(--text-primary)' }}>
                            {entry.toStatus === 'submitted' ? 'Request submitted' : `${statusLabels[entry.fromStatus] || entry.fromStatus} -> ${statusLabels[entry.toStatus] || entry.toStatus}`}
                          </div>
                          {entry.note && <div className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>{entry.note}</div>}
                          <div className="text-[11px]" style={{ color: 'var(--text-tertiary)' }}>{formatDateTime(entry.createdAt)}</div>
                        </div>
                      </div>
                    ))}
                    {(!req.statusHistory || req.statusHistory.length === 0) && (
                      <div className="text-[12px]" style={{ color: 'var(--text-tertiary)' }}>
                        Created {formatDateTime(req.createdAt)}
                      </div>
                    )}
                  </div>
                  {/* Add note with status change */}
                  <div className="flex gap-2">
                    <input type="text" value={statusNote} onChange={e => setStatusNote(e.target.value)}
                      placeholder="Add a note with next status change..."
                      className="input flex-1" style={{ fontSize: '12px' }} />
                  </div>
                  <div className="flex gap-4 mt-2 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
                    {req.acknowledgedAt && <span>Acknowledged: {formatDateTime(req.acknowledgedAt)}</span>}
                    {req.completedAt && <span>Completed: {formatDateTime(req.completedAt)}</span>}
                  </div>
                </div>
              )}

              <div style={{ color: 'var(--text-tertiary)', fontSize: '12px', marginTop: '8px' }}>{formatDateTime(req.createdAt)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
