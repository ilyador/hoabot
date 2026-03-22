import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { trpc } from '../trpc';
import { useQueryClient } from '@tanstack/react-query';

export function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const register = trpc.auth.register.useMutation({
    onSuccess: () => { queryClient.invalidateQueries(); navigate('/'); },
    onError: (err) => setError(err.message),
  });

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--bg-primary)' }}>
      <div className="w-full max-w-[380px]">
        <div className="text-center mb-8">
          <div className="text-[32px] mb-1">🏘️</div>
          <h1 className="text-[20px] font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>Create your account</h1>
          <p className="text-[13px] mt-1" style={{ color: 'var(--text-secondary)' }}>Get started with HOABot</p>
        </div>

        <div className="card p-5">
          {error && (
            <div className="rounded-[6px] px-3 py-2.5 mb-4 text-[13px] font-medium" style={{ background: 'var(--error-muted)', color: 'var(--error)' }}>
              {error}
            </div>
          )}

          <form onSubmit={(e) => { e.preventDefault(); register.mutate({ name, email, password }); }}>
            <div className="mb-3">
              <label className="label">Name</label>
              <input type="text" value={name} onChange={e => setName(e.target.value)} className="input" placeholder="Your name" required />
            </div>
            <div className="mb-3">
              <label className="label">Email</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="input" placeholder="you@example.com" required />
            </div>
            <div className="mb-5">
              <label className="label">Password</label>
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} className="input" placeholder="Min 6 characters" required minLength={6} />
            </div>
            <button type="submit" disabled={register.isPending} className="btn btn-primary w-full">
              {register.isPending ? 'Creating account...' : 'Create Account'}
            </button>
          </form>

          <p className="text-center text-[13px] mt-4" style={{ color: 'var(--text-secondary)' }}>
            Already have an account?{' '}
            <Link to="/login" className="font-medium" style={{ color: 'var(--accent)' }}>Sign in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
