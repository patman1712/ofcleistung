import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../lib/api';

type QuestionType = 'RATING_1_10' | 'TEXT';

interface Q {
  id: string;
  text: string;
  questionType: QuestionType;
  sortOrder: number;
  active: boolean;
  repeatTime: string | null;
}

export default function AdminDailyQuestions() {
  const [questions, setQuestions] = useState<Q[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Q | null>(null);
  const [form, setForm] = useState({
    text: '',
    questionType: 'RATING_1_10' as QuestionType,
    sortOrder: 0,
    active: true,
    repeatTime: '06:00',
  });
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const res = await api.get('/daily-questions');
    setQuestions(res.data);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const resetForm = () => {
    setForm({ text: '', questionType: 'RATING_1_10', sortOrder: questions.length, active: true, repeatTime: '06:00' });
    setEditing(null);
    setError(null);
  };

  const startEdit = (q: Q) => {
    setEditing(q);
    setForm({
      text: q.text,
      questionType: q.questionType,
      sortOrder: q.sortOrder,
      active: q.active,
      repeatTime: q.repeatTime || '06:00',
    });
    setShowForm(true);
    setError(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
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
      setError(err?.response?.data?.error || 'Fehler');
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Frage wirklich löschen?')) return;
    await api.delete(`/daily-questions/${id}`);
    await load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-ofc-grayDark">Tägliche Fragen</h2>
          <p className="text-gray-500 mt-1">
            Definiere die Fragen, die Spieler jeden Morgen beantworten.
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
                <option value="RATING_1_10">Bewertung 1 – 10</option>
                <option value="TEXT">Textfeld / Bemerkung</option>
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
                      {q.questionType === 'RATING_1_10' ? '1 – 10' : 'Text'}
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
