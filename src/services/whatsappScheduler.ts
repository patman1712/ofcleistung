import { schedule, ScheduledTask } from 'node-cron';
import { startOfDay } from 'date-fns';
import { formatInTimeZone, toZonedTime, fromZonedTime } from 'date-fns-tz';
import { prisma } from '../lib/prisma.js';
import {
  loadWAConfig,
  sendReminderMessage,
  normalizePhone,
  WhatsAppConfig,
  ReminderProvider,
} from './whatsappService.js';

// Anti-Doppel-Versand: Merke sich "welchen Tag" wir zuletzt verarbeitet haben
let lastRunDateKey: string | null = null;

export async function runDailyReminderCheck(opts: { dryRun?: boolean; force?: boolean } = {}) {
  const cfg = await loadWAConfig();
  if (!opts.force && !cfg.enabled) {
    return { skipped: true, reason: 'WhatsApp-Erinnerungen deaktiviert' };
  }

  const tz = cfg.timezone || 'Europe/Berlin';
  const todayKey = formatInTimeZone(new Date(), tz, 'yyyy-MM-dd');

  if (!opts.force && lastRunDateKey === todayKey) {
    return {
      skipped: true,
      reason: `Heute (${todayKey}) bereits ausgeführt (Start-Neustart-Schutz)`,
    };
  }
  lastRunDateKey = todayKey;

  // "Heute Anfang" in der Spieler-Zeitzone → in UTC-Datum umwandeln (für Prisma-Query date-Vergleich)
  const zonedNow = toZonedTime(new Date(), tz);
  const zonedTodayStart = startOfDay(zonedNow);
  const todayUtcDate = fromZonedTime(zonedTodayStart, tz);

  const activeQuestions = await prisma.dailyQuestion.findMany({
    where: { active: true },
    select: { id: true },
  });
  if (activeQuestions.length === 0) {
    return { skipped: true, reason: 'Keine aktiven täglichen Fragen – Versand übersprungen.' };
  }

  const players = await prisma.user.findMany({
    where: { role: 'PLAYER' },
    include: { playerProfile: { select: { id: true, phoneNumber: true } } },
  });

  type ResultRow = {
    id: string; name: string; phone: string;
    status: 'sent' | 'already_done' | 'no_phone' | 'failed';
    error?: string; sid?: string;
  };
  const results: ResultRow[] = [];

  for (const p of players) {
    const phone = normalizePhone(p.playerProfile?.phoneNumber);
    if (!phone) {
      results.push({ id: p.id, name: p.name, phone: '(keine)', status: 'no_phone' });
      continue;
    }
    const session = await prisma.dailyAnswerSession.findUnique({
      where: { playerId_date: { playerId: p.id, date: todayUtcDate } },
    });
    if (session?.completedAt) {
      results.push({ id: p.id, name: p.name, phone, status: 'already_done' });
      continue;
    }
    const msgText = renderTemplate(cfg, p.name);
    if (opts.dryRun) {
      results.push({ id: p.id, name: p.name, phone, status: 'sent', sid: 'dry-run' });
      continue;
    }
    const r = await sendReminderMessage(cfg, {
      playerId: p.id,
      phoneRaw: p.playerProfile?.phoneNumber,
      text: msgText,
    });
    results.push({
      id: p.id, name: p.name, phone,
      status: r.ok ? 'sent' : 'failed',
      sid: r.sid, error: r.error,
    });
  }

  const stats = {
    total: results.length,
    sent: results.filter((r) => r.status === 'sent').length,
    already_done: results.filter((r) => r.status === 'already_done').length,
    no_phone: results.filter((r) => r.status === 'no_phone').length,
    failed: results.filter((r) => r.status === 'failed').length,
  };
  console.log(`[wa-reminder] ${todayKey} dryRun=${opts.dryRun ? 1 : 0}:`, stats);
  return {
    dryRun: !!opts.dryRun,
    date: todayKey,
    timezone: tz,
    config: { enabled: cfg.enabled, time: cfg.time },
    stats,
    results,
  };
}

function renderTemplate(cfg: WhatsAppConfig, playerName: string) {
  return (cfg.message || 'Hallo {{name}}!').replace(/\{\{\s*name\s*\}\}/g, playerName);
}

// node-cron Expression: "Minute Stunde * * *"
function scheduleExpression(time: string): string | null {
  const m = /^(\d{1,2}):(\d{1,2})$/.exec(time);
  if (!m) return null;
  const hh = Math.max(0, Math.min(23, parseInt(m[1], 10)));
  const mm = Math.max(0, Math.min(59, parseInt(m[2], 10)));
  return `${mm} ${hh} * * *`;
}

let _activeTask: ScheduledTask | null = null;

export function startWhatsAppScheduler() {
  const boot = async () => {
    const cfg = await loadWAConfig();
    const exp = scheduleExpression(cfg.time || '09:00');
    const tz = cfg.timezone || 'Europe/Berlin';
    if (!cfg.enabled || !exp) {
      console.log(
        `[wa-reminder] Scheduler nicht gestartet (enabled=${cfg.enabled}, time="${cfg.time}")`,
      );
      return;
    }
    if (_activeTask) {
      _activeTask.stop();
      _activeTask = null;
    }
    const options = {
      scheduled: true,
      timezone: tz,
      recoverMissedExecutions: false,
      name: 'ofc-whatsapp-daily-reminder',
    } as const;
    _activeTask = schedule(exp, () => {
      void runDailyReminderCheck().catch((e) =>
        console.error('[wa-reminder] Laufzeitfehler:', e?.message || String(e)),
      );
    }, options);
    console.log(
      `[wa-reminder] Scheduler gestartet → Täglich ${cfg.time} (${tz}). Expression: ${exp}`,
    );
  };
  void boot();
}

export function rescheduleWhatsApp() {
  if (_activeTask) {
    _activeTask.stop();
    _activeTask = null;
  }
  lastRunDateKey = null;
  startWhatsAppScheduler();
}
