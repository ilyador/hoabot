import { useState } from 'react';
import { trpc } from '../trpc';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmDialog';
import { CardSkeleton } from '../components/LoadingSkeleton';
import { formatDateTime } from '../lib/format';

export function AnnouncementsPage() {
  const { toast } = useToast();
  const confirm = useConfirm();
  const utils = trpc.useUtils();
  const { data: announcements, isLoading } = trpc.announcements.list.useQuery();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', body: '' });

  const createAnn = trpc.announcements.create.useMutation({
    onSuccess: () => {
      utils.announcements.list.invalidate();
      utils.hoa.dashboard.invalidate();
      setShowForm(false);
      setForm({ title: '', body: '' });
      toast('Announcement posted');
    },
    onError: (err) => toast(err.message, 'error'),
  });
  const deleteAnn = trpc.announcements.delete.useMutation({
    onSuccess: () => {
      utils.announcements.list.invalidate();
      utils.hoa.dashboard.invalidate();
      toast('Announcement deleted', 'warning');
    },
    onError: (err) => toast(err.message, 'error'),
  });

  async function handleDelete(id: string, title: string) {
    const ok = await confirm({
      title: 'Delete announcement',
      message: `Are you sure you want to delete "${title}"? This cannot be undone.`,
      confirmText: 'Delete',
      variant: 'danger',
    });
    if (ok) deleteAnn.mutate({ id });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1>Announcements</h1>
        <button onClick={() => setShowForm(true)} className="btn btn-primary">
          + New Announcement
        </button>
      </div>

      {showForm && (
        <div className="card p-5 mb-6">
          <h2 className="mb-4">New Announcement</h2>
          <form onSubmit={e => { e.preventDefault(); createAnn.mutate(form); }}>
            <div className="mb-4">
              <label className="label">Title</label>
              <input type="text" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
                className="input" required />
            </div>
            <div className="mb-4">
              <label className="label">Message</label>
              <textarea value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} rows={4}
                className="input" required />
            </div>
            <div className="flex gap-2">
              <button type="submit" disabled={createAnn.isPending} className="btn btn-primary">
                {createAnn.isPending ? 'Posting...' : 'Post'}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="btn btn-secondary">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {isLoading ? (
        <CardSkeleton count={3} />
      ) : !announcements?.length ? (
        <div className="empty-state">
          <h3>No announcements yet</h3>
          <p>Post your first announcement to keep residents informed.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {announcements.map((ann: any) => (
            <div key={ann.id} className="card p-5">
              <div className="flex items-start justify-between">
                <div>
                  <h3>{ann.title}</h3>
                  <div style={{ color: 'var(--text-tertiary)', fontSize: '12px', marginTop: '4px' }}>{formatDateTime(ann.createdAt)}</div>
                </div>
                <button onClick={() => handleDelete(ann.id, ann.title)} className="btn btn-ghost btn-sm" style={{ color: 'var(--error)' }}>Delete</button>
              </div>
              <p style={{ color: 'var(--text-secondary)', marginTop: '12px', whiteSpace: 'pre-wrap' }}>{ann.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
