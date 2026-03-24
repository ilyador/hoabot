import { Routes, Route, Navigate } from 'react-router-dom';
import { trpc } from './trpc';
import { LoginPage } from './pages/LoginPage';
import { RegisterPage } from './pages/RegisterPage';
import { SetupHoaPage } from './pages/SetupHoaPage';
import { DashboardPage } from './pages/DashboardPage';
import { UnitsPage } from './pages/UnitsPage';
import { InvoicesPage } from './pages/InvoicesPage';
import { DocumentsPage } from './pages/DocumentsPage';
import { AnnouncementsPage } from './pages/AnnouncementsPage';
import { ViolationsPage } from './pages/ViolationsPage';
import { MaintenancePage } from './pages/MaintenancePage';
import { AIAssistantPage } from './pages/AIAssistantPage';
import { SettingsPage } from './pages/SettingsPage';
import { PricingPage } from './pages/PricingPage';
import { TrialExpiredPage } from './pages/TrialExpiredPage';
import { Layout } from './components/Layout';

export function App() {
  const { data: user, isLoading, error } = trpc.auth.me.useQuery(undefined, {
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="text-slate-400 text-lg">Loading...</div>
      </div>
    );
  }

  if (!user || error) {
    return (
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    );
  }

  if (!user.hoaId) {
    return (
      <Routes>
        <Route path="/setup" element={<SetupHoaPage />} />
        <Route path="*" element={<Navigate to="/setup" />} />
      </Routes>
    );
  }

  const BLOCKED_STATUSES = ['trial_expired', 'past_due', 'canceled', 'unpaid'];
  if (user.subscriptionStatus && BLOCKED_STATUSES.includes(user.subscriptionStatus)) {
    return <TrialExpiredPage user={user} status={user.subscriptionStatus} />;
  }

  return (
    <Layout user={user}>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/units" element={<UnitsPage />} />
        <Route path="/invoices" element={<InvoicesPage />} />
        <Route path="/documents" element={<DocumentsPage />} />
        <Route path="/announcements" element={<AnnouncementsPage />} />
        <Route path="/violations" element={<ViolationsPage />} />
        <Route path="/maintenance" element={<MaintenancePage />} />
        <Route path="/ai" element={<AIAssistantPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/pricing" element={<PricingPage />} />
        <Route path="*" element={<Navigate to="/" />} />
      </Routes>
    </Layout>
  );
}
