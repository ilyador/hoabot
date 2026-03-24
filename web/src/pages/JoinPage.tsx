import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { trpc } from '../trpc';
import { FormField } from '../components/FormField';

function formatRole(role: string): string {
  return role === 'board_member' ? 'Board Member' : role === 'homeowner' ? 'Homeowner' : 'Admin';
}

export function JoinPage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');

  const { data: invite, isLoading, error: validateError } = trpc.auth.validateInvite.useQuery(
    { token: token! },
    { enabled: !!token, retry: false },
  );

  const register = trpc.auth.registerWithInvite.useMutation({
    onSuccess: () => { queryClient.invalidateQueries(); navigate('/'); },
    onError: (err) => setError(err.message),
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--bg-primary)' }}>
        <p style={{ color: 'var(--text-secondary)' }}>Validating invite...</p>
      </div>
    );
  }

  if (validateError || !invite) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--bg-primary)' }}>
        <div className="w-full max-w-[380px]">
          <div className="text-center mb-8">
            <div className="text-[32px] mb-1">🏘️</div>
            <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '22px' }}>Invite Link</h1>
          </div>
          <div className="card p-5">
            <div className="rounded-[6px] px-3 py-2.5 mb-4 text-[13px] font-medium" style={{ background: 'var(--error-muted)', color: 'var(--error)' }}>
              {validateError?.message || 'This invite link is invalid.'}
            </div>
            <button className="btn btn-primary w-full" onClick={() => navigate('/login')}>Back to Login</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--bg-primary)' }}>
      <div className="w-full max-w-[380px]">
        <div className="text-center mb-8">
          <div className="text-[32px] mb-1">🏘️</div>
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '22px' }}>Join {invite.hoaName}</h1>
          <p className="text-[13px] mt-1" style={{ color: 'var(--text-secondary)' }}>
            You've been invited as a <strong>{formatRole(invite.role)}</strong>
          </p>
          {invite.unitAddress && (
            <p className="text-[12px] mt-1" style={{ color: 'var(--text-tertiary)' }}>
              Linked to {invite.unitAddress}
            </p>
          )}
        </div>

        <div className="card p-5">
          {error && (
            <div className="rounded-[6px] px-3 py-2.5 mb-4 text-[13px] font-medium" style={{ background: 'var(--error-muted)', color: 'var(--error)' }}>
              {error}
            </div>
          )}

          <form onSubmit={(e) => {
            e.preventDefault();
            setError('');
            if (password !== confirmPassword) { setError('Passwords do not match'); return; }
            register.mutate({ token: token!, name, password });
          }}>
            <FormField label="Email" type="email" value={invite.email} onChange={() => {}} disabled className="mb-3" />
            <FormField label="Name" value={name} onChange={setName} placeholder="Your full name" required disabled={register.isPending} className="mb-3" />
            <FormField label="Password" type="password" value={password} onChange={setPassword} placeholder="At least 8 characters" required disabled={register.isPending} className="mb-3" />
            <FormField label="Confirm Password" type="password" value={confirmPassword} onChange={setConfirmPassword} placeholder="Confirm password" required disabled={register.isPending} className="mb-5" />
            <button type="submit" disabled={register.isPending} className="btn btn-primary w-full">
              {register.isPending ? 'Creating account...' : 'Create Account & Join'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
