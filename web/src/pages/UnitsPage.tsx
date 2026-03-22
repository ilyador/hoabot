import { useState } from 'react';
import { trpc } from '../trpc';
import { useToast } from '../components/Toast';
import { AddressAutocomplete } from '../components/AddressAutocomplete';

export function UnitsPage() {
  const { toast } = useToast();
  const utils = trpc.useUtils();
  const { data: units, isLoading } = trpc.units.list.useQuery();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({ address: '', lotNumber: '', ownerName: '', ownerEmail: '', ownerPhone: '', monthlyDues: 0 });

  const createUnit = trpc.units.create.useMutation({ onSuccess: () => { utils.units.list.invalidate(); resetForm(); toast('Unit created'); } });
  const updateUnit = trpc.units.update.useMutation({ onSuccess: () => { utils.units.list.invalidate(); resetForm(); toast('Unit updated'); } });
  const deleteUnit = trpc.units.delete.useMutation({ onSuccess: () => { utils.units.list.invalidate(); toast('Unit deleted', 'warning'); } });

  function resetForm() { setForm({ address: '', lotNumber: '', ownerName: '', ownerEmail: '', ownerPhone: '', monthlyDues: 0 }); setShowForm(false); setEditId(null); }
  function startEdit(u: any) { setForm({ address: u.address, lotNumber: u.lotNumber || '', ownerName: u.ownerName || '', ownerEmail: u.ownerEmail || '', ownerPhone: u.ownerPhone || '', monthlyDues: u.monthlyDues / 100 }); setEditId(u.id); setShowForm(true); }
  function handleSubmit(e: React.FormEvent) { e.preventDefault(); const d = { ...form, monthlyDues: Math.round(form.monthlyDues * 100) }; editId ? updateUnit.mutate({ id: editId, ...d }) : createUnit.mutate(d); }

  const filtered = units?.filter((u: any) => {
    if (!search) return true;
    const s = search.toLowerCase();
    return u.address.toLowerCase().includes(s) || u.ownerName?.toLowerCase().includes(s) || u.ownerEmail?.toLowerCase().includes(s);
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <h1>Units & Owners</h1>
        <button onClick={() => { resetForm(); setShowForm(true); }} className="btn btn-primary">+ Add Unit</button>
      </div>

      {showForm && (
        <div className="card p-4 mb-5">
          <h3 className="mb-3">{editId ? 'Edit Unit' : 'New Unit'}</h3>
          <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div><label className="label">Address *</label><AddressAutocomplete value={form.address} onChange={addr => setForm({ ...form, address: addr })} required /></div>
            <div><label className="label">Lot #</label><input type="text" value={form.lotNumber} onChange={e => setForm({ ...form, lotNumber: e.target.value })} className="input" /></div>
            <div><label className="label">Owner Name</label><input type="text" value={form.ownerName} onChange={e => setForm({ ...form, ownerName: e.target.value })} className="input" /></div>
            <div><label className="label">Owner Email</label><input type="email" value={form.ownerEmail} onChange={e => setForm({ ...form, ownerEmail: e.target.value })} className="input" /></div>
            <div><label className="label">Owner Phone</label><input type="text" value={form.ownerPhone} onChange={e => setForm({ ...form, ownerPhone: e.target.value })} className="input" /></div>
            <div><label className="label">Monthly Dues ($)</label><input type="number" step="0.01" min="0" value={form.monthlyDues} onChange={e => setForm({ ...form, monthlyDues: parseFloat(e.target.value) || 0 })} className="input" /></div>
            <div className="md:col-span-2 flex gap-2">
              <button type="submit" className="btn btn-primary">{editId ? 'Update' : 'Create'}</button>
              <button type="button" onClick={resetForm} className="btn btn-secondary">Cancel</button>
            </div>
          </form>
        </div>
      )}

      {units && units.length > 0 && (
        <div className="mb-3">
          <input type="text" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search units, owners..." className="input w-full md:w-[280px]" />
        </div>
      )}

      {isLoading ? (
        <div style={{ color: 'var(--text-tertiary)' }}>Loading...</div>
      ) : !units?.length ? (
        <div className="empty-state">
          <div className="empty-state-icon">🏠</div>
          <h3>No units yet</h3>
          <p>Add your community's properties to start managing dues and violations.</p>
          <button onClick={() => setShowForm(true)} className="btn btn-primary">Add Your First Unit</button>
        </div>
      ) : (
        <>
          {/* Desktop */}
          <div className="table-wrap hidden md:block">
            <table>
              <thead><tr>
                <th>Address</th><th>Lot</th><th>Owner</th><th>Dues</th><th style={{ textAlign: 'right' }}>Actions</th>
              </tr></thead>
              <tbody>
                {filtered?.map((u: any) => (
                  <tr key={u.id}>
                    <td className="font-medium">{u.address}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{u.lotNumber || '—'}</td>
                    <td>
                      <div>{u.ownerName || '—'}</div>
                      {u.ownerEmail && <div className="text-[12px]" style={{ color: 'var(--text-tertiary)' }}>{u.ownerEmail}</div>}
                    </td>
                    <td className="font-medium">${(u.monthlyDues / 100).toFixed(2)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button onClick={() => startEdit(u)} className="btn btn-ghost btn-sm">Edit</button>
                      <button onClick={() => { if (confirm('Delete this unit?')) deleteUnit.mutate({ id: u.id }); }} className="btn btn-danger btn-sm ml-1">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile */}
          <div className="md:hidden space-y-2">
            {filtered?.map((u: any) => (
              <div key={u.id} className="card p-3">
                <div className="flex justify-between">
                  <div>
                    <div className="text-[14px] font-medium" style={{ color: 'var(--text-primary)' }}>{u.address}</div>
                    <div className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>{u.ownerName || 'No owner'}{u.lotNumber ? ` · Lot ${u.lotNumber}` : ''}</div>
                  </div>
                  <div className="text-[14px] font-medium" style={{ color: 'var(--text-primary)' }}>${(u.monthlyDues / 100).toFixed(2)}/mo</div>
                </div>
                <div className="flex gap-2 mt-2">
                  <button onClick={() => startEdit(u)} className="btn btn-ghost btn-sm">Edit</button>
                  <button onClick={() => { if (confirm('Delete?')) deleteUnit.mutate({ id: u.id }); }} className="btn btn-danger btn-sm">Delete</button>
                </div>
              </div>
            ))}
          </div>

          {filtered?.length === 0 && search && (
            <div className="card p-6 text-center text-[13px]" style={{ color: 'var(--text-secondary)' }}>
              No results for "{search}". <button onClick={() => setSearch('')} className="font-medium" style={{ color: 'var(--accent)' }}>Clear</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
