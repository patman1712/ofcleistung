import React, { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import api from '../../lib/api';

interface OverviewItem {
  player: any;
  avgDailyLast7Days: number | null;
  activeAlerts: number;
  lastDailyCompletedAt: string | null;
  todayCompletedAt: string | null;
  completedToday: boolean;
  todayDailyAnswers: Array<{
    id: string;
    rating: number | null;
    text: string | null;
    question: {
      id: string;
      text: string;
      questionType: 'RATING_1_10' | 'RATING' | 'TEXT';
      minRating?: number | null;
      maxRating?: number | null;
    };
  }>;
}

export default function AdminDashboard() {
  const nav = useNavigate();
  const [data, setData] = useState<OverviewItem[]>([]);
  const [openAlerts, setOpenAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  const toggleExpand = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setExpandedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const openPlayer = useCallback(
    (id: string) => {
      nav(`/admin/evaluations?playerId=${encodeURIComponent(id)}`);
    },
    [nav],
  );

  const load = async () => {
    setLoading(true);
    const [ov, al] = await Promise.all([
      api.get('/evaluations/overview'),
      api.get('/alerts/open'),
    ]);
    setData(ov.data);
    setOpenAlerts(al.data);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const statCards = [
    { label: 'Spieler gesamt', value: data.length, color: 'ofc-red' },
    {
      label: 'Offene Warnsignale',
      value: openAlerts.length,
      color: openAlerts.length > 0 ? 'ofc-red' : 'green-600',
    },
    {
      label: 'Heute schon geantwortet',
      value: data.filter((d) => d.completedToday).length,
      color: 'ofc-red',
    },
  ];

  const isRatingQ = (q: OverviewItem['todayDailyAnswers'][number]['question']) =>
    q.questionType === 'RATING' || q.questionType === 'RATING_1_10';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-ofc-grayDark">Dashboard</h2>
        <p className="text-gray-500 mt-1">
          Übersicht über Spieler, Antworten und Warnsignale
        </p>
        <p className="text-xs text-gray-400 mt-1">
          💡 Tipp: Spieler klicken für Details · Pfeil ▾ für heutige Antworten direkt
          hier
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {statCards.map((c) => (
          <div key={c.label} className="card">
            <div className="text-sm text-gray-500">{c.label}</div>
            <div
              className={`text-4xl font-bold mt-2 text-${c.color}`}
              style={{
                color:
                  c.color === 'ofc-red'
                    ? '#E30613'
                    : c.color === 'green-600'
                    ? '#16a34a'
                    : '#E30613',
              }}
            >
              {loading ? '...' : c.value}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Spielerübersicht</h3>
            <Link to="/admin/players" className="btn-secondary text-sm">
              Spieler verwalten →
            </Link>
          </div>
          {loading ? (
            <div className="text-gray-400">Lädt...</div>
          ) : data.length === 0 ? (
            <div className="text-gray-500 text-sm">Noch keine Spieler angelegt.</div>
          ) : (
            <div className="overflow-x-auto -mx-6 -my-2">
              <table className="min-w-full">
                <thead className="bg-ofc-gray text-xs uppercase text-gray-600">
                  <tr>
                    <th className="px-6 py-2 text-left w-8"></th>
                    <th className="px-6 py-2 text-left">Spieler</th>
                    <th className="px-6 py-2 text-left">Position</th>
                    <th className="px-6 py-2 text-left">Ø 7 Tage</th>
                    <th className="px-6 py-2 text-left">Letzte Antwort</th>
                    <th className="px-6 py-2 text-left">Warnungen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm">
                  {data.map((d) => {
                    const expanded = !!expandedIds[d.player.id];
                    return (
                      <React.Fragment key={d.player.id}>
                        <tr
                          onClick={() => openPlayer(d.player.id)}
                          className={`cursor-pointer transition-colors ${
                            expanded ? 'bg-ofc-gray/60' : 'hover:bg-ofc-gray/40'
                          }`}
                        >
                          <td className="px-6 py-3">
                            <button
                              onClick={(e) => toggleExpand(e, d.player.id)}
                              className="w-7 h-7 inline-flex items-center justify-center rounded-md border border-gray-200 hover:border-ofc-red hover:text-ofc-red transition text-gray-500"
                              title={
                                expanded
                                  ? 'Antworten einklappen'
                                  : 'Heutige Antworten anzeigen'
                              }
                            >
                              {expanded ? '▾' : '▸'}
                            </button>
                          </td>
                          <td className="px-6 py-3 font-medium">
                            <span className="underline decoration-dotted decoration-gray-400 hover:text-ofc-red hover:decoration-ofc-red">
                              {d.player.name}
                            </span>
                          </td>
                          <td className="px-6 py-3 text-gray-500">
                            {d.player.playerProfile?.position || '–'}
                          </td>
                          <td className="px-6 py-3">
                            {d.avgDailyLast7Days != null ? (
                              <span
                                className={`font-semibold ${
                                  d.avgDailyLast7Days <= 4
                                    ? 'text-ofc-red'
                                    : d.avgDailyLast7Days >= 7
                                    ? 'text-green-600'
                                    : 'text-gray-700'
                                }`}
                              >
                                {d.avgDailyLast7Days}
                              </span>
                            ) : (
                              <span className="text-gray-400">–</span>
                            )}
                          </td>
                          <td className="px-6 py-3 text-gray-500">
                            {d.lastDailyCompletedAt
                              ? new Date(d.lastDailyCompletedAt).toLocaleDateString(
                                  'de-DE',
                                )
                              : 'Nie'}
                          </td>
                          <td className="px-6 py-3">
                            {d.activeAlerts > 0 ? (
                              <span className="badge-red">{d.activeAlerts} offen</span>
                            ) : (
                              <span className="text-gray-400">0</span>
                            )}
                          </td>
                        </tr>
                        {expanded ? (
                          <tr>
                            <td colSpan={6} className="px-6 py-4 bg-white/40">
                              {!d.completedToday ||
                              d.todayDailyAnswers?.length === 0 ? (
                                <div className="p-4 rounded-lg border border-dashed border-gray-300 text-center text-sm text-gray-500">
                                  {d.completedToday
                                    ? 'Heute keine Antworten vorhanden (selten)'
                                    : '🔔 Spieler hat den heutigen Fragebogen NOCH NICHT ausgefüllt.'}
                                </div>
                              ) : (
                                <div className="space-y-2 pl-8">
                                  <div className="text-xs font-semibold text-gray-500 uppercase mb-2">
                                    📅 Antworten vom{' '}
                                    {d.todayCompletedAt
                                      ? new Date(d.todayCompletedAt).toLocaleDateString(
                                          'de-DE',
                                        )
                                      : 'heute'}
                                    :
                                  </div>
                                  {d.todayDailyAnswers.map((a) => {
                                    const ratingQ = isRatingQ(a.question);
                                    const minR = a.question.minRating ?? 1;
                                    const redBelow = minR > 1 ? minR : 5;
                                    const isRed =
                                      a.rating != null && a.rating < redBelow;
                                    const isGreen =
                                      a.rating != null && a.rating >= 8;
                                    return (
                                      <div
                                        key={a.id}
                                        className="bg-white p-3 rounded-lg border border-gray-100 shadow-sm"
                                      >
                                        <div className="text-sm font-medium text-gray-700">
                                          {a.question.text}
                                        </div>
                                        <div className="mt-1 text-sm">
                                          {ratingQ ? (
                                            a.rating != null ? (
                                              <span
                                                className={`font-semibold ${
                                                  isRed
                                                    ? 'text-ofc-red'
                                                    : isGreen
                                                    ? 'text-green-600'
                                                    : ''
                                                }`}
                                              >
                                                Bewertung: {a.rating}
                                                <span className="text-gray-400 text-xs ml-2">
                                                  {' '}
                                                  (Skala {a.question.minRating ?? 1} –{' '}
                                                  {a.question.maxRating ?? 10})
                                                </span>
                                              </span>
                                            ) : (
                                              <span className="text-ofc-red italic font-semibold">
                                                ⚠️ KEINE Bewertung
                                              </span>
                                            )
                                          ) : (
                                            <div className="whitespace-pre-wrap text-gray-800">
                                              {a.text || (
                                                <em className="text-gray-400">(leer)</em>
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </td>
                          </tr>
                        ) : null}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold">Aktuelle Warnsignale</h3>
            <Link to="/admin/alerts" className="btn-secondary text-sm">
              Alle →
            </Link>
          </div>
          {openAlerts.length === 0 ? (
            <div className="text-green-700 text-sm py-2">
              ✓ Keine offenen Warnsignale
            </div>
          ) : (
            <ul className="space-y-3">
              {openAlerts.slice(0, 6).map((a) => (
                <li
                  key={a.id}
                  className="flex items-start gap-3 p-3 rounded-lg border border-ofc-red/20 bg-ofc-red/5"
                >
                  <div className="text-ofc-red text-lg">⚠</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate">
                      {a.playerProfile?.user?.name || '?'}
                    </div>
                    <div className="text-xs text-gray-600 truncate">{a.message}</div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {new Date(a.createdAt).toLocaleDateString('de-DE')}
                    </div>
                  </div>
                  {a.severity === 'CRITICAL' && (
                    <span className="badge-red">KRITISCH</span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
