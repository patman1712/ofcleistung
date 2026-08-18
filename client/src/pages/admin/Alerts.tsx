import React, { useEffect, useState } from 'react';
import api from '../../lib/api';

type Scope = 'DAILY' | 'TRAINING' | 'ALL';

interface AlertCfg {
  id: string;
  name: string;
  scope: Scope;
  threshold: number;
  consecutiveCount: number;
  active: boolean;
  _count?: { alerts: number };
}

interface AlertOpen {
  id: string;
  message: string;
  severity: 'WARNING' | 'CRITICAL';
  resolved: boolean;
  createdAt: string;
  config: AlertCfg;
  playerProfile: { user: { id: string; name: string; email: string } };
}

const emptyCfg = {
  name: '',
  scope: 'ALL' as Scope,
  threshold: 3,
  consecutiveCount: 2,
  active: true,
};

export default function AdminAlerts() {
  const [configs, setConfigs] = useState<AlertCfg[]>([]);
  const [openAlerts, setOpenAlerts] = useState<AlertOpen[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<AlertCfg | null>(null);
  const [form, setForm] = useState(emptyCfg);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  const load = async () => {
    setLoading(true);
    const [cfgRes, alRes] = await Promise.all([
      api.get('/alerts/configs'),
      api.get('/alerts/open'),
    ]);
    setConfigs(cfgRes.data);
    setOpenAlerts(alRes.data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const resetForm = () => {
    setForm(emptyCfg);
    setEditing(null);
    setError(null);
  };

  const startEdit = (c: AlertCfg) => {
    setEditing(c);
    setForm({
      name: c.name,
      scope: c.scope,
      threshold: c.threshold,
      consecutiveCount: c.consecutiveCount,
      active: c.active,
    });
    setShowForm(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      if (editing) {
        await api.put(`/alerts/configs/${editing.id}`, form);
      } else {
        await api.post('/alerts/configs', form);
      }
      await load();
      setShowForm(false);
      resetForm();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Fehler');
    }
  };

  const removeConfig = async (id: string) => {
    if (!confirm('Konfiguration wirklich löschen?')) return;
    await api.delete(`/alerts/configs/${id}`);
    await load();
  };

  const resolveAlert = async (id: string) => {
    await api.post(`/alerts/${id}/resolve`);
    await load();
  };

  const runCheck = async () => {
    setChecking(true);
    const res = await api.post('/alerts/check');
    setChecking(false);
    alert(`Prüfung abgeschlossen. ${res.data.createdAlerts} neue Warnsignale erzeugt.`);
    await load();
  };

  const scopeLabel = (s: Scope) =>
    s === 'DAILY' ? 'Täglich' : s === 'TRAINING' ? 'Training' : 'Alle (Täglich + Training)';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-ofc-grayDark">Warnsignale</h2>
          <p className="text-gray-500 mt-1">
            Definiere Schwellwerte: Wenn ein Spieler x-Mal hintereinander schlechter als „n“ bewertet,
            wird automatisch ein Warnsignal erzeugt.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={runCheck} disabled={checking} className="btn-secondary">
            {checking ? 'Prüft...' : '🔍 Jetzt prüfen'}
          </button>
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="btn-primary"
          >
            + Neue Regel
          </button>
        </div>
      </div>

      {showForm && (
        <div className="card border-ofc-red/30">
          <h3 className="text-lg font-semibold mb-4">
            {editing ? 'Regel bearbeiten' : 'Neue Warnsignal-Regel'}
          </h3>
          <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="label">Name der Regel</label>
              <input required className="input" value={form.name}
                     onChange={(e) => setForm({ ...form, name: e.target.value })}
                     placeholder="z.B. Schlechte Tagesform" />
            </div>
            <div>
              <label className="label">Gültigkeitsbereich</label>
              <select className="input" value={form.scope}
                      onChange={(e) => setForm({ ...form, scope: e.target.value as Scope })}>
                <option value="ALL">Alle (Täglich + Training)</option>
                <option value="DAILY">Nur tägliche Abfragen</option>
                <option value="TRAINING">Nur Trainings-Fragen</option>
              </select>
            </div>
            <div>
              <label className="label">Schwellwert (Bewertung ≤ n = schlecht)</label>
              <input type="number" min={1} max={10} className="input"
                     value={form.threshold}
                     onChange={(e) => setForm({ ...form, threshold: +e.target.value })} />
              <p className="text-xs text-gray-500 mt-1">
                Empfehlung: 3 = alles ≤ 3 wird als schlecht gewertet
              </p>
            </div>
            <div>
              <label className="label">Anzahl aufeinander folgender schlechter Antworten</label>
              <input type="number" min={1} max={20} className="input"
                     value={form.consecutiveCount}
                     onChange={(e) => setForm({ ...form, consecutiveCount: +e.target.value })} />
              <p className="text-xs text-gray-500 mt-1">
                Ab dieser Anzahl wird ein Warnsignal erzeugt.
              </p>
            </div>
            <div className="flex items-center gap-2 pt-6">
              <input id="cfg-active" type="checkbox"
                     checked={form.active}
                     onChange={(e) => setForm({ ...form, active: e.target.checked })}
                     className="w-4 h-4 text-ofc-red border-gray-300 rounded focus:ring-ofc-red" />
              <label htmlFor="cfg-active" className="text-sm font-medium text-gray-700">Regel aktiv</label>
            </div>

            {error && (
              <div className="md:col-span-2 rounded-lg bg-red-50 border border-ofc-red/30 text-ofc-red px-3 py-2 text-sm">
                {error}
              </div>
            )}

            <div className="md:col-span-2 flex gap-3 justify-end pt-2">
              <button type="button" onClick={() => { setShowForm(false); resetForm(); }} className="btn-secondary">
                Abbrechen
              </button>
              <button type="submit" className="btn-primary">
                {editing ? 'Speichern' : 'Anlegen'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="card">
        <h3 className="text-lg font-semibold mb-4">Konfigurationen</h3>
        {loading ? (
          <div className="text-gray-400">Lädt...</div>
        ) : configs.length === 0 ? (
          <div className="text-gray-500 text-sm">Noch keine Regeln angelegt.</div>
        ) : (
          <div className="overflow-x-auto -mx-6">
            <table className="min-w-full">
              <thead className="bg-ofc-gray text-xs uppercase text-gray-600">
                <tr>
                  <th className="px-6 py-2 text-left">Name</th>
                  <th className="px-6 py-2 text-left">Bereich</th>
                  <th className="px-6 py-2 text-left">Schwellwert</th>
                  <th className="px-6 py-2 text-left">Anzahl Serie</th>
                  <th className="px-6 py-2 text-left">Status</th>
                  <th className="px-6 py-2 text-left">Ausgelöst</th>
                  <th className="px-6 py-2 text-right">Aktionen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {configs.map((c) => (
                  <tr key={c.id}>
                    <td className="px-6 py-3 font-semibold">{c.name}</td>
                    <td className="px-6 py-3 text-gray-600">{scopeLabel(c.scope)}</td>
                    <td className="px-6 py-3">
                      <span className="badge-red">≤ {c.threshold}</span>
                    </td>
                    <td className="px-6 py-3">{c.consecutiveCount}x in Folge</td>
                    <td className="px-6 py-3">
                      {c.active ? <span className="badge-green">aktiv</span> : <span className="badge-warning">inaktiv</span>}
                    </td>
                    <td className="px-6 py-3">{c._count?.alerts ?? 0}x</td>
                    <td className="px-6 py-3 text-right flex justify-end gap-2">
                      <button onClick={() => startEdit(c)} className="btn-secondary text-sm">Bearbeiten</button>
                      <button onClick={() => removeConfig(c.id)} className="btn-danger text-sm">Löschen</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h3 className="text-lg font-semibold mb-4">
          Offene Warnsignale ({openAlerts.length})
        </h3>
        {openAlerts.length === 0 ? (
          <div className="text-green-700 text-sm py-2">✓ Keine offenen Warnsignale – alles im grünen Bereich!</div>
        ) : (
          <div className="space-y-3">
            {openAlerts.map((a) => (
              <div key={a.id}
                   className={`flex items-start gap-4 p-4 rounded-lg border ${
                     a.severity === 'CRITICAL'
                       ? 'bg-ofc-red/10 border-ofc-red'
                       : 'bg-yellow-50 border-yellow-300'
                   }`}>
                <div className={`text-2xl ${a.severity === 'CRITICAL' ? 'text-ofc-red' : 'text-yellow-600'}`}>
                  {a.severity === 'CRITICAL' ? '🚨' : '⚠'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{a.playerProfile.user.name}</span>
                    <span className="text-xs text-gray-500">{a.playerProfile.user.email}</span>
                    {a.severity === 'CRITICAL' && <span className="badge-red">KRITISCH</span>}
                    <span className="badge-warning">{a.config.name}</span>
                  </div>
                  <div className="mt-1 text-sm">{a.message}</div>
                  <div className="mt-1 text-xs text-gray-500">
                    Seit {new Date(a.createdAt).toLocaleString('de-DE')}
                  </div>
                </div>
                <button onClick={() => resolveAlert(a.id)} className="btn-primary text-sm whitespace-nowrap">
                  ✓ Erledigt
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
