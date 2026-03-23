import { trpc } from '../trpc';
import { Link } from 'react-router-dom';
import { CardSkeleton } from '../components/LoadingSkeleton';
import { formatCurrency } from '../lib/format';

function StatCard({ label, value, color, subtitle }: { label: string; value: string | number; color?: string; subtitle?: string }) {
  return (
    <div className="card p-4">
      <div className="text-[12px] font-medium" style={{ color: 'var(--text-tertiary)' }}>{label}</div>
      <div className={`text-[22px] font-semibold mt-1 tracking-tight ${color || ''}`} style={color ? {} : { color: 'var(--text-primary)' }}>
        {value}
      </div>
      {subtitle && <div className="text-[12px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{subtitle}</div>}
    </div>
  );
}

function CollectionBar({ paid, pending, overdue }: { paid: number; pending: number; overdue: number }) {
  const total = paid + pending + overdue;
  if (total === 0) return null;
  const paidPct = (paid / total) * 100;
  const pendingPct = (pending / total) * 100;
  const overduePct = (overdue / total) * 100;

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[12px] font-medium" style={{ color: 'var(--text-tertiary)' }}>Collection Status</span>
        <span className="text-[15px] font-semibold" style={{ color: 'var(--success)' }}>{paidPct.toFixed(0)}%</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden flex" style={{ background: 'var(--border)' }}>
        {paidPct > 0 && <div className="transition-all" style={{ width: `${paidPct}%`, background: 'var(--success)' }} />}
        {pendingPct > 0 && <div className="transition-all" style={{ width: `${pendingPct}%`, background: 'var(--warning)' }} />}
        {overduePct > 0 && <div className="transition-all" style={{ width: `${overduePct}%`, background: 'var(--error)' }} />}
      </div>
      <div className="flex gap-4 mt-2 text-[11px]" style={{ color: 'var(--text-tertiary)' }}>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--success)' }} />Paid ({paid})</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--warning)' }} />Pending ({pending})</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--error)' }} />Overdue ({overdue})</span>
      </div>
    </div>
  );
}

function Checklist({ dashboard }: { dashboard: any }) {
  const items = [
    { label: 'Create your HOA', done: true, link: '/settings' },
    { label: 'Add units & owners', done: dashboard.totalUnits > 0, link: '/units' },
    { label: 'Configure monthly dues', done: dashboard.totalInvoices > 0, link: '/units' },
    { label: 'Generate invoices', done: dashboard.totalInvoices > 0, link: '/invoices' },
    { label: 'Upload governing documents', done: dashboard.totalDocuments > 0, link: '/documents' },
    { label: 'Try the AI Assistant', done: dashboard.totalChatMessages > 0, link: '/ai' },
  ];
  const completed = items.filter(i => i.done).length;
  if (completed === items.length) return null;

  return (
    <div className="card p-4 mb-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[15px] font-semibold" style={{ color: 'var(--text-primary)' }}>Getting Started</h2>
        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full" style={{ background: 'var(--accent-muted)', color: 'var(--accent)' }}>
          {completed}/{items.length}
        </span>
      </div>
      <div className="space-y-0.5">
        {items.map((item, i) => (
          <Link key={i} to={item.link}
            className={`flex items-center gap-2.5 px-2 py-1.5 rounded-[6px] text-[13px] transition-all duration-100 ${item.done ? 'opacity-50' : ''}`}
            style={{ color: 'var(--text-primary)' }}
            onMouseEnter={e => !item.done && (e.currentTarget.style.background = 'var(--accent-muted)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
          >
            <span className={`w-[18px] h-[18px] rounded-full flex items-center justify-center text-[10px] border-[1.5px] flex-shrink-0 ${
              item.done ? 'text-white' : ''
            }`} style={{
              background: item.done ? 'var(--success)' : 'transparent',
              borderColor: item.done ? 'var(--success)' : 'var(--border)',
            }}>
              {item.done ? '✓' : ''}
            </span>
            <span className={item.done ? 'line-through' : ''}>{item.label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function DashboardPage() {
  const { data: dashboard, isLoading } = trpc.hoa.dashboard.useQuery();
  const { data: hoa } = trpc.hoa.get.useQuery();

  if (isLoading) {
    return (
      <div>
        <div className="mb-6">
          <div className="h-7 w-48 animate-pulse rounded" style={{ background: 'var(--border)' }} />
        </div>
        <CardSkeleton count={4} />
        <div className="mt-5">
          <CardSkeleton count={3} />
        </div>
      </div>
    );
  }

  if (!dashboard) return <div style={{ color: 'var(--text-tertiary)' }}>No data</div>;

  return (
    <div>
      <div className="mb-6">
        <h1>{hoa?.name || 'Dashboard'}</h1>
        {hoa?.address && <p className="text-[13px] mt-1" style={{ color: 'var(--text-secondary)' }}>{hoa.address}</p>}
      </div>

      <Checklist dashboard={dashboard} />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <StatCard label="Total Units" value={dashboard.totalUnits} subtitle={`${dashboard.totalUnits} properties`} />
        <StatCard label="Collected" value={formatCurrency(dashboard.totalCollected)} color="text-green-600 dark:text-green-400" />
        <StatCard label="Outstanding" value={formatCurrency(dashboard.totalOutstanding)} color="text-amber-600 dark:text-amber-400" />
        <StatCard label="Overdue" value={dashboard.overdueInvoices} color={dashboard.overdueInvoices > 0 ? 'text-red-600 dark:text-red-400' : ''} subtitle={dashboard.overdueInvoices === 0 ? 'All clear' : 'Needs attention'} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-5">
        <div className="lg:col-span-2">
          <CollectionBar paid={dashboard.paidInvoices} pending={dashboard.pendingInvoices} overdue={dashboard.overdueInvoices} />
        </div>
        <div className="grid grid-cols-3 lg:grid-cols-1 gap-3">
          <StatCard label="Paid" value={dashboard.paidInvoices} color="text-green-600 dark:text-green-400" />
          <StatCard label="Violations" value={dashboard.openViolations} color={dashboard.openViolations > 0 ? 'text-amber-600 dark:text-amber-400' : ''} />
          <StatCard label="Maintenance" value={dashboard.openMaintenance} />
        </div>
      </div>

      {dashboard.recentAnnouncements.length > 0 && (
        <div className="card p-4">
          <h2 className="text-[15px] font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>Recent Announcements</h2>
          {dashboard.recentAnnouncements.map((ann: any, i: number) => (
            <div key={ann.id} className={i > 0 ? 'mt-3 pt-3' : ''} style={i > 0 ? { borderTop: '1px solid var(--border-subtle)' } : {}}>
              <div className="text-[14px] font-medium" style={{ color: 'var(--text-primary)' }}>{ann.title}</div>
              <div className="text-[13px] mt-1 line-clamp-2" style={{ color: 'var(--text-secondary)' }}>{ann.body}</div>
              <div className="text-[11px] mt-1" style={{ color: 'var(--text-tertiary)' }}>{new Date(ann.createdAt).toLocaleDateString()}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
