import { trpc } from '../trpc';

export function TrialExpiredPage({ user, status }: {
  user: { name: string; email: string; subscriptionStatus: string | null };
  status: string;
}) {
  const checkout = trpc.subscription.createCheckout.useMutation({
    onSuccess: (data) => {
      if (data.url) window.location.href = data.url;
    },
  });

  const isPastDue = status === 'past_due';
  const title = isPastDue ? 'Payment past due' : 'Your free trial has ended';
  const subtitle = isPastDue
    ? 'Update your payment method to continue using HOABot.'
    : 'We hope the last 30 days showed you what HOABot can do. Subscribe to keep going.';

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: 'var(--bg-primary)' }}>
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div style={{
            fontSize: '48px',
            marginBottom: '16px',
            opacity: 0.8,
          }}>
            {isPastDue ? '💳' : '🏘️'}
          </div>
          <h1 className="mb-2">{title}</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '14px', lineHeight: '1.7' }}>
            {subtitle}
          </p>
        </div>

        <div
          className="card"
          style={{
            padding: '36px 32px 32px',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '3px',
            background: 'var(--accent)',
          }} />

          <div style={{ textAlign: 'center', marginBottom: '24px' }}>
            <div style={{
              fontFamily: 'var(--font-serif)',
              fontSize: '44px',
              letterSpacing: '-0.03em',
              color: 'var(--text-primary)',
              lineHeight: 1,
              marginBottom: '4px',
            }}>
              <sup style={{ fontSize: '20px', verticalAlign: 'super' }}>$</sup>
              19
              <sup style={{ fontSize: '20px', verticalAlign: 'super' }}>.95</sup>
            </div>
            <div style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '11px',
              color: 'var(--text-tertiary)',
              letterSpacing: '0.05em',
            }}>
              per month
            </div>
          </div>

          <hr style={{
            border: 'none',
            borderTop: '1px dotted var(--border)',
            margin: '0 0 20px',
          }} />

          <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 24px' }}>
            {[
              'Unlimited units & owners',
              'Dues tracking & invoicing',
              'Violation management',
              'AI-powered CC&R assistant',
              'All features included',
            ].map((feature) => (
              <li
                key={feature}
                style={{
                  fontSize: '13px',
                  color: 'var(--text-primary)',
                  padding: '6px 0',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                }}
              >
                <span style={{ color: 'var(--accent)', fontWeight: 700, fontSize: '12px', flexShrink: 0 }}>✓</span>
                {feature}
              </li>
            ))}
          </ul>

          <button
            onClick={() => checkout.mutate()}
            disabled={checkout.isPending}
            className="btn btn-primary"
            style={{
              width: '100%',
              justifyContent: 'center',
              padding: '12px 24px',
              fontSize: '14px',
            }}
          >
            {checkout.isPending ? 'Redirecting to Stripe...' : 'Subscribe Now'}
          </button>

          {checkout.error && (
            <div style={{
              background: 'var(--error-muted)',
              color: 'var(--error)',
              borderRadius: 'var(--radius-sm)',
              padding: '10px 14px',
              marginTop: '12px',
              fontSize: '12px',
            }}>
              {checkout.error.message}
            </div>
          )}

          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            color: 'var(--text-tertiary)',
            marginTop: '14px',
            textAlign: 'center',
          }}>
            Cancel anytime. No questions asked.
          </p>
        </div>

        <p style={{
          textAlign: 'center',
          marginTop: '20px',
          fontSize: '12px',
          color: 'var(--text-tertiary)',
        }}>
          Signed in as {user.email}
        </p>
      </div>
    </div>
  );
}
