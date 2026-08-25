import React, { useEffect, useMemo, useState } from 'react';
import api from '../../lib/api';

type QuestionType = 'RATING_1_10' | 'RATING' | 'TEXT';

interface PlayerProfile {
  id: string;
  position?: string | null;
  user: { id: string; name: string; email: string };
}
interface Training {
  id: string;
  title: string;
  scheduledAt: string;
  durationMin?: number | null;
  players: { id: string; playerProfile: PlayerProfile }[];
  questions: {
    id: string;
    text: string;
    questionType: QuestionType;
    sortOrder: number;
    minRating: number;
    maxRating: number;
  }[];
}
interface PlayerUser {
  id: string;
  name: string;
  playerProfile: { id: string } | null;
}
interface TrainingQuestionDraft {
  text: string;
  questionType: QuestionType;
  minRating: number;
  maxRating: number;
  sortOrder: number;
}

const RATING_PRESETS: Array<{ label: string; min: number; max: number }> = [
  { label: '1–3', min: 1, max: 3 },
  { label: '1–5', min: 1, max: 5 },
  { label: '0–5', min: 0, max: 5 },
  { label: '1–7', min: 1, max: 7 },
  { label: '1–10', min: 1, max: 10 },
  { label: '0–10', min: 0, max: 10 },
];

const makeEmptyQuestion = (sortOrder: number): TrainingQuestionDraft => ({
  text: '',
  questionType: 'RATING',
  minRating: 1,
  maxRating: 10,
  sortOrder,
});

const defaultTraining = {
  title: '',
  scheduledAt: '',
  durationMin: 90 as number | '',
  playerProfileIds: [] as string[],
  questions: [] as TrainingQuestionDraft[],
};

