import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { trpc } from '../trpc';
import { useQueryClient } from '@tanstack/react-query';

const navGroups = [
  {
    label: 'Overview',
    items: [
      { path: '/', label: 'Dashboard', icon: '📊' },
    ],
  },
  {
    label: 'Management',
    items: [
      { path: '/units', label: 'Units & Owners', icon: '🏠' },
      { path: '/invoices', label: 'Invoices', icon: '💰' },
      { path: '/violations', label: 'Violations', icon: '⚠️' },
      { path: '/maintenance', label: 'Maintenance', icon: '🔧' },
    ],
  },
  {
    label: 'Communication',
    items: [
      { path: '/announcements', label: 'Announcements', icon: '📢' },
      { path: '/documents', label: 'Documents', icon: '📄' },
    ],
  },
  {
    label: 'Tools',
    items: [
      { path: '/ai', label: 'AI Assistant', icon: '✨' },
      { path: '/settings', label: 'Settings', icon: '⚙️' },
    ],
  },
  {
    label: 'Account',
    items: [
      { path: '/pricing', label: 'Pricing', icon: '💳' },
    ],
  },
];

export function Layout({ user, children }: { user: any; children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('hoabot-theme');
    if (saved) return saved === 'dark';
    return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  const toggleDarkMode = () => {
    const next = !darkMode;
    setDarkMode(next);
    localStorage.setItem('hoabot-theme', next ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', next);
  };

  // Sync theme to DOM
  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  // Escape key closes sidebar
  useEffect(() => {
    if (!sidebarOpen) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setSidebarOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [sidebarOpen]);

  const logout = trpc.auth.logout.useMutation({
    onSuccess: () => { queryClient.clear(); window.location.href = '/app/login'; },
  });

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--bg-primary)' }}>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/30 z-30 md:hidden backdrop-blur-[2px]" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed z-40 top-0 bottom-0 w-[240px] flex flex-col transition-transform duration-200 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
        style={{
          background: 'var(--sidebar-bg)',
          borderRight: '1px solid var(--sidebar-border)',
        }}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-4 h-14" style={{ borderBottom: '1px solid var(--sidebar-border)' }}>
          <span style={{ fontFamily: 'var(--font-serif, serif)', fontSize: '17px', color: 'var(--sidebar-text-active)', letterSpacing: '-0.01em' }}>🏘️ <span style={{ color: 'var(--accent)' }}>HOA</span>Bot</span>
          <button onClick={() => setSidebarOpen(false)} className="md:hidden text-lg" style={{ color: 'var(--sidebar-text)' }}>✕</button>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-3 px-2 overflow-y-auto">
          {navGroups.map((group, gi) => (
            <div key={gi} className={gi > 0 ? 'mt-5' : ''}>
              <div className="px-2 mb-1 text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono, monospace)' }}>
                {group.label}
              </div>
              {group.items.map(item => {
                const active = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setSidebarOpen(false)}
                    className="flex items-center gap-2.5 px-2 py-[6px] rounded-[6px] text-[13px] mb-[1px] transition-all duration-100"
                    style={{
                      background: active ? 'var(--sidebar-active-bg)' : 'transparent',
                      color: active ? 'var(--sidebar-text-active)' : 'var(--sidebar-text)',
                      fontWeight: active ? 500 : 400,
                    }}
                    onMouseEnter={e => { if (!active) (e.currentTarget.style.background = 'var(--sidebar-hover-bg)'); }}
                    onMouseLeave={e => { if (!active) (e.currentTarget.style.background = 'transparent'); }}
                  >
                    <span className="text-sm w-5 text-center" style={{ opacity: active ? 1 : 0.6 }}>{item.icon}</span>
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* User */}
        <div className="px-3 py-3" style={{ borderTop: '1px solid var(--sidebar-border)' }}>
          <div className="text-[13px] font-medium" style={{ color: 'var(--sidebar-text-active)' }}>{user.name}</div>
          <div className="text-[11px] mt-0.5" style={{ color: 'var(--sidebar-text)' }}>{user.email}</div>
          <div className="flex gap-1.5 mt-2">
            <button
              onClick={() => logout.mutate()}
              className="flex-1 text-[12px] py-1.5 px-2 rounded-[5px] transition-all duration-100"
              style={{ color: 'var(--sidebar-text)', background: 'var(--sidebar-active-bg)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--sidebar-hover-bg)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'var(--sidebar-active-bg)')}
            >
              Sign Out
            </button>
            <button
              onClick={toggleDarkMode}
              className="text-[12px] py-1.5 px-2 rounded-[5px] transition-all duration-100"
              style={{ color: 'var(--sidebar-text)', background: 'var(--sidebar-active-bg)' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--sidebar-hover-bg)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'var(--sidebar-active-bg)')}
              title={darkMode ? 'Light mode' : 'Dark mode'}
            >
              {darkMode ? '☀️' : '🌙'}
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-h-screen md:ml-[240px]">
        {/* Mobile header */}
        <header
          className="md:hidden flex items-center justify-between px-4 h-12"
          style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--border)' }}
        >
          <button onClick={() => setSidebarOpen(true)} className="text-base" style={{ color: 'var(--text-primary)' }} aria-label="Open menu">☰</button>
          <span style={{ fontFamily: 'var(--font-serif, serif)', fontSize: '15px', color: 'var(--text-primary)' }}>🏘️ HOABot</span>
          <div className="w-6" />
        </header>

        <main className="flex-1 overflow-auto">
          <div className="px-4 py-5 md:px-8 md:py-6 max-w-[1100px] mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
