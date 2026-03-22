import { useState } from 'react';
import { trpc } from '../trpc';

export function AnnouncementsPage() {
  const utils = trpc.useUtils();
  const { data: announcements, isLoading } = trpc.announcements.list.useQuery();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ title: '', body: '' });

  const createAnn = trpc.announcements.create.useMutation({
    onSuccess: () => { utils.announcements.list.invalidate(); utils.hoa.dashboard.invalidate(); setShowForm(false); setForm({ title: '', body: '' }); },
  });
  const deleteAnn = trpc.announcements.delete.useMutation({
    onSuccess: () => { utils.announcements.list.invalidate(); utils.hoa.dashboard.invalidate(); },
  });

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
              <button type="submit" className="btn btn-primary">Post</button>
              <button type="button" onClick={() => setShowForm(false)} className="btn btn-secondary">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {isLoading ? (
        <div style={{ color: 'var(--text-tertiary)' }}>Loading...</div>
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
                  <div style={{ color: 'var(--text-tertiary)', fontSize: '12px', marginTop: '4px' }}>{new Date(ann.createdAt).toLocaleString()}</div>
                </div>
                <button onClick={() => { if (confirm('Delete?')) deleteAnn.mutate({ id: ann.id }); }} className="btn btn-ghost btn-sm" style={{ color: 'var(--error)' }}>Delete</button>
              </div>
              <p style={{ color: 'var(--text-secondary)', marginTop: '12px', whiteSpace: 'pre-wrap' }}>{ann.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