export default function AdminTrainings() {
  const [trainings, setTrainings] = useState<Training[]>([]);
  const [players, setPlayers] = useState<PlayerUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(defaultTraining);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const [tRes, pRes] = await Promise.all([api.get('/trainings'), api.get('/players')]);
    const tData: Training[] = Array.isArray(tRes?.data) ? tRes.data : [];
    setTrainings(tData.map((t) => ({
      ...t,
      questions: (t.questions || []).map((q: any) => ({
        ...q,
        minRating: typeof q.minRating === 'number' ? q.minRating : 1,
        maxRating: typeof q.maxRating === 'number' ? q.maxRating : 10,
      })),
    })));
    setPlayers(Array.isArray(pRes?.data) ? pRes.data : []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const playersWithProfile = useMemo(
    () => players.filter((p) => !!p.playerProfile),
    [players],
  );

  const resetForm = () => {
    setForm(defaultTraining);
    setEditingId(null);
    setError(null);
  };

  const startEdit = (t: Training) => {
    setEditingId(t.id);
    setForm({
      title: t.title,
      scheduledAt: t.scheduledAt.slice(0, 16),
      durationMin: t.durationMin ?? 90,
      playerProfileIds: t.players.map((x) => x.playerProfile.id),
      questions: t.questions.map((q) => ({
        text: q.text,
        questionType: q.questionType === 'TEXT' ? 'TEXT' : 'RATING',
        minRating: q.minRating ?? 1,
        maxRating: q.maxRating ?? 10,
        sortOrder: q.sortOrder,
      })),
    });
    setShowForm(true);
    setExpandedId(t.id);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    // Validieren der Fragen
    for (let i = 0; i < form.questions.length; i++) {
      const q = form.questions[i];
      if (!q.text.trim()) {
        setError(`Fragetext bei Frage ${i + 1} fehlt.`);
        return;
      }
      if (q.questionType !== 'TEXT') {
        if (!Number.isFinite(+q.minRating) || !Number.isFinite(+q.maxRating)) {
          setError(`Frage ${i + 1}: Bitte gültige Bewertungsstufen eintragen.`);
          return;
        }
        if (+q.maxRating <= +q.minRating) {
          setError(`Frage ${i + 1}: Max muss größer als Min sein.`);
          return;
        }
      }
    }
    try {
      const payload: any = {
        title: form.title.trim(),
        scheduledAt: new Date(form.scheduledAt).toISOString(),
        durationMin: form.durationMin === '' ? null : +form.durationMin,
        playerProfileIds: form.playerProfileIds,
      };
      if (editingId) {
        await api.put(`/trainings/${editingId}`, payload);
        const training = trainings.find((t) => t.id === editingId);
        if (!training?.questions.length && form.questions.length > 0) {
          for (const q of form.questions) {
            await api.post(`/trainings/${editingId}/questions`, q);
          }
        }
      } else {
        payload.questions = form.questions;
        await api.post('/trainings', payload);
      }
      await load();
      setShowForm(false);
      resetForm();
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Fehler beim Speichern');
    }
  };

  const remove = async (id: string) => {
    if (!confirm('Training wirklich löschen?')) return;
    await api.delete(`/trainings/${id}`);
    await load();
  };

  const togglePlayer = (pid: string) => {
    const ids = form.playerProfileIds.includes(pid)
      ? form.playerProfileIds.filter((x) => x !== pid)
      : [...form.playerProfileIds, pid];
    setForm({ ...form, playerProfileIds: ids });
  };

  const addQuestion = () => {
    const nextSort = form.questions.length;
    setForm({
      ...form,
      questions: [...form.questions, makeEmptyQuestion(nextSort)],
    });
  };
  const updateQuestion = (
    i: number,
    patch: Partial<TrainingQuestionDraft>,
  ) => {
    const qs = [...form.questions];
    qs[i] = { ...qs[i], ...patch };
    setForm({ ...form, questions: qs });
  };
  const removeQuestion = (i: number) => {
    const qs = form.questions.filter((_, idx) => idx !== i);
    setForm({ ...form, questions: qs });
  };

  const addQuestionToTraining = async (tid: string) => {
    const text = prompt('Fragetext:');
    if (!text) return;
    const qType: QuestionType = (
      prompt('Fragetyp: RATING (Zahlenskala) oder TEXT? (Default RATING)', 'RATING') || 'RATING'
    ) as QuestionType;
    const presetAns = prompt(
      'Bewertungs-Skala (z.B. 1-3, 1-5, 0-10, 1-10). Leer = 1-10:',
      '1-10',
    )?.trim();
    let minR = 1,
      maxR = 10;
    if (presetAns && /^-?\d+\s*[-–:to]+\s*-?\d+$/i.test(presetAns)) {
      const m = presetAns.match(/-?\d+/g);
      if (m && m.length >= 2) {
        const a = +m[0],
          b = +m[1];
        if (b > a) {
          minR = a;
          maxR = b;
        }
      }
    }
    await api.post(`/trainings/${tid}/questions`, {
      text,
      questionType: qType,
      minRating: minR,
      maxRating: maxR,
      sortOrder: 0,
    });
    await load();
    setExpandedId(tid);
  };

  const removeTrainingQuestion = async (qid: string) => {
    if (!confirm('Frage löschen?')) return;
    await api.delete(`/trainings/questions/${qid}`);
    await load();
  };

  const isRating = (t: QuestionType) => t !== 'TEXT';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-ofc-grayDark">Trainings</h2>
          <p className="text-gray-500 mt-1">
            Trainings anlegen, Spieler zuweisen und <strong className="text-ofc-red">frei wählbare</strong> Fragen mit flexibler Skala hinterlegen.
          </p>
        </div>
        <button
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
          className="btn-primary"
        >
          + Neues Training
        </button>
      </div>

      {showForm && (
        <div className="card border-ofc-red/30">
          <h3 className="text-lg font-semibold mb-4">
            {editingId ? 'Training bearbeiten' : 'Neues Training anlegen'}
          </h3>
          <form onSubmit={submit} className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="label">Titel *</label>
                <input
                  required
                  className="input"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  placeholder="z.B. Training Einheit Mittwoch"
                />
              </div>
              <div>
                <label className="label">Startzeit *</label>
                <input
                  required
                  type="datetime-local"
                  className="input"
                  value={form.scheduledAt}
                  onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })}
                />
              </div>
              <div>
                <label className="label">Dauer (Min.)</label>
                <input
                  type="number"
                  min="15"
                  max="300"
                  className="input"
                  value={form.durationMin}
                  onChange={(e) =>
                    setForm({ ...form, durationMin: e.target.value ? +e.target.value : '' })
                  }
                />
              </div>
            </div>

            <div>
              <label className="label">
                Teilnehmende Spieler ({form.playerProfileIds.length} ausgewählt)
              </label>
              <div className="p-3 border border-gray-200 rounded-lg max-h-52 overflow-auto bg-white">
                {playersWithProfile.length === 0 ? (
                  <div className="text-sm text-gray-500">Noch keine Spieler angelegt.</div>
                ) : (
                  <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {playersWithProfile.map((p) => {
                      const checked = form.playerProfileIds.includes(p.playerProfile!.id);
                      return (
                        <li key={p.id}>
                          <label
                            className={`flex items-center gap-2 px-3 py-2 rounded-md cursor-pointer border transition-colors ${
                              checked
                                ? 'border-ofc-red bg-ofc-red/5'
                                : 'border-gray-200 hover:bg-gray-50'
                            }`}
                          >
                            <input
                              type="checkbox"
                              className="w-4 h-4 text-ofc-red rounded"
                              checked={checked}
                              onChange={() => togglePlayer(p.playerProfile!.id)}
                            />
                            <span className="flex-1 text-sm">{p.name}</span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>

            {!editingId && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="label mb-0">Trainings-Fragen</label>
                  <button type="button" onClick={addQuestion} className="btn-secondary text-sm py-1">
                    + Frage
                  </button>
                </div>
                <div className="space-y-4">
                  {form.questions.map((q, i) => (
                    <div
                      key={i}
                      className="p-3 md:p-4 bg-ofc-gray rounded-xl space-y-3 border border-gray-200"
                    >
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-start">
                        <div className="md:col-span-1 text-sm text-gray-500 pt-2 font-semibold">
                          #{i + 1}
                        </div>
                        <input
                          required
                          placeholder="Fragetext"
                          className="input md:col-span-7"
                          value={q.text}
                          onChange={(e) => updateQuestion(i, { text: e.target.value })}
                        />
                        <select
                          className="input md:col-span-3"
                          value={q.questionType}
                          onChange={(e) =>
                            updateQuestion(i, { questionType: e.target.value as QuestionType })
                          }
                        >
                          <option value="RATING">Bewertung / Zahlen-Skala</option>
                          <option value="TEXT">Textfeld / Freitext</option>
                        </select>
                        <div className="md:col-span-1 flex justify-end">
                          <button
                            type="button"
                            onClick={() => removeQuestion(i)}
                            className="btn-danger text-sm py-1 px-2"
                          >
                            ✕
                          </button>
                        </div>
                      </div>

                      {isRating(q.questionType) && (
                        <>
                          <div>
                            <div className="text-xs text-gray-500 mb-2">
                              ⚡ Skala Presets
                            </div>
                            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                              {RATING_PRESETS.map((p) => (
                                <button
                                  key={`tq-${i}-${p.min}-${p.max}`}
                                  type="button"
                                  onClick={() =>
                                    updateQuestion(i, { minRating: p.min, maxRating: p.max })
                                  }
                                  className={`text-xs px-2 py-1.5 rounded-md border transition-all ${
                                    q.minRating === p.min && q.maxRating === p.max
                                      ? 'border-ofc-red bg-ofc-red text-white font-semibold'
                                      : 'border-gray-200 bg-white hover:border-ofc-red/60 hover:bg-ofc-red/5'
                                  }`}
                                >
                                  {p.label}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <label className="label !mb-1 !text-xs">Von (min)</label>
                              <input
                                type="number"
                                className="input"
                                value={q.minRating}
                                onChange={(e) =>
                                  updateQuestion(i, { minRating: +e.target.value })
                                }
                              />
                            </div>
                            <div>
                              <label className="label !mb-1 !text-xs">Bis (max)</label>
                              <input
                                type="number"
                                className="input"
                                value={q.maxRating}
                                onChange={(e) =>
                                  updateQuestion(i, { maxRating: +e.target.value })
                                }
                              />
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  ))}
                  {form.questions.length === 0 && (
                    <div className="text-sm text-gray-500 p-3 bg-ofc-gray rounded-lg">
                      Noch keine Fragen. Mit „+ Frage“ eine hinzufügen.
                    </div>
                  )}
                </div>
              </div>
            )}

            {error && (
              <div className="rounded-lg bg-red-50 border border-ofc-red/30 text-ofc-red px-3 py-2 text-sm">
                {error}
              </div>
            )}

            <div className="flex gap-3 justify-end pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                }}
                className="btn-secondary"
              >
                Abbrechen
              </button>
              <button type="submit" className="btn-primary">
                {editingId ? 'Speichern' : 'Anlegen'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="space-y-4">
        {loading ? (
          <div className="card text-gray-400">Lädt...</div>
        ) : trainings.length === 0 ? (
          <div className="card text-gray-500 text-sm">Noch keine Trainings angelegt.</div>
        ) : (
          trainings.map((t) => {
            const expanded = expandedId === t.id;
            return (
              <div key={t.id} className="card">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-semibold">{t.title}</h3>
                    <div className="text-sm text-gray-500 mt-1 flex flex-wrap gap-x-4 gap-y-1">
                      <span>📅 {new Date(t.scheduledAt).toLocaleString('de-DE')}</span>
                      {t.durationMin && <span>⏱ {t.durationMin} Min.</span>}
                      <span>👥 {t.players.length} Spieler</span>
                      <span>❓ {t.questions.length} Fragen</span>
                    </div>
                    {t.players.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {t.players.map((p) => (
                          <span key={p.id} className="badge-red text-xs">
                            {p.playerProfile.user.name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setExpandedId(expanded ? null : t.id)}
                      className="btn-secondary text-sm"
                    >
                      {expanded ? 'Weniger' : 'Details'}
                    </button>
                    <button onClick={() => startEdit(t)} className="btn-secondary text-sm">
                      Bearbeiten
                    </button>
                    <button onClick={() => remove(t.id)} className="btn-danger text-sm">
                      Löschen
                    </button>
                  </div>
                </div>

                {expanded && (
                  <div className="mt-5 pt-5 border-t border-gray-100 space-y-4">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-sm">
                        Trainings-Fragen ({t.questions.length})
                      </h4>
                      <button
                        onClick={() => addQuestionToTraining(t.id)}
                        className="btn-secondary text-sm py-1"
                      >
                        + Frage hinzufügen
                      </button>
                    </div>
                    {t.questions.length === 0 ? (
                      <div className="text-sm text-gray-500">Noch keine Fragen angelegt.</div>
                    ) : (
                      <div className="divide-y divide-gray-100">
                        {t.questions.map((q, i) => (
                          <div key={q.id} className="py-3 flex items-start gap-4">
                            <div className="text-xs text-gray-400 w-6 pt-1">#{i + 1}</div>
                            <div className="flex-1">
                              <div className="font-medium">{q.text}</div>
                              <span className="badge-red text-xs mt-1 inline-block">
                                {q.questionType === 'TEXT'
                                  ? 'Text'
                                  : `${q.minRating ?? 1} – ${q.maxRating ?? 10}`}
                              </span>
                            </div>
                            <button
                              onClick={() => removeTrainingQuestion(q.id)}
                              className="btn-danger text-sm py-1"
                            >
                              Löschen
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
