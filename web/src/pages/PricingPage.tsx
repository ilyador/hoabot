export function PricingPage() {
  return (
    <div>
      <div style={{ marginBottom: '8px' }}>
        <span
          className="label"
          style={{ marginBottom: 0 }}
        >
          Pricing
        </span>
      </div>
      <h1 style={{ marginBottom: '6px' }}>One plan. No surprises.</h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: '14px', marginBottom: '32px', maxWidth: '480px' }}>
        Try everything free for 30 days. Then $19.95/month. Cancel anytime.
      </p>

      <div
        className="card"
        style={{
          maxWidth: '420px',
          padding: '40px 36px 36px',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Top accent bar */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '3px',
          background: 'var(--accent)',
        }} />

        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <span style={{
            display: 'inline-block',
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            fontWeight: 600,
            color: 'var(--accent)',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            background: 'var(--accent-muted)',
            padding: '4px 12px',
            borderRadius: '2px',
            marginBottom: '20px',
          }}>
            30-day free trial
          </span>

          <div style={{
            fontFamily: 'var(--font-serif)',
            fontSize: '52px',
            letterSpacing: '-0.03em',
            color: 'var(--text-primary)',
            lineHeight: 1,
            marginBottom: '4px',
          }}>
            <sup style={{ fontSize: '24px', verticalAlign: 'super' }}>$</sup>
            19
            <sup style={{ fontSize: '24px', verticalAlign: 'super' }}>.95</sup>
          </div>

          <div style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '11px',
            color: 'var(--text-tertiary)',
            letterSpacing: '0.05em',
          }}>
            per month, after trial
          </div>
        </div>

        <hr style={{
          border: 'none',
          borderTop: '1px dotted var(--border)',
          margin: '0 0 24px',
        }} />

        <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 28px' }}>
          {[
            'Unlimited units & owners',
            'Dues tracking & invoicing',
            'Violation management',
            'AI-powered CC&R assistant',
            'Document storage & search',
            'Announcements & maintenance logs',
            'All future features included',
          ].map((feature) => (
            <li
              key={feature}
              style={{
                fontSize: '13px',
                color: 'var(--text-primary)',
                padding: '8px 0',
                borderBottom: '1px dotted var(--border)',
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

        <a
          href="#"
          className="btn btn-primary"
          style={{
            width: '100%',
            justifyContent: 'center',
            padding: '12px 24px',
            fontSize: '14px',
            textDecoration: 'none',
          }}
        >
          Start Free Trial
        </a>

        <p style={{
          fontFamily: 'var(--font-mono)',
          fontSize: '11px',
          color: 'var(--text-tertiary)',
          marginTop: '16px',
          textAlign: 'center',
        }}>
          No credit card required to start. Cancel anytime.
        </p>
      </div>
    </div>
  );
}
