import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../lib/api';

type QuestionType = 'RATING_1_10' | 'RATING' | 'TEXT';

interface Q {
  id: string;
  text: string;
  questionType: QuestionType;
  minRating: number;
  maxRating: number;
  sortOrder: number;
  active: boolean;
  repeatTime: string | null;
}

const RATING_PRESETS: Array<{ label: string; min: number; max: number; hint?: string }> = [
  { label: '1 – 3 (Schule/Noten)', min: 1, max: 3, hint: 'sehr gut / gut / befriedigend' },
  { label: '1 – 5 (Noten)', min: 1, max: 5, hint: '1 sehr gut … 5 mangelhaft' },
  { label: '0 – 5 (Belastung)', min: 0, max: 5, hint: '0 nichts … 5 maximal' },
  { label: '1 – 7 (Likert)', min: 1, max: 7, hint: 'psychologische Skala' },
  { label: '1 – 10 (Standard)', min: 1, max: 10, hint: 'Standard NRS Skala' },
  { label: '0 – 10 (Schmerz)', min: 0, max: 10, hint: '0 kein Schmerz … 10 extrem' },
];

export default function AdminDailyQuestions() {
  const [questions, setQuestions] = useState<Q[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Q | null>(null);
  const [form, setForm] = useState({
    text: '',
    questionType: 'RATING' as QuestionType,
    minRating: 1,
    maxRating: 10,
    sortOrder: 0,
    active: true,
    repeatTime: '06:00',
  });
  const [error, setError] = useState<string | null>(null);
  const [presetCustom, setPresetCustom] = useState(false);

  const load = async () => {
    setLoading(true);
    const res = await api.get('/daily-questions');
    const data: any[] = Array.isArray(res?.data) ? res.data : [];
    setQuestions(data.map((q) => ({
      ...q,
      minRating: typeof q.minRating === 'number' ? q.minRating : 1,
      maxRating: typeof q.maxRating === 'number' ? q.maxRating : 10,
    })));
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const resetForm = () => {
    setForm({
      text: '',
      questionType: 'RATING',
      minRating: 1,
      maxRating: 10,
      sortOrder: questions.length,
      active: true,
      repeatTime: '06:00',
    });
    setPresetCustom(false);
    setEditing(null);
    setError(null);
  };

  const startEdit = (q: Q) => {
    setEditing(q);
    const qt: QuestionType = q.questionType === 'TEXT' ? 'TEXT' : 'RATING';
    setForm({
      text: q.text,
      questionType: qt,
      minRating: q.minRating ?? 1,
      maxRating: q.maxRating ?? 10,
      sortOrder: q.sortOrder,
      active: q.active,
      repeatTime: q.repeatTime || '06:00',
    });
    setPresetCustom(!RATING_PRESETS.some(p => p.min === (q.minRating ?? 1) && p.max === (q.maxRating ?? 10)));
    setShowForm(true);
    setError(null);
  };

  const applyPreset = (min: number, max: number) => {
    setForm({ ...form, minRating: min, maxRating: max });
    setPresetCustom(false);
  };

  const isRating = (t: QuestionType) => t !== 'TEXT';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (isRating(form.questionType)) {
      if (!Number.isFinite(+form.minRating) || !Number.isFinite(+form.maxRating)) {
        setError('Bitte gültige Zahlen für Bewertungsstufen eintragen.');
        return;
      }
      if (+form.maxRating <= +form.minRating) {
        setError('Maximale Stufe muss größer als die Minimale sein.');
        return;
      }
      if (+form.maxRating - +form.minRating > 99) {
        setError('Maximal 100 Stufen erlaubt.');
        return;
      }
    }
    try {
      if (editing) {
        await api.put(`/daily-questions/${editing.id}`, form);
      } else {
        await api.post('/daily-questions', form);
      }
      await load();
      setShowForm(false);
      resetForm();
    } catch (err: any) {
      setErr(err);
    }
  };

  const setErr = (err: any) => {
    setError(err?.response?.data?.error || err?.message || 'Fehler beim Speichern');
  };

  const remove = async (id: string) => {
    if (!confirm('Frage wirklich löschen? Bereits gegebene Antworten bleiben erhalten.')) return;
    await api.delete(`/daily-questions/${id}`);
    await load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-ofc-grayDark">Tägliche Fragen</h2>
          <p className="text-gray-500 mt-1">
            Definiere die Fragen, die Spieler jeden Morgen beantworten – Bewertungsskala jetzt <strong className="text-ofc-red">frei wählbar</strong>.
          </p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
          className="btn-primary"
        >
          + Neue Frage
        </button>
      </div>

      {showForm && (
        <div className="card border-ofc-red/30">
          <h3 className="text-lg font-semibold mb-4">
            {editing ? 'Frage bearbeiten' : 'Neue tägliche Frage anlegen'}
          </h3>
          <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="label">Fragetext</label>
              <input
                required
                className="input"
                value={form.text}
                onChange={(e) => setForm({ ...form, text: e.target.value })}
                placeholder="z.B. Wie hast du geschlafen?"
              />
            </div>
            <div>
              <label className="label">Fragetyp</label>
              <select
                className="input"
                value={form.questionType}
                onChange={(e) => setForm({ ...form, questionType: e.target.value as QuestionType })}
              >
                <option value="RATING">Bewertung / Zahlen-Skala</option>
                <option value="TEXT">Textfeld / Freitext-Bemerkung</option>
              </select>
            </div>
            <div>
              <label className="label">Sortierung</label>
              <input
                type="number"
                min={0}
                className="input"
                value={form.sortOrder}
                onChange={(e) => setForm({ ...form, sortOrder: +e.target.value })}
              />
            </div>

            {isRating(form.questionType) && (
              <>
                <div className="md:col-span-2">
                  <label className="label mb-2">⚡ Bewertungs-Skala (Schnell-Presets)</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-2">
                    {RATING_PRESETS.map((p) => (
                      <button
                        key={`${p.min}-${p.max}-${p.label}`}
                        type="button"
                        onClick={() => applyPreset(p.min, p.max)}
                        className={`text-left px-3 py-2 rounded-lg border transition-all text-sm ${
                          form.minRating === p.min && form.maxRating === p.max && !presetCustom
                            ? 'border-ofc-red bg-ofc-red/10 text-ofc-red font-semibold'
                            : 'border-gray-200 hover:border-ofc-red/50 hover:bg-ofc-red/5'
                        }`}
                      >
                        <div className="font-medium">{p.label}</div>
                        {p.hint && <div className="text-xs text-gray-500 mt-0.5">{p.hint}</div>}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setPresetCustom(true)}
                      className={`text-left px-3 py-2 rounded-lg border transition-all text-sm ${
                        presetCustom
                          ? 'border-ofc-red bg-ofc-red/10 text-ofc-red font-semibold'
                          : 'border-gray-200 hover:border-ofc-red/50 hover:bg-ofc-red/5'
                      }`}
                    >
                      <div className="font-medium">🔧 Freie Skala</div>
                      <div className="text-xs text-gray-500 mt-0.5">z.B. 2-8, 1-100…</div>
                    </button>
                  </div>
                </div>

                <div>
                  <label className="label">Von (min. Stufe)</label>
                  <input
                    type="number"
                    className="input"
                    value={form.minRating}
                    onChange={(e) => { setPresetCustom(true); setForm({ ...form, minRating: +e.target.value }); }}
                  />
                </div>
                <div>
                  <label className="label">Bis (max. Stufe)</label>
                  <input
                    type="number"
                    className="input"
                    value={form.maxRating}
                    onChange={(e) => { setPresetCustom(true); setForm({ ...form, maxRating: +e.target.value }); }}
                  />
                </div>
              </>
            )}

            <div>
              <label className="label">Wiederholen täglich ab (Lokalzeit)</label>
              <input
                type="time"
                className="input"
                value={form.repeatTime}
                onChange={(e) => setForm({ ...form, repeatTime: e.target.value })}
              />
              <p className="text-xs text-gray-500 mt-1">
                Info: Die tägliche Abfrage wird bei Spieler-Login jeden Tag neu geprüft.
              </p>
            </div>
            <div className="flex items-center gap-2 pt-6">
              <input
                id="active"
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
                className="w-4 h-4 text-ofc-red border-gray-300 rounded focus:ring-ofc-red"
              />
              <label htmlFor="active" className="text-sm font-medium text-gray-700">Aktiv (Spieler sehen diese Frage)</label>
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
        {loading ? (
          <div className="text-gray-400">Lädt...</div>
        ) : questions.length === 0 ? (
          <div className="text-gray-500 text-sm">Noch keine Fragen angelegt.</div>
        ) : (
          <div className="divide-y divide-gray-100 -mx-6">
            {questions.map((q) => (
              <div key={q.id} className="px-6 py-4 flex items-start gap-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-gray-400 w-8">#{q.sortOrder}</span>
                    <span className="font-semibold">{q.text}</span>
                    {q.active ? (
                      <span className="badge-green">aktiv</span>
                    ) : (
                      <span className="badge-warning">inaktiv</span>
                    )}
                    <span className="badge-red">
                      {q.questionType === 'TEXT' ? 'Text' : `${q.minRating ?? 1} – ${q.maxRating ?? 10}`}
                    </span>
                  </div>
                  <div className="text-xs text-gray-500 mt-1">
                    Täglich ab {q.repeatTime || '06:00'} Uhr
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => startEdit(q)} className="btn-secondary text-sm">Bearbeiten</button>
                  <button onClick={() => remove(q.id)} className="btn-danger text-sm">Löschen</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="text-right">
        <Link to="/admin/trainings" className="text-sm text-ofc-red font-medium hover:underline">
          Weiter zu Trainings verwalten →
        </Link>
      </div>
    </div>
  );
}
