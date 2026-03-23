import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { trpc } from '../trpc';
import { useQueryClient } from '@tanstack/react-query';
import { FormField } from '../components/FormField';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const login = trpc.auth.login.useMutation({
    onSuccess: () => { queryClient.invalidateQueries(); navigate('/'); },
    onError: (err) => setError(err.message),
  });

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--bg-primary)' }}>
      <div className="w-full max-w-[380px]">
        <div className="text-center mb-8">
          <div className="text-[32px] mb-1">🏘️</div>
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '22px' }}>Sign in to HOABot</h1>
          <p className="text-[13px] mt-1" style={{ color: 'var(--text-secondary)' }}>Your neighborhood, managed</p>
        </div>

        <div className="card p-5">
          {error && (
            <div className="rounded-[6px] px-3 py-2.5 mb-4 text-[13px] font-medium" style={{ background: 'var(--error-muted)', color: 'var(--error)' }}>
              {error}
            </div>
          )}

          <form onSubmit={(e) => { e.preventDefault(); setError(''); login.mutate({ email, password }); }}>
            <FormField
              label="Email"
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="you@example.com"
              required
              disabled={login.isPending}
              className="mb-3"
            />
            <FormField
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
              placeholder="••••••••"
              required
              disabled={login.isPending}
              className="mb-5"
            />
            <button type="submit" disabled={login.isPending} className="btn btn-primary w-full">
              {login.isPending ? 'Signing in...' : 'Sign In'}
            </button>
          </form>

          <p className="text-center text-[13px] mt-4" style={{ color: 'var(--text-secondary)' }}>
            Don't have an account?{' '}
            <Link to="/register" className="font-medium" style={{ color: 'var(--accent)' }}>Create one</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
