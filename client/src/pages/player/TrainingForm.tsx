import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import RatingButtons from '../../components/RatingButtons';
import api from '../../lib/api';

interface PendingTraining {
  trainingPlayerId: string;
  trainingId: string;
  title: string;
  scheduledAt: string;
  durationMin: number | null;
  questions: { id: string; text: string; questionType: 'RATING_1_10' | 'TEXT'; sortOrder: number }[];
}

export default function PlayerTrainingForm() {
  const { tpId } = useParams<{ tpId: string }>();
  const nav = useNavigate();
  const [allPending, setAllPending] = useState<PendingTraining[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [bemerkung, setBemerkung] = useState('');

  const [answers, setAnswers] = useState<Record<string, { questionId: string; rating: number | null; text: string | null }>>({});

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await api.get('/trainings/open/pending');
        setAllPending(res.data);
      } catch (e) {
        setAllPending([]);
      }
      setLoading(false);
    })();
  }, []);

  const current = useMemo(
    () => allPending.find((t) => t.trainingPlayerId === tpId) || null,
    [allPending, tpId],
  );

  useEffect(() => {
    if (current) {
      const init: Record<string, any> = {};
      for (const q of current.questions) {
        init[q.id] = { questionId: q.id, rating: null, text: null };
      }
      setAnswers(init);
    }
  }, [current?.trainingPlayerId]);

  const nextPending = useMemo(() => {
    if (!tpId) return null;
    const others = allPending.filter((t) => t.trainingPlayerId !== tpId);
    return others[0] || null;
  }, [allPending, tpId]);

  if (loading) return <div className="card text-gray-400">Lädt...</div>;
  if (!current) {
    return (
      <div className="card text-center py-12">
        <div className="text-5xl mb-4">🎉</div>
        <h2 className="text-2xl font-bold mb-2">Kein offenes Training gefunden.</h2>
        <p className="text-gray-500 mb-6">
          Entweder wurde die Umfrage schon beantwortet oder das Training liegt noch in der Zukunft.
        </p>
        <Link to="/player" className="btn-primary">Zurück zum Start</Link>
      </div>
    );
  }

  const ratingQs = current.questions.filter((q) => q.questionType === 'RATING_1_10');
  const textQs = current.questions.filter((q) => q.questionType === 'TEXT');
  const isComplete =
    ratingQs.every((q) => answers[q.id]?.rating != null) &&
    textQs.every((q) => (answers[q.id]?.text ?? '').toString().trim().length > 0);

  const setRating = (qid: string, r: number) => {
    setAnswers((p) => ({ ...p, [qid]: { ...p[qid], questionId: qid, rating: r } }));
  };
  const setText = (qid: string, t: string) => {
    setAnswers((p) => ({ ...p, [qid]: { ...p[qid], questionId: qid, text: t } }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!isComplete) {
      setError('Bitte alle Fragen beantworten.');
      return;
    }
    setSubmitting(true);
    try {
      const payload: any = {
        trainingPlayerId: current.trainingPlayerId,
        answers: Object.values(answers).map((a) => ({
          questionId: a.questionId,
          rating: a.rating,
          text: a.text,
        })),
      };
      if (bemerkung.trim().length > 0) {
        const lastText = textQs[textQs.length - 1];
        if (lastText) {
          const prev = answers[lastText.id]?.text ?? '';
          payload.answers.find((x: any) => x.questionId === lastText.id).text =
            (prev ? prev + '\n\n' : '') +
            `--- Allgemeine Bemerkung ---\n${bemerkung.trim()}`;
        }
      }
      await api.post('/trainings/submit/answers', payload);
      setDone(true);
      if (nextPending) {
        setTimeout(() => nav(`/player/training/${nextPending.trainingPlayerId}`), 1200);
      } else {
        setTimeout(() => nav('/player'), 1200);
      }
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Fehler beim Speichern.');
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <div className="max-w-3xl mx-auto card text-center py-16">
        <div className="text-7xl mb-4">✅</div>
        <h2 className="text-2xl font-bold text-green-700 mb-2">Trainings-Fragen gespeichert!</h2>
        <p className="text-gray-500">
          {nextPending ? 'Weiteres offenes Training wird gleich geladen...' : 'Danke – zurück zum Start...'}
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="card border-ofc-red/40 bg-gradient-to-br from-white to-red-50/40">
        <div className="flex items-start gap-4 flex-wrap">
          <div className="h-16 w-16 rounded-2xl bg-ofc-red text-white flex items-center justify-center text-3xl">⚽</div>
          <div className="flex-1 min-w-0">
            <div className="text-xs uppercase tracking-wide text-ofc-red font-semibold">Trainings-Feedback</div>
            <h2 className="text-2xl font-bold mt-1">{current.title}</h2>
            <div className="text-sm text-gray-500 mt-1 flex flex-wrap gap-x-4">
              <span>
                📅 {new Date(current.scheduledAt).toLocaleString('de-DE', {
                  weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
                })}
              </span>
              {current.durationMin && <span>⏱ {current.durationMin} Min.</span>}
            </div>
          </div>
          {nextPending && (
            <div className="text-xs text-ofc-red font-medium bg-ofc-red/10 rounded-lg px-3 py-2 self-center">
              + {allPending.length - 1} weiteres offen
            </div>
          )}
        </div>
      </div>

      <form onSubmit={submit} className="space-y-6">
        {current.questions.map((q, i) => (
          <div key={q.id} className="card">
            <div className="flex items-start gap-3 mb-3">
              <div className="h-8 w-8 rounded-full bg-ofc-red text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
                {i + 1}
              </div>
              <h3 className="text-lg font-semibold pt-1">{q.text}</h3>
              <span className="ml-auto badge-red text-xs">
                {q.questionType === 'RATING_1_10' ? '1 – 10' : 'Text'}
              </span>
            </div>
            <div className="pl-11">
              {q.questionType === 'RATING_1_10' ? (
                <RatingButtons
                  value={answers[q.id]?.rating ?? null}
                  onChange={(n) => setRating(q.id, n)}
                />
              ) : (
                <textarea
                  rows={3}
                  className="input"
                  placeholder="Deine Antwort..."
                  value={answers[q.id]?.text ?? ''}
                  onChange={(e) => setText(q.id, e.target.value)}
                />
              )}
            </div>
          </div>
        ))}

        <div className="card border-ofc-red/30">
          <h3 className="text-lg font-semibold mb-2">📝 Zusätzliche Bemerkung</h3>
          <p className="text-sm text-gray-500 mb-3">
            Verletzungen, Belastung, Schmerzen – was möchtest du ergänzen?
          </p>
          <textarea
            rows={3}
            className="input"
            placeholder="Optionales Feld..."
            value={bemerkung}
            onChange={(e) => setBemerkung(e.target.value)}
          />
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 border border-ofc-red/30 text-ofc-red px-3 py-2 text-sm">
            {error}
          </div>
        )}

        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 card">
          <div className="text-sm text-gray-600">
            {!isComplete && <div className="text-ofc-red font-medium">Bitte alle Pflichtfelder ausfüllen.</div>}
            {isComplete && <div className="text-green-700 font-medium">✓ Alles beantwortet – bereit zum Senden!</div>}
          </div>
          <button
            type="submit"
            disabled={submitting || !isComplete}
            className="btn-primary px-8 py-3 text-base"
          >
            {submitting ? 'Wird gespeichert...' : 'Feedback absenden ✓'}
          </button>
        </div>
      </form>
    </div>
  );
}
