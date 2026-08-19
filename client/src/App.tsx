import React, { useEffect, useState, Component, ReactNode } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import AdminDashboard from './pages/admin/Dashboard';
import AdminPlayers from './pages/admin/Players';
import AdminDailyQuestions from './pages/admin/DailyQuestions';
import AdminTrainings from './pages/admin/Trainings';
import AdminEvaluations from './pages/admin/Evaluations';
import AdminAlerts from './pages/admin/Alerts';
import AdminSettings from './pages/admin/Settings';
import PlayerDashboard from './pages/player/Dashboard';
import PlayerDailyForm from './pages/player/DailyForm';
import PlayerTrainingForm from './pages/player/TrainingForm';
import PlayerProfile from './pages/player/Profile';
import api from './lib/api';

export type AppRole = 'ADMIN' | 'STAFF' | 'PLAYER';

// ---------------- ERROR BOUNDARY (verhindert White Screen bei uncaught React Errors) ----------------
class ErrorBoundary extends Component<{ children: ReactNode; pageKey?: string }, { hasError: boolean; error: string }> {
  state = { hasError: false, error: '' };
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error: error?.message || String(error).slice(0, 500) };
  }
  componentDidCatch(error: any, info: any) {
    console.error('[ErrorBoundary] Uncaught React Error:', error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
          <div className="w-full max-w-lg bg-white border-2 border-ofc-red rounded-2xl p-8 shadow-lg">
            <div className="text-6xl mb-4 text-center">⚠️</div>
            <h1 className="text-2xl font-bold text-ofc-red mb-2 text-center">Ups! Etwas ist schiefgelaufen</h1>
            <p className="text-gray-600 mb-4 text-center">
              Es ist ein unerwarteter Fehler aufgetreten. Bitte lade die Seite neu.
            </p>
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-6 text-xs font-mono break-all text-red-800 max-h-48 overflow-y-auto">
              {this.state.error || 'Unbekannter Fehler'}
            </div>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => { this.setState({ hasError: false, error: '' }); window.location.reload(); }}
                className="bg-ofc-red hover:bg-ofc-redDark text-white font-semibold px-6 py-3 rounded-lg transition-colors"
              >
                🔄 Seite neu laden
              </button>
              <button
                onClick={() => this.setState({ hasError: false, error: '' })}
                className="bg-gray-100 hover:bg-gray-200 text-gray-800 font-semibold px-6 py-3 rounded-lg transition-colors"
              >
                ✖️ Fehler schließen
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function ProtectedRoute({
  children,
  roles,
}: {
  children: React.ReactNode;
  roles?: AppRole[];
}) {
  const { user, loading } = useAuth();
  const loc = useLocation();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin h-12 w-12 border-4 border-ofc-red border-t-transparent rounded-full"></div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace state={{ from: loc }} />;
  if (roles && !roles.includes(user.role as AppRole)) {
    if (user.role === 'ADMIN' || user.role === 'STAFF') return <Navigate to="/admin" replace />;
    return <Navigate to="/player" replace />;
  }
  return <>{children}</>;
}

function PlayerRouteGuard({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  const [checking, setChecking] = useState(true);
  const [redirect, setRedirect] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!user || user.role !== 'PLAYER') {
      setChecking(false);
      return;
    }
    const skip =
      location.pathname === '/player/daily' ||
      location.pathname.startsWith('/player/training/');
    if (skip) {
      setChecking(false);
      return;
    }

    (async () => {
      try {
        const [dailyRes, trainingRes] = await Promise.all([
          api.get('/daily-questions/status/today'),
          api.get('/trainings/open/pending'),
        ]);
        if (cancelled) return;
        const dailyData = dailyRes?.data || {};
        const trainData = Array.isArray(trainingRes?.data) ? trainingRes.data : [];
        if (!dailyData.answered && Array.isArray(dailyData.questions) && dailyData.questions.length > 0) {
          setRedirect('/player/daily');
        } else if (trainData.length > 0 && trainData[0]?.trainingPlayerId) {
          setRedirect(`/player/training/${trainData[0].trainingPlayerId}`);
        }
      } catch (e: any) {
        // Leiser Fehler: Nicht aufhängen, User kann normal weiter navigieren
        console.warn('[PlayerRouteGuard] Check fehlgeschlagen (ignoriert):', e?.message || e);
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();

    return () => { cancelled = true; };
  }, [user, location.pathname]);

  if (checking) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin h-12 w-12 border-4 border-ofc-red border-t-transparent rounded-full"></div>
      </div>
    );
  }
  if (redirect) return <Navigate to={redirect} replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <ErrorBoundary pageKey="app-root">
      <Routes>
        <Route
          path="/login"
          element={
            <ErrorBoundary pageKey="login"><Login /></ErrorBoundary>
          }
        />

        {/* ADMIN + STAFF ROUTES */}
        <Route
          path="/admin"
          element={
            <ProtectedRoute roles={['ADMIN', 'STAFF']}>
              <Layout>
                <ErrorBoundary pageKey="admin-dashboard"><AdminDashboard /></ErrorBoundary>
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/players"
          element={
            <ProtectedRoute roles={['ADMIN']}>
              <Layout>
                <ErrorBoundary pageKey="admin-players"><AdminPlayers /></ErrorBoundary>
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/daily-questions"
          element={
            <ProtectedRoute roles={['ADMIN', 'STAFF']}>
              <Layout>
                <ErrorBoundary pageKey="admin-daily"><AdminDailyQuestions /></ErrorBoundary>
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/trainings"
          element={
            <ProtectedRoute roles={['ADMIN', 'STAFF']}>
              <Layout>
                <ErrorBoundary pageKey="admin-trainings"><AdminTrainings /></ErrorBoundary>
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/evaluations"
          element={
            <ProtectedRoute roles={['ADMIN', 'STAFF']}>
              <Layout>
                <ErrorBoundary pageKey="admin-evaluations"><AdminEvaluations /></ErrorBoundary>
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/alerts"
          element={
            <ProtectedRoute roles={['ADMIN', 'STAFF']}>
              <Layout>
                <ErrorBoundary pageKey="admin-alerts"><AdminAlerts /></ErrorBoundary>
              </Layout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admin/settings"
          element={
            <ProtectedRoute roles={['ADMIN']}>
              <Layout>
                <ErrorBoundary pageKey="admin-settings"><AdminSettings /></ErrorBoundary>
              </Layout>
            </ProtectedRoute>
          }
        />

        {/* PLAYER ROUTES */}
        <Route
          path="/player"
          element={
            <ProtectedRoute roles={['PLAYER']}>
              <PlayerRouteGuard>
                <Layout>
                  <ErrorBoundary pageKey="player-dashboard"><PlayerDashboard /></ErrorBoundary>
                </Layout>
              </PlayerRouteGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path="/player/daily"
          element={
            <ProtectedRoute roles={['PLAYER']}>
              <PlayerRouteGuard>
                <Layout>
                  <ErrorBoundary pageKey="player-daily"><PlayerDailyForm /></ErrorBoundary>
                </Layout>
              </PlayerRouteGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path="/player/training/:tpId"
          element={
            <ProtectedRoute roles={['PLAYER']}>
              <PlayerRouteGuard>
                <Layout>
                  <ErrorBoundary pageKey="player-training"><PlayerTrainingForm /></ErrorBoundary>
                </Layout>
              </PlayerRouteGuard>
            </ProtectedRoute>
          }
        />
        <Route
          path="/player/profile"
          element={
            <ProtectedRoute roles={['PLAYER']}>
              <PlayerRouteGuard>
                <Layout>
                  <ErrorBoundary pageKey="player-profile"><PlayerProfile /></ErrorBoundary>
                </Layout>
              </PlayerRouteGuard>
            </ProtectedRoute>
          }
        />

        <Route
          path="*"
          element={
            <ErrorBoundary pageKey="root-redirect">
              <RootRedirect />
            </ErrorBoundary>
          }
        />
      </Routes>
    </ErrorBoundary>
  );
}

function RootRedirect() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-spin h-12 w-12 border-4 border-ofc-red border-t-transparent rounded-full"></div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'ADMIN' || user.role === 'STAFF') return <Navigate to="/admin" replace />;
  return <Navigate to="/player" replace />;
}
