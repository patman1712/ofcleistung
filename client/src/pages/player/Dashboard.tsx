import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../lib/api';

export default function PlayerDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState({
    dailyAnsweredToday: false,
    completedTodayAt: null as string | null,
    pendingTrainings: [] as any[],
    last7Avg: null as number | null,
    history: [] as any[],
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [dailyRes, trainRes] = await Promise.all([
          api.get('/daily-questions/status/today'),
          api.get('/trainings/open/pending'),
        ]);
        const dd = dailyRes?.data || {};
        const td = Array.isArray(trainRes?.data) ? trainRes.data : [];
        if (!cancelled) {
          setStats({
            dailyAnsweredToday: !!dd.answered,
            completedTodayAt: typeof dd.completedAt === 'string' ? dd.completedAt : null,
            pendingTrainings: td,
            last7Avg: null,
            history: [],
          });
        }
      } catch (e: any) {
        if (!cancelled) {
          setStats({
            dailyAnsweredToday: false,
            completedTodayAt: null,
            pendingTrainings: [],
            last7Avg: null,
            history: [],
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-br from-ofc-red to-ofc-redDark rounded-3xl p-6 md:p-8 text-white shadow-card relative overflow-hidden">
        <div className="absolute right-0 top-0 h-48 w-48 -mr-16 -mt-16 rounded-full bg-white/10"></div>
        <div className="absolute right-10 bottom-0 h-32 w-32 -mb-10 rounded-full bg-white/5"></div>
        <div className="relative">
          <div className="text-sm text-white/80">Hallo 👋</div>
          <h2 className="text-3xl md:text-4xl font-bold mt-1">{user?.name}</h2>
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
            <div className="bg-white/15 backdrop-blur rounded-2xl p-4">
              <div className="text-xs text-white/80 uppercase tracking-wide">Tägliche Abfrage heute</div>
              <div className="text-2xl font-bold mt-1">
                {loading ? '...' : stats.dailyAnsweredToday ? '✅ erledigt' : '⏳ offen'}
              </div>
              {stats.completedTodayAt && (
                <div className="text-xs text-white/80 mt-1">
                  vor {Math.round((Date.now() - new Date(stats.completedTodayAt).getTime()) / 60000)} Min.
                </div>
              )}
            </div>
            <div className="bg-white/15 backdrop-blur rounded-2xl p-4">
              <div className="text-xs text-white/80 uppercase tracking-wide">Offene Trainings-Fragen</div>
              <div className="text-2xl font-bold mt-1">{loading ? '...' : stats.pendingTrainings.length}</div>
            </div>
            <div className="bg-white/15 backdrop-blur rounded-2xl p-4">
              <div className="text-xs text-white/80 uppercase tracking-wide">Meine Position</div>
              <div className="text-2xl font-bold mt-1">
                {user?.playerProfile?.position || '–'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {!loading && !stats.dailyAnsweredToday && (
        <Link to="/player/daily" className="block">
          <div className="card border-ofc-red hover:shadow-lg transition-shadow cursor-pointer">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-4">
                <div className="h-14 w-14 rounded-2xl bg-ofc-red text-white flex items-center justify-center text-2xl">🌅</div>
                <div>
                  <h3 className="text-lg font-semibold">Tägliche Abfrage ist offen</h3>
                  <p className="text-gray-500 text-sm mt-1">
                    Beantworte jetzt die Fragen deines Trainers zu Schlaf, Wohlbefinden und Co.
                  </p>
                </div>
              </div>
              <span className="btn-primary">Jetzt ausfüllen →</span>
            </div>
          </div>
        </Link>
      )}

      {!loading && stats.pendingTrainings.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-xl font-bold text-ofc-grayDark">
            🎯 Ausstehende Trainings-Fragen ({stats.pendingTrainings.length})
          </h3>
          {stats.pendingTrainings.map((tp) => (
            <Link key={tp.trainingPlayerId} to={`/player/training/${tp.trainingPlayerId}`}>
              <div className="card hover:shadow-lg transition-shadow cursor-pointer">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div className="flex items-center gap-4">
                    <div className="h-14 w-14 rounded-2xl bg-ofc-red/10 text-ofc-red flex items-center justify-center text-2xl">⚽</div>
                    <div>
                      <h4 className="font-semibold">{tp.title}</h4>
                      <p className="text-gray-500 text-sm mt-1">
                        {new Date(tp.scheduledAt).toLocaleString('de-DE')}
                      </p>
                    </div>
                  </div>
                  <span className="btn-primary">Ausfüllen →</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {loading ? (
        <div className="card text-gray-400">Lädt...</div>
      ) : (
        stats.dailyAnsweredToday && stats.pendingTrainings.length === 0 && (
          <div className="card text-center py-12">
            <div className="text-6xl mb-4">💪</div>
            <h3 className="text-2xl font-bold text-green-700 mb-2">Alles erledigt!</h3>
            <p className="text-gray-500">
              Du hast alle heutigen Abfragen abgeschlossen. Toll gemacht.
            </p>
            <div className="mt-6 flex gap-3 justify-center flex-wrap">
              <Link to="/player/daily" className="btn-secondary">Tägliche Abfrage erneut ansehen</Link>
              <Link to="/player/profile" className="btn-secondary">Mein Profil</Link>
            </div>
          </div>
        )
      )}
    </div>
  );
}
