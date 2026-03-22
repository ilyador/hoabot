import { useState, useRef } from 'react';
import { trpc } from '../trpc';
import { useToast } from '../components/Toast';

const categoryLabels: Record<string, string> = {
  ccr: 'CC&Rs',
  bylaws: 'Bylaws',
  minutes: 'Meeting Minutes',
  budget: 'Budget',
  insurance: 'Insurance',
  contract: 'Contracts',
  other: 'Other',
};

export function DocumentsPage() {
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const { data: documents, isLoading } = trpc.documents.list.useQuery();
  const deleteDoc = trpc.documents.delete.useMutation({
    onSuccess: () => utils.documents.list.invalidate(),
  });
  const [uploading, setUploading] = useState(false);
  const [category, setCategory] = useState('other');
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;

    setUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('category', category);
    formData.append('name', file.name);

    try {
      await fetch('/api/documents/upload', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });
      utils.documents.list.invalidate();
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) {
      toast('Upload failed', 'error');
    } finally {
      setUploading(false);
    }
  }

  function formatSize(bytes: number) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <div>
      <h1 className="mb-6">Documents</h1>

      <div className="card p-5 mb-6">
        <h2 className="mb-4">Upload Document</h2>
        <form onSubmit={handleUpload} className="flex gap-4 items-end flex-wrap">
          <div>
            <label className="label">Category</label>
            <select value={category} onChange={e => setCategory(e.target.value)} className="input">
              {Object.entries(categoryLabels).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="flex-1">
            <label className="label">File</label>
            <input type="file" ref={fileRef} className="input" style={{ padding: '6px 12px' }} required />
          </div>
          <button type="submit" disabled={uploading} className="btn btn-primary">
            {uploading ? 'Uploading...' : 'Upload'}
          </button>
        </form>
      </div>

      {isLoading ? (
        <div style={{ color: 'var(--text-tertiary)' }}>Loading...</div>
      ) : !documents?.length ? (
        <div className="empty-state">
          <h3>No documents uploaded yet</h3>
          <p>Upload your first document to get started.</p>
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Category</th>
                <th>Size</th>
                <th>Uploaded</th>
                <th style={{ textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc: any) => (
                <tr key={doc.id}>
                  <td>{doc.name}</td>
                  <td>
                    <span className="badge badge-neutral">{categoryLabels[doc.category] || doc.category}</span>
                  </td>
                  <td style={{ color: 'var(--text-secondary)' }}>{formatSize(doc.fileSize)}</td>
                  <td style={{ color: 'var(--text-secondary)' }}>{new Date(doc.createdAt).toLocaleDateString()}</td>
                  <td style={{ textAlign: 'right' }}>
                    <a href={`/api/documents/file/${doc.id}`} target="_blank" className="btn btn-ghost btn-sm" style={{ color: 'var(--accent)' }}>View</a>
                    <button onClick={() => { if (confirm('Delete?')) deleteDoc.mutate({ id: doc.id }); }} className="btn btn-ghost btn-sm" style={{ color: 'var(--error)' }}>Delete</button>
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
