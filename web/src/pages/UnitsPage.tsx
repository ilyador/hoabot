import { useState, useEffect, useRef } from 'react';
import { trpc } from '../trpc';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/ConfirmDialog';
import { AddressAutocomplete } from '../components/AddressAutocomplete';
import { FormField } from '../components/FormField';
import { PhoneInput } from '../components/PhoneInput';
import { TableSkeleton } from '../components/LoadingSkeleton';
import { formatCurrency } from '../lib/format';

export function UnitsPage() {
  const { toast } = useToast();
  const confirm = useConfirm();
  const utils = trpc.useUtils();
  const { data: units, isLoading } = trpc.units.list.useQuery();
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [form, setForm] = useState({ address: '', lotNumber: '', ownerName: '', ownerEmail: '', ownerPhone: '', monthlyDues: 0 });

  // Debounce search input (300ms)
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => clearTimeout(searchTimerRef.current);
  }, [search]);

  const createUnit = trpc.units.create.useMutation({
    onSuccess: () => { utils.units.list.invalidate(); resetForm(); toast('Unit created'); },
    onError: (err) => toast(err.message, 'error'),
  });
  const updateUnit = trpc.units.update.useMutation({
    onSuccess: () => { utils.units.list.invalidate(); resetForm(); toast('Unit updated'); },
    onError: (err) => toast(err.message, 'error'),
  });
  const deleteUnit = trpc.units.delete.useMutation({
    onSuccess: () => { utils.units.list.invalidate(); toast('Unit deleted', 'warning'); },
    onError: (err) => toast(err.message, 'error'),
  });

  function resetForm() {
    setForm({ address: '', lotNumber: '', ownerName: '', ownerEmail: '', ownerPhone: '', monthlyDues: 0 });
    setShowForm(false);
    setEditId(null);
  }

  function startEdit(u: any) {
    setForm({
      address: u.address,
      lotNumber: u.lotNumber || '',
      ownerName: u.ownerName || '',
      ownerEmail: u.ownerEmail || '',
      ownerPhone: u.ownerPhone || '',
      monthlyDues: u.monthlyDues / 100,
    });
    setEditId(u.id);
    setShowForm(true);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const d = { ...form, monthlyDues: Math.round(form.monthlyDues * 100) };
    editId ? updateUnit.mutate({ id: editId, ...d }) : createUnit.mutate(d);
  }

  async function handleDelete(u: any) {
    const confirmed = await confirm({
      title: 'Delete unit?',
      message: 'This will also delete all invoices and violations for this unit.',
      confirmText: 'Delete',
      variant: 'danger',
    });
    if (confirmed) deleteUnit.mutate({ id: u.id });
  }

  const filtered = units?.filter((u: any) => {
    if (!debouncedSearch) return true;
    const s = debouncedSearch.toLowerCase();
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
            <FormField label="Address" value={form.address} onChange={() => {}} required>
              <AddressAutocomplete value={form.address} onChange={addr => setForm({ ...form, address: addr })} required />
            </FormField>
            <FormField
              label="Lot #"
              value={form.lotNumber}
              onChange={v => setForm({ ...form, lotNumber: v })}
            />
            <FormField
              label="Owner Name"
              value={form.ownerName}
              onChange={v => setForm({ ...form, ownerName: v })}
            />
            <FormField
              label="Owner Email"
              type="email"
              value={form.ownerEmail}
              onChange={v => setForm({ ...form, ownerEmail: v })}
              validate={v => v && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? 'Enter a valid email address' : null}
            />
            <PhoneInput
              label="Owner Phone"
              value={form.ownerPhone}
              onChange={digits => setForm({ ...form, ownerPhone: digits })}
            />
            <FormField
              label="Monthly Dues ($)"
              type="number"
              value={String(form.monthlyDues)}
              onChange={v => setForm({ ...form, monthlyDues: parseFloat(v) || 0 })}
              step="0.01"
              min="0"
            />
            <div className="md:col-span-2 flex gap-2">
              <button type="submit" disabled={createUnit.isPending || updateUnit.isPending} className="btn btn-primary">
                {(createUnit.isPending || updateUnit.isPending) ? 'Saving...' : editId ? 'Update' : 'Create'}
              </button>
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
        <TableSkeleton rows={5} cols={5} />
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
                    <td style={{ color: 'var(--text-secondary)' }}>{u.lotNumber || '\u2014'}</td>
                    <td>
                      <div>{u.ownerName || '\u2014'}</div>
                      {u.ownerEmail && <div className="text-[12px]" style={{ color: 'var(--text-tertiary)' }}>{u.ownerEmail}</div>}
                    </td>
                    <td className="font-medium">{formatCurrency(u.monthlyDues)}</td>
                    <td style={{ textAlign: 'right' }}>
                      <button onClick={() => startEdit(u)} className="btn btn-ghost btn-sm">Edit</button>
                      <button onClick={() => handleDelete(u)} disabled={deleteUnit.isPending} className="btn btn-danger btn-sm ml-1">Delete</button>
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
                    <div className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>{u.ownerName || 'No owner'}{u.lotNumber ? ` \u00b7 Lot ${u.lotNumber}` : ''}</div>
                  </div>
                  <div className="text-[14px] font-medium" style={{ color: 'var(--text-primary)' }}>{formatCurrency(u.monthlyDues)}/mo</div>
                </div>
                <div className="flex gap-2 mt-2">
                  <button onClick={() => startEdit(u)} className="btn btn-ghost btn-sm">Edit</button>
                  <button onClick={() => handleDelete(u)} disabled={deleteUnit.isPending} className="btn btn-danger btn-sm">Delete</button>
                </div>
              </div>
            ))}
          </div>

          {filtered?.length === 0 && debouncedSearch && (
            <div className="card p-6 text-center text-[13px]" style={{ color: 'var(--text-secondary)' }}>
              No results for "{debouncedSearch}". <button onClick={() => setSearch('')} className="font-medium" style={{ color: 'var(--accent)' }}>Clear</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
