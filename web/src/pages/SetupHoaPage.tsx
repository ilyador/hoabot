import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { trpc } from '../trpc';
import { useQueryClient } from '@tanstack/react-query';
import { FormField } from '../components/FormField';
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

          <form onSubmit={(e) => { e.preventDefault(); setError(''); createHoa.mutate({ name, address }); }}>
            <FormField
              label="HOA Name"
              value={name}
              onChange={setName}
              placeholder="e.g., Sunset Ridge HOA"
              required
              disabled={createHoa.isPending}
              className="mb-4"
            />

            <FormField
              label="Address"
              value={address}
              onChange={setAddress}
              disabled={createHoa.isPending}
              className="mb-6"
            >
              <AddressAutocomplete
                value={address}
                onChange={setAddress}
                placeholder="123 Main St, Anytown, USA"
              />
            </FormField>

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
