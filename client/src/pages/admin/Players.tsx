import React, { useEffect, useState } from 'react';
import api from '../../lib/api';

interface PlayerProfile {
  id: string;
  userId: string;
  birthDate?: string | null;
  heightCm?: number | null;
  weightKg?: number | string | null;
  position?: string | null;
}
interface PlayerUser {
  id: string;
  email: string;
  name: string;
  role: 'PLAYER';
  playerProfile?: PlayerProfile | null;
}

const emptyForm = {
  email: '',
  password: '',
  name: '',
  birthDate: '',
  heightCm: '' as string | number,
  weightKg: '' as string | number,
  position: '',
};

export default function AdminPlayers() {
  const [players, setPlayers] = useState<PlayerUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<PlayerUser | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const res = await api.get('/players');
    setPlayers(res.data);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const resetForm = () => {
    setForm(emptyForm);
    setEditing(null);
    setError(null);
  };

  const startEdit = (p: PlayerUser) => {
    setEditing(p);
    const pp = p.playerProfile;
    setForm({
      email: p.email,
      password: '',
      name: p.name,
      birthDate: pp?.birthDate ? new Date(pp.birthDate).toISOString().slice(0, 10) : '',
      heightCm: pp?.heightCm ?? '',
      weightKg: pp?.weightKg != null ? String(pp.weightKg) : '',
      position: pp?.position ?? '',
    });
    setShowForm(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const payload: any = {
        email: form.email.trim(),
        name: form.name.trim(),
        birthDate: form.birthDate || null,
        heightCm: form.heightCm === '' ? null : +form.heightCm,
        weightKg: form.weightKg === '' ? null : +form.weightKg,
        position: form.position || null,
      };
      if (editing) {
        if (form.password) payload.password = form.password;
        await api.put(`/players/${editing.id}`, payload);
      } else {
        if (!form.password || form.password.length < 6) {
          setError('Passwort muss mindestens 6 Zeichen lang sein');
          return;
        }
        payload.password = form.password;
        await api.post('/players', payload);
      }
      await load();
      setShowForm(false);
      resetForm();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Fehler');
    }
  };

  const remove = async (id: string) => {
    const confirmName = prompt('Achtung: Spieler UND alle seine Antworten werden gelöscht!\nGib den Namen zur Bestätigung ein:');
    const p = players.find((x) => x.id === id);
    if (!p || !confirmName || confirmName.trim() !== p.name) return;
    await api.delete(`/players/${id}`);
    await load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-ofc-grayDark">Spieler verwalten</h2>
          <p className="text-gray-500 mt-1">Anlegen, Bearbeiten und Löschen von Spielern.</p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
          className="btn-primary"
        >
          + Neuer Spieler
        </button>
      </div>

      {showForm && (
        <div className="card border-ofc-red/30">
          <h3 className="text-lg font-semibold mb-4">
            {editing ? 'Spieler bearbeiten' : 'Neuen Spieler anlegen'}
          </h3>
          <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="label">Name *</label>
              <input required className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Max Mustermann" />
            </div>
            <div>
              <label className="label">E-Mail *</label>
              <input required type="email" className="input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="max@ofc.de" />
            </div>
            <div>
              <label className="label">{editing ? 'Passwort (nur zum Ändern)' : 'Passwort *'}</label>
              <input type="password" className="input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="mind. 6 Zeichen" />
            </div>
            <div>
              <label className="label">Geburtsdatum</label>
              <input type="date" className="input" value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} />
            </div>
            <div>
              <label className="label">Größe (cm)</label>
              <input type="number" min="100" max="230" className="input" value={form.heightCm} onChange={(e) => setForm({ ...form, heightCm: e.target.value })} placeholder="z.B. 180" />
            </div>
            <div>
              <label className="label">Gewicht (kg)</label>
              <input type="number" step="0.1" min="30" max="150" className="input" value={form.weightKg} onChange={(e) => setForm({ ...form, weightKg: e.target.value })} placeholder="z.B. 75.5" />
            </div>
            <div className="md:col-span-3">
              <label className="label">Position</label>
              <input className="input" value={form.position} onChange={(e) => setForm({ ...form, position: e.target.value })} placeholder="z.B. Mittelfeld, Stürmer, Torwart" />
            </div>

            {error && (
              <div className="md:col-span-3 rounded-lg bg-red-50 border border-ofc-red/30 text-ofc-red px-3 py-2 text-sm">
                {error}
              </div>
            )}

            <div className="md:col-span-3 flex gap-3 justify-end pt-2">
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
        {loading ? (
          <div className="text-gray-400">Lädt...</div>
        ) : players.length === 0 ? (
          <div className="text-gray-500 text-sm">Noch keine Spieler angelegt.</div>
        ) : (
          <div className="overflow-x-auto -mx-6">
            <table className="min-w-full">
              <thead className="bg-ofc-gray text-xs uppercase text-gray-600">
                <tr>
                  <th className="px-6 py-2 text-left">Name</th>
                  <th className="px-6 py-2 text-left">E-Mail</th>
                  <th className="px-6 py-2 text-left">Geburtstag</th>
                  <th className="px-6 py-2 text-left">Größe</th>
                  <th className="px-6 py-2 text-left">Gewicht</th>
                  <th className="px-6 py-2 text-left">Position</th>
                  <th className="px-6 py-2 text-right">Aktionen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-sm">
                {players.map((p) => {
                  const pp = p.playerProfile;
                  return (
                    <tr key={p.id}>
                      <td className="px-6 py-3 font-semibold">{p.name}</td>
                      <td className="px-6 py-3 text-gray-600">{p.email}</td>
                      <td className="px-6 py-3 text-gray-500">
                        {pp?.birthDate ? new Date(pp.birthDate).toLocaleDateString('de-DE') : '–'}
                      </td>
                      <td className="px-6 py-3 text-gray-500">{pp?.heightCm ? `${pp.heightCm} cm` : '–'}</td>
                      <td className="px-6 py-3 text-gray-500">{pp?.weightKg ? `${pp.weightKg} kg` : '–'}</td>
                      <td className="px-6 py-3">
                        {pp?.position ? <span className="badge-red">{pp.position}</span> : '–'}
                      </td>
                      <td className="px-6 py-3 text-right flex justify-end gap-2">
                        <button onClick={() => startEdit(p)} className="btn-secondary text-sm">Bearbeiten</button>
                        <button onClick={() => remove(p.id)} className="btn-danger text-sm">Löschen</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
