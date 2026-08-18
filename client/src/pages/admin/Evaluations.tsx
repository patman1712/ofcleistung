import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../../lib/api';

interface Detail {
  user: any;
  dailySessions: any[];
  trainingAnswers: any[];
  alerts: any[];
}

export default function AdminEvaluations() {
  const { playerId } = useParams();
  const nav = useNavigate();
  const [players, setPlayers] = useState<any[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(playerId || null);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const res = await api.get('/players');
      setPlayers(res.data);
      setLoading(false);
      if (selectedId) await loadDetail(selectedId);
    })();
  }, []);

  const loadDetail = async (id: string) => {
    setLoadingDetail(true);
    try {
      const res = await api.get(`/evaluations/player/${id}`);
      setDetail(res.data);
    } catch {
      setDetail(null);
    }
    setLoadingDetail(false);
  };

  const select = (id: string) => {
    setSelectedId(id);
    nav(`/admin/evaluations`, { replace: true });
    loadDetail(id);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-ofc-grayDark">Auswertungen</h2>
        <p className="text-gray-500 mt-1">
          Detaillierte Einsicht in die Antworten jedes Spielers (Täglich + Training).
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="card">
          <h3 className="font-semibold mb-3">Spieler wählen</h3>
          {loading ? (
            <div className="text-gray-400 text-sm">Lädt...</div>
          ) : players.length === 0 ? (
            <div className="text-gray-500 text-sm">Keine Spieler.</div>
          ) : (
            <ul className="space-y-1 -mx-3">
              {players.map((p) => (
                <li key={p.id}>
                  <button
                    onClick={() => select(p.id)}
                    className={`w-full text-left px-3 py-2 rounded-lg transition-colors text-sm ${
                      selectedId === p.id
                        ? 'bg-ofc-red text-white font-semibold'
                        : 'hover:bg-ofc-gray'
                    }`}
                  >
                    <div>{p.name}</div>
                    <div className={`text-xs ${selectedId === p.id ? 'text-white/80' : 'text-gray-500'}`}>
                      {p.playerProfile?.position || 'Keine Position'}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="lg:col-span-3">
          {!selectedId ? (
            <div className="card text-center py-16">
              <div className="text-ofc-red text-5xl mb-4">📊</div>
              <h3 className="text-xl font-semibold mb-2">Spieler auswählen</h3>
              <p className="text-gray-500">Wähle links einen Spieler zur Detailauswertung.</p>
            </div>
          ) : loadingDetail ? (
            <div className="card text-gray-400">Lädt Auswertung...</div>
          ) : detail ? (
            <DetailView detail={detail} />
          ) : (
            <div className="card text-ofc-red">Keine Daten gefunden.</div>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailView({ detail }: { detail: Detail }) {
  const { user, dailySessions, trainingAnswers, alerts } = detail;
  const pp = user.playerProfile;

  const allDailyRatings = dailySessions.flatMap((s) =>
    s.answers.filter((a: any) => a.rating != null).map((a: any) => a.rating as number),
  );
  const avgDaily =
    allDailyRatings.length > 0
      ? (allDailyRatings.reduce((a, b) => a + b, 0) / allDailyRatings.length).toFixed(1)
      : null;

  const allTrainingRatings = trainingAnswers
    .filter((a) => a.rating != null)
    .map((a) => a.rating as number);
  const avgTraining =
    allTrainingRatings.length > 0
      ? (allTrainingRatings.reduce((a, b) => a + b, 0) / allTrainingRatings.length).toFixed(1)
      : null;

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-xl font-bold">{user.name}</h3>
            <div className="text-sm text-gray-500 mt-1">{user.email}</div>
            <div className="flex flex-wrap gap-2 mt-3 text-sm">
              {pp?.position && <span className="badge-red">{pp.position}</span>}
              {pp?.birthDate && (
                <span className="text-gray-600">
                  🎂 {new Date(pp.birthDate).toLocaleDateString('de-DE')}
                </span>
              )}
              {pp?.heightCm && <span className="text-gray-600">📏 {pp.heightCm} cm</span>}
              {pp?.weightKg && <span className="text-gray-600">⚖ {pp.weightKg} kg</span>}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="text-center p-3 rounded-xl bg-ofc-gray">
              <div className="text-xs text-gray-500">Ø Täglich</div>
              <div className={`text-2xl font-bold ${avgDaily && +avgDaily <= 4 ? 'text-ofc-red' : avgDaily && +avgDaily >= 7 ? 'text-green-600' : 'text-gray-800'}`}>
                {avgDaily ?? '–'}
              </div>
            </div>
            <div className="text-center p-3 rounded-xl bg-ofc-gray">
              <div className="text-xs text-gray-500">Ø Training</div>
              <div className="text-2xl font-bold">{avgTraining ?? '–'}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-semibold">Aktive Warnsignale ({alerts.filter((a: any) => !a.resolved).length})</h4>
          {alerts.some((a: any) => !a.resolved) && (
            <Link to="/admin/alerts" className="text-sm text-ofc-red font-medium hover:underline">
              In Warnsignalen bearbeiten →
            </Link>
          )}
        </div>
        {alerts.length === 0 ? (
          <div className="text-sm text-green-700">✓ Keine Warnsignale vorhanden.</div>
        ) : (
          <ul className="space-y-2">
            {alerts.map((a: any) => (
              <li key={a.id} className={`flex items-center gap-3 p-3 rounded-lg text-sm ${a.resolved ? 'bg-gray-50 text-gray-500' : 'bg-ofc-red/5 border border-ofc-red/20'}`}>
                <span>{a.resolved ? '✅' : a.severity === 'CRITICAL' ? '🚨' : '⚠'}</span>
                <span className="flex-1">{a.message}</span>
                <span className="text-xs text-gray-500">
                  {new Date(a.createdAt).toLocaleDateString('de-DE')}
                </span>
                {a.resolved && <span className="badge-green">erledigt</span>}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h4 className="font-semibold mb-3">Tägliche Abfragen (letzte 30 Tage)</h4>
        {dailySessions.length === 0 ? (
          <div className="text-sm text-gray-500">Noch keine täglichen Antworten.</div>
        ) : (
          <div className="space-y-4">
            {dailySessions.map((s) => {
              const dayRatings = s.answers.filter((a: any) => a.rating != null).map((a: any) => a.rating as number);
              const avg = dayRatings.length ? (dayRatings.reduce((a, b) => a + b, 0) / dayRatings.length).toFixed(1) : null;
              return (
                <details key={s.id} className="border border-gray-200 rounded-lg p-3 bg-white open:bg-ofc-gray/30">
                  <summary className="flex items-center justify-between gap-3 cursor-pointer list-none">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="font-semibold">
                        {new Date(s.date).toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' })}
                      </span>
                      {s.completedAt ? (
                        <span className="badge-green">beantwortet</span>
                      ) : (
                        <span className="badge-warning">offen</span>
                      )}
                      {avg != null && (
                        <span className={`font-semibold ${+avg <= 4 ? 'text-ofc-red' : +avg >= 7 ? 'text-green-600' : 'text-gray-700'}`}>
                          Ø {avg}
                        </span>
                      )}
                    </div>
                    <span className="text-xs text-gray-500">Details ▾</span>
                  </summary>
                  <div className="mt-3 space-y-3 pl-2">
                    {s.answers.map((a: any) => (
                      <div key={a.id} className="bg-white p-3 rounded-lg border border-gray-100">
                        <div className="text-sm font-medium text-gray-700">{a.question.text}</div>
                        <div className="mt-1 text-sm">
                          {a.question.questionType === 'RATING_1_10' ? (
                            <span className={`font-semibold ${a.rating != null && a.rating <= 4 ? 'text-ofc-red' : a.rating != null && a.rating >= 8 ? 'text-green-600' : ''}`}>
                              Bewertung: {a.rating ?? '–'}
                            </span>
                          ) : (
                            <div className="whitespace-pre-wrap text-gray-800">
                              {a.text || <em className="text-gray-400">(leer)</em>}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </div>

      <div className="card">
        <h4 className="font-semibold mb-3">Trainings-Antworten (letzte 100 Einträge)</h4>
        {trainingAnswers.length === 0 ? (
          <div className="text-sm text-gray-500">Noch keine Trainings-Antworten.</div>
        ) : (
          <div className="divide-y divide-gray-100 -mx-6">
            {trainingAnswers.map((a: any) => (
              <div key={a.id} className="px-6 py-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="text-sm font-medium">{a.question.text}</div>
                  <div className="text-xs text-gray-500">
                    {a.trainingPlayer?.training?.title} ·{' '}
                    {a.trainingPlayer?.training?.scheduledAt
                      ? new Date(a.trainingPlayer.training.scheduledAt).toLocaleDateString('de-DE')
                      : ''}
                  </div>
                </div>
                <div className="mt-1 text-sm">
                  {a.question.questionType === 'RATING_1_10' ? (
                    <span className={`font-semibold ${a.rating != null && a.rating <= 4 ? 'text-ofc-red' : a.rating != null && a.rating >= 8 ? 'text-green-600' : ''}`}>
                      {a.rating ?? '–'}
                    </span>
                  ) : (
                    <div className="whitespace-pre-wrap text-gray-800">
                      {a.text || <em className="text-gray-400">(leer)</em>}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
