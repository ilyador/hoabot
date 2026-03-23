import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { trpc } from '../trpc';
import { useQueryClient } from '@tanstack/react-query';
import { FormField } from '../components/FormField';

export function RegisterPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
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
          <h1 style={{ fontFamily: 'var(--font-serif)', fontSize: '22px' }}>Create your account</h1>
          <p className="text-[13px] mt-1" style={{ color: 'var(--text-secondary)' }}>Join your neighborhood</p>
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
            if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
            if (password !== confirmPassword) { setError('Passwords do not match'); return; }
            register.mutate({ name, email, password });
          }}>
            <FormField
              label="Name"
              value={name}
              onChange={setName}
              placeholder="Your name"
              required
              disabled={register.isPending}
              className="mb-3"
            />
            <FormField
              label="Email"
              type="email"
              value={email}
              onChange={setEmail}
              placeholder="you@example.com"
              required
              disabled={register.isPending}
              className="mb-3"
            />
            <FormField
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
              placeholder="Min 8 characters"
              required
              disabled={register.isPending}
              className="mb-3"
              validate={(v) => v.length > 0 && v.length < 8 ? 'Password must be at least 8 characters' : null}
            />
            <FormField
              label="Confirm Password"
              type="password"
              value={confirmPassword}
              onChange={setConfirmPassword}
              placeholder="Repeat your password"
              required
              disabled={register.isPending}
              className="mb-5"
              validate={(v) => v.length > 0 && password.length > 0 && v !== password ? 'Passwords do not match' : null}
            />
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
