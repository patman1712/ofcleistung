import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import RatingButtons from '../../components/RatingButtons';
import api from '../../lib/api';

interface Q {
  id: string;
  text: string;
  questionType: 'RATING_1_10' | 'TEXT';
  sortOrder: number;
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
    (async () => {
      setLoading(true);
      const res = await api.get('/daily-questions/status/today');
      setQuestions(res.data.questions || []);
      setSessionId(res.data.sessionId || null);
      setAlreadyAnswered(!!res.data.answered);
      setCompletedAt(res.data.completedAt || null);
      const init: Record<string, AnswerRow> = {};
      for (const q of res.data.questions || []) {
        init[q.id] = { questionId: q.id, rating: null, text: null };
      }
      setAnswers(init);
      setLoading(false);
    })();
  }, []);

  const ratingQuestions = useMemo(
    () => questions.filter((q) => q.questionType === 'RATING_1_10'),
    [questions],
  );
  const textQuestions = useMemo(
    () => questions.filter((q) => q.questionType === 'TEXT'),
    [questions],
  );

  const isFormComplete =
    ratingQuestions.every((q) => answers[q.id]?.rating != null) &&
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
        answers: Object.values(answers).map((a) => ({
          questionId: a.questionId,
          rating: a.rating,
          text: a.text,
        })),
      };
      // Zusätzliches Bemerkungsfeld als Text an eine extra Text-Frage hängen:
      // Wenn es keine extra Textfrage gibt, fügen wir die Bemerkung als letzten Eintrag mit einer "virtuellen" Frage nicht ein.
      // Stattdessen: Wenn der Nutzer eine Bemerkung eingibt und es schon eine Text-Frage gab, ignorieren wir dies.
      // Einfacher Ansatz: Zusätzliche Bemerkung in die letzte Text-Antwort legen falls leer,
      // sonst an alle Text-Antworten dranhängen. Simpler: Zusätzliches Feld wird als separate Antwort an die letzte Text-Frage appended.
      if (bemerkung.trim().length > 0) {
        const lastText = textQuestions[textQuestions.length - 1];
        if (lastText) {
          const prev = answers[lastText.id]?.text ?? '';
          const merged =
            (prev ? prev + '\n\n' : '') +
            `--- Allgemeine Bemerkung ---\n${bemerkung.trim()}`;
          payload.answers.find((x: any) => x.questionId === lastText.id).text = merged;
        }
      }
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
