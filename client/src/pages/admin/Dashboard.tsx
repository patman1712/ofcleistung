import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../lib/api';

interface OverviewItem {
  player: any;
  avgDailyLast7Days: number | null;
  activeAlerts: number;
  lastDailyCompletedAt: string | null;
}

export default function AdminDashboard() {
  const [data, setData] = useState<OverviewItem[]>([]);
  const [openAlerts, setOpenAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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
      value: data.filter((d) => d.lastDailyCompletedAt).length,
      color: 'ofc-red',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-ofc-grayDark">Dashboard</h2>
        <p className="text-gray-500 mt-1">Übersicht über Spieler, Antworten und Warnsignale</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {statCards.map((c) => (
          <div key={c.label} className="card">
            <div className="text-sm text-gray-500">{c.label}</div>
            <div className={`text-4xl font-bold mt-2 text-${c.color}`} style={{ color: c.color === 'ofc-red' ? '#E30613' : c.color === 'green-600' ? '#16a34a' : '#E30613' }}>
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
                    <th className="px-6 py-2 text-left">Spieler</th>
                    <th className="px-6 py-2 text-left">Position</th>
                    <th className="px-6 py-2 text-left">Ø 7 Tage</th>
                    <th className="px-6 py-2 text-left">Letzte Antwort</th>
                    <th className="px-6 py-2 text-left">Warnungen</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm">
                  {data.map((d) => (
                  <tr key={d.player.id}>
                    <td className="px-6 py-3 font-medium">{d.player.name}</td>
                    <td className="px-6 py-3 text-gray-500">{d.player.playerProfile?.position || '–'}</td>
                    <td className="px-6 py-3">
                      {d.avgDailyLast7Days != null ? (
                        <span className={`font-semibold ${d.avgDailyLast7Days <= 4 ? 'text-ofc-red' : d.avgDailyLast7Days >= 7 ? 'text-green-600' : 'text-gray-700'}`}>
                          {d.avgDailyLast7Days}
                        </span>
                      ) : (
                        <span className="text-gray-400">–</span>
                      )}
                    </td>
                    <td className="px-6 py-3 text-gray-500">
                      {d.lastDailyCompletedAt
                        ? new Date(d.lastDailyCompletedAt).toLocaleDateString('de-DE')
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
                ))}
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
            <div className="text-green-700 text-sm py-2">✓ Keine offenen Warnsignale</div>
          ) : (
            <ul className="space-y-3">
              {openAlerts.slice(0, 6).map((a) => (
                <li key={a.id} className="flex items-start gap-3 p-3 rounded-lg border border-ofc-red/20 bg-ofc-red/5">
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
                  {a.severity === 'CRITICAL' && <span className="badge-red">KRITISCH</span>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
