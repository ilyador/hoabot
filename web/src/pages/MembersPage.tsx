import { useState } from 'react';
import { trpc } from '../trpc';
import { useQueryClient } from '@tanstack/react-query';

function formatRole(role: string): string {
  return role === 'board_member' ? 'Board Member' : role === 'homeowner' ? 'Homeowner' : 'Admin';
}

export function MembersPage() {
  const queryClient = useQueryClient();
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'board_member' | 'homeowner'>('board_member');
  const [unitId, setUnitId] = useState('');
  const [inviteResult, setInviteResult] = useState<{ link: string; emailSent: boolean; emailError?: string | null } | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const me = trpc.auth.me.useQuery();
  const members = trpc.members.list.useQuery();
  const invites = trpc.members.listInvites.useQuery();
  const units = trpc.units.list.useQuery();

  const invite = trpc.members.invite.useMutation({
    onSuccess: (data) => {
      setInviteResult({ link: data.link, emailSent: data.emailSent, emailError: data.emailError });
      setEmail('');
      setUnitId('');
      queryClient.invalidateQueries();
    },
  });

  const remove = trpc.members.remove.useMutation({
    onSuccess: () => queryClient.invalidateQueries(),
  });

  const revoke = trpc.members.revokeInvite.useMutation({
    onSuccess: () => queryClient.invalidateQueries(),
  });

  const resend = trpc.members.resendInvite.useMutation({
    onSuccess: () => queryClient.invalidateQueries(),
  });

  const availableUnits = (units.data || []).filter((u: any) => !u.userId);

  function copyLink(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <span className="label">Administration</span>
          <h1>Members</h1>
        </div>
        <button className="btn btn-primary" onClick={() => { setShowInviteForm(!showInviteForm); setInviteResult(null); invite.reset(); }}>
          {showInviteForm ? 'Cancel' : 'Invite Member'}
        </button>
      </div>

      {showInviteForm && (
        <div className="card p-5 mb-6">
          <h3 className="mb-4">Invite a new member</h3>
          {invite.error && (
            <div className="rounded-[6px] px-3 py-2.5 mb-4 text-[13px] font-medium" style={{ background: 'var(--error-muted)', color: 'var(--error)' }}>
              {invite.error.message}
            </div>
          )}
          {inviteResult && (
            <div className="rounded-[6px] p-3 mb-4 text-[13px]" style={{ background: 'var(--success-muted)', color: 'var(--success)' }}>
              <p className="font-medium mb-2">Invite created!</p>
              <p>{inviteResult.emailSent ? 'Email sent successfully.' : "Email couldn't be sent — share the link manually."}</p>
              <div className="flex gap-2 mt-2">
                <input className="input text-[12px]" readOnly value={inviteResult.link} onClick={(e) => (e.target as HTMLInputElement).select()} />
                <button className="btn btn-secondary btn-sm" onClick={() => copyLink(inviteResult.link, 'new')}>
                  {copiedId === 'new' ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
          )}
          <form onSubmit={(e) => { e.preventDefault(); invite.mutate({ email, role, unitId: role === 'homeowner' && unitId ? unitId : undefined }); }}>
            <div className="flex gap-3 flex-wrap">
              <div className="flex-1" style={{ minWidth: '200px' }}>
                <label className="label">Email</label>
                <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="member@example.com" required />
              </div>
              <div>
                <label className="label">Role</label>
                <select className="input" value={role} onChange={(e) => { setRole(e.target.value as any); setUnitId(''); }}>
                  <option value="board_member">Board Member</option>
                  <option value="homeowner">Homeowner</option>
                </select>
              </div>
              {role === 'homeowner' && (
                <div>
                  <label className="label">Unit</label>
                  <select className="input" value={unitId} onChange={(e) => setUnitId(e.target.value)} required>
                    <option value="">Select unit...</option>
                    {availableUnits.map((u: any) => (
                      <option key={u.id} value={u.id}>{u.address}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <button type="submit" className="btn btn-primary mt-4" disabled={invite.isPending}>
              {invite.isPending ? 'Sending...' : 'Send Invite'}
            </button>
          </form>
        </div>
      )}

      <h3 className="mb-3">Current Members</h3>
      <div className="table-wrap mb-8">
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Joined</th>
              <th style={{ width: '80px' }}></th>
            </tr>
          </thead>
          <tbody>
            {(members.data || []).map((m: any) => (
              <tr key={m.id}>
                <td>{m.name}</td>
                <td style={{ color: 'var(--text-secondary)' }}>{m.email}</td>
                <td><span className="badge badge-neutral">{formatRole(m.role)}</span></td>
                <td style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>{new Date(m.createdAt).toLocaleDateString()}</td>
                <td>
                  {me.data?.id !== m.id && (
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => { if (window.confirm(`Remove ${m.name} from this HOA?`)) remove.mutate({ userId: m.id }); }}
                      disabled={remove.isPending}
                    >
                      Remove
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="mb-3">Pending Invites</h3>
      {(invites.data || []).length === 0 ? (
        <p className="text-[13px]" style={{ color: 'var(--text-tertiary)' }}>No pending invites</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Email</th>
                <th>Role</th>
                <th>Unit</th>
                <th>Status</th>
                <th>Expires</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {(invites.data || []).map((inv: any) => {
                const isExpired = inv.effectiveStatus === 'expired';
                const isPending = inv.effectiveStatus === 'pending';
                return (
                  <tr key={inv.id} style={{ opacity: isExpired ? 0.5 : 1 }}>
                    <td>{inv.email}</td>
                    <td>{formatRole(inv.role)}</td>
                    <td style={{ color: 'var(--text-secondary)' }}>{inv.unit?.address || '—'}</td>
                    <td>
                      <span className={`badge ${isPending ? 'badge-warning' : inv.effectiveStatus === 'accepted' ? 'badge-success' : 'badge-error'}`}>
                        {inv.effectiveStatus}
                      </span>
                    </td>
                    <td style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>{new Date(inv.expiresAt).toLocaleDateString()}</td>
                    <td>
                      {isPending && (
                        <div className="flex gap-1">
                          <button className="btn btn-danger btn-sm" onClick={() => { if (window.confirm('Revoke this invite?')) revoke.mutate({ inviteId: inv.id }); }}>Revoke</button>
                          <button className="btn btn-secondary btn-sm" onClick={() => resend.mutate({ inviteId: inv.id })}>Resend</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => copyLink(`${window.location.origin}/join/${inv.token}`, inv.id)}>
                            {copiedId === inv.id ? 'Copied!' : 'Copy Link'}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
