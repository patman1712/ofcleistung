import React, { useEffect, useState } from 'react';
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
import PlayerDashboard from './pages/player/Dashboard';
import PlayerDailyForm from './pages/player/DailyForm';
import PlayerTrainingForm from './pages/player/TrainingForm';
import PlayerProfile from './pages/player/Profile';
import api from './lib/api';

function ProtectedRoute({
  children,
  roles,
}: {
  children: React.ReactNode;
  roles?: ('ADMIN' | 'PLAYER')[];
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
  if (roles && !roles.includes(user.role)) {
    if (user.role === 'ADMIN') return <Navigate to="/admin" replace />;
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
        if (!dailyRes.data.answered && dailyRes.data.questions.length > 0) {
          setRedirect('/player/daily');
        } else if (trainingRes.data.length > 0) {
          setRedirect(`/player/training/${trainingRes.data[0].trainingPlayerId}`);
        }
      } catch (e) {
        // ignore
      } finally {
        setChecking(false);
      }
    })();
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
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        path="/admin/*"
        element={
          <ProtectedRoute roles={['ADMIN']}>
            <Layout>
              <Routes>
                <Route path="/" element={<AdminDashboard />} />
                <Route path="/players" element={<AdminPlayers />} />
                <Route path="/daily-questions" element={<AdminDailyQuestions />} />
                <Route path="/trainings" element={<AdminTrainings />} />
                <Route path="/evaluations" element={<AdminEvaluations />} />
                <Route path="/alerts" element={<AdminAlerts />} />
                <Route path="*" element={<Navigate to="/admin" replace />} />
              </Routes>
            </Layout>
          </ProtectedRoute>
        }
      />

      <Route
        path="/player/*"
        element={
          <ProtectedRoute roles={['PLAYER']}>
            <PlayerRouteGuard>
              <Layout>
                <Routes>
                  <Route path="/" element={<PlayerDashboard />} />
                  <Route path="/daily" element={<PlayerDailyForm />} />
                  <Route path="/training/:tpId" element={<PlayerTrainingForm />} />
                  <Route path="/profile" element={<PlayerProfile />} />
                  <Route path="*" element={<Navigate to="/player" replace />} />
                </Routes>
              </Layout>
            </PlayerRouteGuard>
          </ProtectedRoute>
        }
      />

      <Route
        path="*"
        element={
          <RootRedirect />
        }
      />
    </Routes>
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
  if (user.role === 'ADMIN') return <Navigate to="/admin" replace />;
  return <Navigate to="/player" replace />;
}
