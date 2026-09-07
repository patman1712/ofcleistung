import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import RatingButtons from '../../components/RatingButtons';
import api from '../../lib/api';

interface Q {
  id: string;
  text: string;
  questionType: 'RATING_1_10' | 'RATING' | 'TEXT';
  sortOrder: number;
  minRating?: number | null;
  maxRating?: number | null;
}
interface AnswerRow {
  questionId: string;
  rating: number | null;
  text: string | null;
}

export default function PlayerDailyForm() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [questions, setQuestions] = useState<Q[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [alreadyAnswered, setAlreadyAnswered] = useState(false);
  const [completedAt, setCompletedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bemerkung, setBemerkung] = useState('');

  const [answers, setAnswers] = useState<Record<string, AnswerRow>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.get('/daily-questions/status/today');
        const data = res?.data || {};
        const qs: Q[] = Array.isArray(data.questions) ? data.questions : [];
        if (!cancelled) {
          setQuestions(qs);
          setSessionId(typeof data.sessionId === 'string' ? data.sessionId : null);
          setAlreadyAnswered(!!data.answered);
          setCompletedAt(typeof data.completedAt === 'string' ? data.completedAt : null);
          if (typeof data.remarks === 'string' && data.remarks.length > 0) {
            setBemerkung(data.remarks);
          }
          const init: Record<string, AnswerRow> = {};
          for (const q of qs) init[q.id] = { questionId: q.id, rating: null, text: null };
          if (Array.isArray(data.answers)) {
            for (const a of data.answers) {
              if (!a || typeof a.questionId !== 'string') continue;
              // Alt-Daten Migration: Wenn die Antwort "--- Allgemeine Bemerkung ---" enthält,
              // die Bemerkung schon im Status mitgeliefert, also Text hier filtern!
              let rawText: string | null = typeof a.text === 'string' ? a.text : null;
              if (rawText) {
                const marker = '--- Allgemeine Bemerkung ---';
                const idx = rawText.indexOf(marker);
                if (idx >= 0) {
                  rawText = rawText.slice(0, idx).trim() || null;
                }
              }
              init[a.questionId] = {
                questionId: a.questionId,
                rating: a.rating != null ? Number(a.rating) : null,
                text: rawText,
              };
            }
          }
          setAnswers(init);
        }
      } catch (err: any) {
        if (!cancelled) {
          const msg =
            err?.response?.data?.error ||
            err?.message ||
            'Netzwerkfehler. Bitte Seite neu laden (F5).';
          setError(msg);
          setQuestions([]);
          setAnswers({});
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const ratingQuestions = useMemo(
    () =>
      questions.filter(
        (q) => q.questionType === 'RATING' || q.questionType === 'RATING_1_10',
      ),
    [questions],
  );
  const textQuestions = useMemo(
    () => questions.filter((q) => q.questionType === 'TEXT'),
    [questions],
  );

  const isRatingQuestion = (qt: string) => qt === 'RATING_1_10' || qt === 'RATING';

  const isFormComplete =
    ratingQuestions.every((q) => {
      const ans = answers[q.id];
      if (!ans) return false;
      if (ans.rating == null) return false;
      const minR = (q.minRating ?? 1);
      const maxR = (q.maxRating ?? 10);
      return +ans.rating >= minR && +ans.rating <= maxR;
    }) &&
    textQuestions.every((q) => (answers[q.id]?.text ?? '').toString().trim().length > 0);

  const setRating = (qid: string, r: number) => {
    setAnswers((prev) => ({ ...prev, [qid]: { ...prev[qid], questionId: qid, rating: r } }));
  };
  const setText = (qid: string, t: string) => {
    setAnswers((prev) => ({ ...prev, [qid]: { ...prev[qid], questionId: qid, text: t } }));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!isFormComplete) {
      setError('Bitte alle Fragen beantworten.');
      return;
    }
    setSubmitting(true);
    try {
      const payload: any = {
        sessionId,
        remarks: bemerkung.trim().length > 0 ? bemerkung.trim() : null,
        answers: Object.values(answers).map((a) => ({
          questionId: a.questionId,
          rating: a.rating,
          text: a.text,
        })),
      };
      await api.post('/daily-questions/submit/today', payload);
      setTimeout(() => nav('/player'), 400);
    } catch (err: any) {
      setError(err?.response?.data?.error || 'Fehler beim Speichern.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="card text-gray-400">Lädt...</div>;
  }

  if (alreadyAnswered) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="card text-center py-16">
          <div className="text-7xl mb-4">✅</div>
          <h2 className="text-2xl font-bold mb-2 text-green-700">Heutige Abfrage erledigt!</h2>
          <p className="text-gray-500 mb-6">
            {completedAt
              ? `Beantwortet am ${new Date(completedAt).toLocaleString('de-DE')}`
              : ''}
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            <button onClick={() => setAlreadyAnswered(false)} className="btn-secondary">
              Nochmal bearbeiten
            </button>
            <button onClick={() => nav('/player')} className="btn-primary">
              Zurück zum Start
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl md:text-3xl font-bold text-ofc-grayDark">
          Guten Morgen, {user?.name.split(' ')[0]} 👋
        </h2>
        <p className="text-gray-500 mt-2">
          Nimm dir 1 Minute für die heutige Abfrage. Dein Trainer nutzt diese Infos, um dich bestmöglich zu unterstützen.
        </p>
        <div className="mt-4 text-sm">
          <span className="badge-red">Heute · {new Date().toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}</span>
        </div>
      </div>

      <form onSubmit={submit} className="space-y-6">
        {questions.length === 0 ? (
          <div className="card text-gray-500">
            Der Trainer hat heute noch keine Fragen hinterlegt.
          </div>
        ) : (
          questions.map((q, i) => (
            <div key={q.id} className="card">
              <div className="flex items-start gap-3 mb-3">
                <div className="h-8 w-8 rounded-full bg-ofc-red text-white flex items-center justify-center text-sm font-bold flex-shrink-0">
                  {i + 1}
                </div>
                <h3 className="text-lg font-semibold pt-1">{q.text}</h3>
              </div>
              <div className="pl-11">
                {q.questionType === 'RATING_1_10' || q.questionType === 'RATING' ? (
                  <RatingButtons
                    value={answers[q.id]?.rating ?? null}
                    onChange={(n) => setRating(q.id, n)}
                    min={q.minRating ?? 1}
                    max={q.maxRating ?? 10}
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
          ))
        )}

        {questions.length > 0 && (
          <div className="card border-ofc-red/30">
            <h3 className="text-lg font-semibold mb-2">📝 Zusätzliche Bemerkung</h3>
            <p className="text-sm text-gray-500 mb-3">
              Ist dir heute sonst noch etwas wichtig? Schmerzen, Vorkommnisse, Allergien etc.?
            </p>
            <textarea
              rows={3}
              className="input"
              placeholder="Optionales Feld..."
              value={bemerkung}
              onChange={(e) => setBemerkung(e.target.value)}
            />
          </div>
        )}

        {error && (
          <div className="rounded-lg bg-red-50 border border-ofc-red/30 text-ofc-red px-3 py-2 text-sm">
            {error}
          </div>
        )}

        {questions.length > 0 && (
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 card">
            <div className="text-sm text-gray-600">
              {ratingQuestions.length > 0 && (
                <div>
                  Bewertungen (1-10): {ratingQuestions.filter((q) => answers[q.id]?.rating != null).length}/{ratingQuestions.length}
                  &nbsp;beantwortet
                </div>
              )}
              {!isFormComplete && (
                <div className="text-ofc-red font-medium mt-1">Bitte alle Pflichtfelder ausfüllen.</div>
              )}
              {isFormComplete && (
                <div className="text-green-700 font-medium mt-1">✓ Alle Fragen beantwortet</div>
              )}
            </div>
            <button
              type="submit"
              disabled={submitting || !isFormComplete}
              className="btn-primary px-8 py-3 text-base"
            >
              {submitting ? 'Wird gespeichert...' : 'Abschicken ✓'}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
