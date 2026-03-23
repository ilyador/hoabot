const shimmer = 'animate-pulse rounded';
const bar = `h-4 ${shimmer}`;
const bgMuted = { background: 'var(--border)' };

export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="card overflow-hidden">
      {/* Header */}
      <div className="flex gap-4 p-4" style={{ background: 'var(--bg-primary)' }}>
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className={`${bar} h-3`} style={{ ...bgMuted, width: `${60 + Math.random() * 80}px` }} />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4 p-4" style={{ borderTop: '1px solid var(--border-subtle)' }}>
          {Array.from({ length: cols }).map((_, c) => (
            <div key={c} className={bar} style={{ ...bgMuted, width: `${40 + Math.random() * 100}px` }} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card p-4">
          <div className={`${bar} h-3 w-20 mb-3`} style={bgMuted} />
          <div className={`${bar} h-6 w-24`} style={bgMuted} />
        </div>
      ))}
    </div>
  );
}

export function FormSkeleton({ fields = 4 }: { fields?: number }) {
  return (
    <div className="card p-5">
      <div className={`${bar} h-5 w-40 mb-6`} style={bgMuted} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: fields }).map((_, i) => (
          <div key={i}>
            <div className={`${bar} h-3 w-20 mb-2`} style={bgMuted} />
            <div className={`${bar} h-9 w-full`} style={bgMuted} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div>
      <div className="flex justify-between mb-6">
        <div className={`${bar} h-7 w-48`} style={bgMuted} />
        <div className={`${bar} h-9 w-28`} style={bgMuted} />
      </div>
      <CardSkeleton count={4} />
      <div className="mt-6">
        <TableSkeleton />
      </div>
    </div>
  );
}
