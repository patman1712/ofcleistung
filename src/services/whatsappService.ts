import twilio from 'twilio';
import { prisma } from '../lib/prisma.js';

// WhatsApp Setting-Keys (im Setting-Modell per Key/Value abgelegt)
export const WA_KEYS = {
  ENABLED: 'wa_enabled', // 'true' | 'false'
  SID: 'wa_accountSid', // Twilio Account SID
  AUTH: 'wa_authToken', // Twilio Auth Token
  FROM: 'wa_from', // Absender: Twilio WhatsApp Nummer im Format "whatsapp:+49..."
  TIME: 'wa_time', // Erinnerungszeit: Format "HH:MM" (Berlin / CET tzt UTC+1 im Winter, UTC+2 Sommerzeit)
  MESSAGE: 'wa_message', // Template-Text, Platzhalter: {{name}}
  TIMEZONE: 'wa_timezone', // Default: "Europe/Berlin"
} as const;

export interface WhatsAppConfig {
  enabled: boolean;
  accountSid: string;
  authToken: string;
  from: string;
  time: string; // "HH:MM"
  message: string;
  timezone: string;
}

// Telefonnummer normalisieren: Alles außer + und Zahlen weg, führende 00 zu +, Ländercode ergänzen DE (falls nötig)
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let s = raw.replace(/[^\d+]/g, ''); // alles außer + und Ziffern entfernen
  if (!s) return null;
  if (s.startsWith('00')) s = '+' + s.slice(2); // 0049... → +49...
  if (/^0[1-9]/.test(s)) s = '+49' + s.slice(1); // führende 0 (Deutschland) → +49
  if (!s.startsWith('+')) s = '+49' + s; // anderes ohne + → auch DE
  // Mindestlänge: + Ländercode (2) + 9 Stellen = 12
  if (s.length < 8) return null;
  return s;
}

export async function loadWAConfig(): Promise<WhatsAppConfig> {
  const rows = await prisma.setting.findMany({
    where: { key: { in: Object.values(WA_KEYS) } },
  });
  const map: Record<string, string> = {};
  for (const r of rows) map[r.key] = r.value;

  return {
    enabled: map[WA_KEYS.ENABLED] === 'true',
    accountSid: map[WA_KEYS.SID] || '',
    authToken: map[WA_KEYS.AUTH] || '',
    from: map[WA_KEYS.FROM] || '',
    time: map[WA_KEYS.TIME] || '09:00',
    message:
      map[WA_KEYS.MESSAGE] ||
      'Hallo {{name}}! Bitte nicht vergessen – den täglichen Fragebogen auszufüllen.\nDanke! 💪⚽',
    timezone: map[WA_KEYS.TIMEZONE] || 'Europe/Berlin',
  };
}

let _twilioClient: twilio.Twilio | null = null;
export function getTwilioClient(cfg: WhatsAppConfig): twilio.Twilio | null {
  if (!cfg.accountSid || !cfg.authToken) return null;
  if (_twilioClient) return _twilioClient;
  try {
    _twilioClient = twilio(cfg.accountSid, cfg.authToken);
    return _twilioClient;
  } catch {
    return null;
  }
}
// Cache zurücksetzen (wenn Credentials geupdated werden im Admin)
export function resetTwilioCache() {
  _twilioClient = null;
}

export async function sendWhatsApp(
  cfg: WhatsAppConfig,
  toPhoneRaw: string,
  text: string,
): Promise<{ ok: boolean; sid?: string; error?: string }> {
  if (!cfg.accountSid || !cfg.authToken || !cfg.from) {
    return { ok: false, error: 'WhatsApp nicht konfiguriert (fehlen SID/Token/Absender)' };
  }
  const to = normalizePhone(toPhoneRaw);
  if (!to) return { ok: false, error: 'Ungültige Telefonnummer' };
  const client = getTwilioClient(cfg);
  if (!client) return { ok: false, error: 'Twilio-Client konnte nicht initialisiert werden' };
  try {
    const msg = await client.messages.create({
      from: cfg.from, // z.B. "whatsapp:+14155238886"
      to: `whatsapp:${to}`,
      body: text.slice(0, 1600), // max. 1600 Zeichen
    });
    return { ok: true, sid: msg.sid };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
}
