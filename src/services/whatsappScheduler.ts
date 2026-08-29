import cron from 'node-cron';
import { startOfDay, formatInTimeZone, toZonedTime } from 'date-fns-tz';
import { prisma } from '../lib/prisma.js';
import {
  loadWAConfig,
  sendWhatsApp,
  normalizePhone,
  WhatsAppConfig,
} from './whatsappService.js';

// Speicher: Ob wir heute schon einen Durchlauf gemacht haben
// Damit Railway Restart (oft) nicht einen 2. Versand auslöst
let lastRunDateKey: string | null = null;

export async function runDailyReminderCheck(opts: { dryRun?: boolean; force?: boolean } = {}) {
  const cfg = await loadWAConfig();
  if (!opts.force && !cfg.enabled) {
    return { skipped: true, reason: 'WhatsApp-Erinnerungen deaktiviert' };
  }

  const todayKey = formatInTimeZone(new Date(), cfg.timezone, 'yyyy-MM-dd');
  if (!opts.force && lastRunDateKey === todayKey) {
    return { skipped: true, reason: `Heute (${todayKey}) bereits ausgeführt (Start-Neustart-Schutz)` };
  }
  lastRunDateKey = todayKey;

  const zonedNow = toZonedTime(new Date(), cfg.timezone);
  const todayStart = startOfDay(zonedNow);

  // Alle aktiven Fragen vorberechnen
  const activeQuestions = await prisma.dailyQuestion.findMany({
    where: { active: true },
    select: { id: true },
  });
  if (activeQuestions.length === 0) {
    return { skipped: true, reason: 'Keine aktiven täglichen Fragen – Versand übersprungen.' };
  }

  // Alle Spieler mit Telefonnummer
  const players = await prisma.user.findMany({
    where: { role: 'PLAYER' },
    include: { playerProfile: { select: { id: true, phoneNumber: true } } },
  });

  const results: {
    id: string;
    name: string;
    phone: string;
    status: 'sent' | 'already_done' | 'no_phone' | 'failed';
    error?: string;
    sid?: string;
  }[] = [];

  for (const p of players) {
    const phone = normalizePhone(p.playerProfile?.phoneNumber);
    if (!phone) {
      results.push({ id: p.id, name: p.name, phone: '(keine)', status: 'no_phone' });
      continue;
    }

    const session = await prisma.dailyAnswerSession.findUnique({
      where: { playerId_date: { playerId: p.id, date: todayStart } },
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
    const res = await sendWhatsApp(cfg, phone, msgText);
    results.push({
      id: p.id,
      name: p.name,
      phone,
      status: res.ok ? 'sent' : 'failed',
      sid: res.sid,
      error: res.error,
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
    timezone: cfg.timezone,
    config: { enabled: cfg.enabled, time: cfg.time },
    stats,
    results,
  };
}

function renderTemplate(cfg: WhatsAppConfig, playerName: string) {
  return (cfg.message || 'Hallo {{name}}!').replace(/\{\{\s*name\s*\}\}/g, playerName);
}

// Eindeutige Cron-Expression bauen anhand Zeit + Timezone
// node-cron: "Minute Stunde * * *"
function scheduleExpression(time: string): string | null {
  const m = /^(\d{1,2}):(\d{1,2})$/.exec(time);
  if (!m) return null;
  const hh = Math.max(0, Math.min(23, parseInt(m[1], 10)));
  const mm = Math.max(0, Math.min(59, parseInt(m[2], 10)));
  return `${mm} ${hh} * * *`;
}

let _activeTask: cron.ScheduledTask | null = null;
let _currentTime: string = '';

export function startWhatsAppScheduler() {
  const boot = async () => {
    const cfg = await loadWAConfig();
    const exp = scheduleExpression(cfg.time || '09:00');
    if (!cfg.enabled || !exp) {
      console.log(`[wa-reminder] Scheduler nicht gestartet (enabled=${cfg.enabled}, time="${cfg.time}")`);
      return;
    }
    if (_activeTask) {
      _activeTask.stop();
      _activeTask = null;
    }
    _currentTime = cfg.time;
    _activeTask = cron.schedule(
      exp,
      () => {
        void runDailyReminderCheck().catch((e) =>
          console.error('[wa-reminder] Laufzeitfehler:', e?.message || String(e)),
        );
      },
      { scheduled: true, timezone: cfg.timezone },
    );
    console.log(
      `[wa-reminder] Scheduler gestartet → Täglich ${cfg.time} (${cfg.timezone}). Expression: ${exp}`,
    );
  };
  void boot();
}

export function rescheduleWhatsApp() {
  if (_activeTask) {
    _activeTask.stop();
    _activeTask = null;
  }
  lastRunDateKey = null; // Reset: Damit beim nächsten Reschedule ggf. sofort laufen kann
  startWhatsAppScheduler();
}
