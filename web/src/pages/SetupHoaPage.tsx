import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { trpc } from '../trpc';
import { useQueryClient } from '@tanstack/react-query';
import { AddressAutocomplete } from '../components/AddressAutocomplete';

export function SetupHoaPage() {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const createHoa = trpc.hoa.create.useMutation({
    onSuccess: () => {
      queryClient.invalidateQueries();
      navigate('/');
    },
    onError: (err) => setError(err.message),
  });

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--bg-primary)' }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="mb-2">Set Up Your HOA</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Let's get your community organized</p>
        </div>

        <div className="card p-6">
          {error && (
            <div style={{ background: 'var(--error-muted)', border: '1px solid var(--error)', color: 'var(--error)', borderRadius: 'var(--radius-sm)', padding: '12px 16px', marginBottom: '16px', fontSize: '13px' }}>
              {error}
            </div>
          )}

          <form onSubmit={(e) => { e.preventDefault(); createHoa.mutate({ name, address }); }}>
            <div className="mb-4">
              <label className="label">HOA Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="input"
                placeholder="e.g., Sunset Ridge HOA"
                required
              />
            </div>

            <div className="mb-6">
              <label className="label">Address</label>
              <AddressAutocomplete
                value={address}
                onChange={setAddress}
                placeholder="123 Main St, Anytown, USA"
              />
            </div>

            <button
              type="submit"
              disabled={createHoa.isPending}
              className="btn btn-primary"
              style={{ width: '100%' }}
            >
              {createHoa.isPending ? 'Creating...' : 'Create HOA'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
