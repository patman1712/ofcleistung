import { useState, useEffect } from 'react';
import api from '../../lib/api';
import { z } from 'zod';

const STAFF_ROLES = ['ADMIN', 'STAFF'] as const;

const createUserSchema = z.object({
  email: z.string().email('Bitte gültige E-Mail').min(3),
  name: z.string().min(2, 'Name mindestens 2 Zeichen'),
  password: z.string().min(6, 'Passwort min. 6 Zeichen'),
  role: z.enum(STAFF_ROLES),
});
type CreateUser = z.infer<typeof createUserSchema>;

const WA_KEYS = {
  ENABLED: 'wa_enabled',
  SID: 'wa_accountSid',
  AUTH: 'wa_authToken',
  FROM: 'wa_from',
  TIME: 'wa_time',
  MESSAGE: 'wa_message',
  TIMEZONE: 'wa_timezone',
} as const;

interface WADraft {
  enabled: boolean;
  accountSid: string;
  authToken: string;
  from: string;
  time: string;
  message: string;
  timezone: string;
}

const WA_DRAFT_DEFAULT: WADraft = {
  enabled: false,
  accountSid: '',
  authToken: '',
  from: 'whatsapp:+49151000000000',
  time: '09:00',
  message: 'Hallo {{name}}! Bitte nicht vergessen – den täglichen OFC Fragebogen auszufüllen.\nDanke! 💪⚽',
  timezone: 'Europe/Berlin',
};

export default function AdminSettings() {
  const [users, setUsers] = useState<any[]>([]);
  const [form, setForm] = useState<CreateUser>({ email: '', name: '', password: '', role: 'STAFF' });
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [logoPreview, setLogoPreview] = useState<string>('');
  const [faviconPreview, setFaviconPreview] = useState<string>('');
  const [appTitle, setAppTitle] = useState('');
  const [appName, setAppName] = useState('');

  const [wa, setWa] = useState<WADraft>(WA_DRAFT_DEFAULT);
  const [waDirty, setWaDirty] = useState(false);
  const [waSaving, setWaSaving] = useState(false);
  const [testTo, setTestTo] = useState('');
  const [testResult, setTestResult] = useState<any>(null);
  const [runNowLoading, setRunNowLoading] = useState(false);
  const [runNowResult, setRunNowResult] = useState<any>(null);

  async function load() {
    try {
      setErr(null);
      const [uRes, sRes] = await Promise.all([
        api.get('/users'),
        api.get('/settings'),
      ]);
      setUsers(uRes.data);
      const s = sRes.data || {};
      setLogoPreview(s.logo || '');
      setFaviconPreview(s.favicon || '');
      setAppTitle(s.appTitle || '');
      setAppName(s.appName || '');
      setWa({
        enabled: s[WA_KEYS.ENABLED] === 'true',
        accountSid: s[WA_KEYS.SID] || '',
        authToken: s[WA_KEYS.AUTH] || '',
        from: s[WA_KEYS.FROM] || WA_DRAFT_DEFAULT.from,
        time: s[WA_KEYS.TIME] || WA_DRAFT_DEFAULT.time,
        message: s[WA_KEYS.MESSAGE] || WA_DRAFT_DEFAULT.message,
        timezone: s[WA_KEYS.TIMEZONE] || WA_DRAFT_DEFAULT.timezone,
      });
      setWaDirty(false);
    } catch (e: any) {
      setErr(e.response?.data?.error || 'Fehler beim Laden der Einstellungen');
    }
  }
  useEffect(() => { load(); }, []);

  const setWaField = <K extends keyof WADraft>(k: K, v: WADraft[K]) => {
    setWa((prev) => ({ ...prev, [k]: v }));
    setWaDirty(true);
  };

  async function saveWAConfig() {
    setWaSaving(true); setOkMsg(null); setErr(null);
    try {
      const values: Record<string, string | boolean> = {
        [WA_KEYS.ENABLED]: wa.enabled,
        [WA_KEYS.SID]: wa.accountSid.trim(),
        [WA_KEYS.AUTH]: wa.authToken.trim(),
        [WA_KEYS.FROM]: wa.from.trim() || '',
        [WA_KEYS.TIME]: wa.time,
        [WA_KEYS.MESSAGE]: wa.message,
        [WA_KEYS.TIMEZONE]: wa.timezone,
      };
      await api.post('/settings/whatsapp/save-bulk', { values });
      setWaDirty(false);
      setOkMsg('💾 WhatsApp-Konfiguration gespeichert & Scheduler neu gestartet ✅');
    } catch (e: any) {
      setErr(e.response?.data?.error || 'Fehler beim Speichern der WhatsApp-Konfiguration');
    } finally { setWaSaving(false); }
  }

  async function sendTestWAMessage() {
    setErr(null); setOkMsg(null); setTestResult(null);
    try {
      const res = await api.post('/settings/whatsapp/test-send', { to: testTo });
      setTestResult(res.data);
      if (res.data?.ok) setOkMsg('✅ Test-Nachricht versendet (prüfe WhatsApp!)');
      else setErr('❌ Test fehlgeschlagen: ' + (res.data?.error || 'unbekannt'));
    } catch (e: any) {
      setTestResult(e.response?.data || { error: String(e) });
      setErr(e.response?.data?.error || String(e));
    }
  }

  async function runReminderNow(dryRun: boolean) {
    setRunNowLoading(true); setRunNowResult(null); setErr(null); setOkMsg(null);
    try {
      const res = await api.post('/settings/whatsapp/run-now', { dryRun, force: true });
      setRunNowResult(res.data);
      const d = res.data || {};
      setOkMsg(dryRun
        ? `📋 Dry-Run: ${d.stats?.sent || 0} "versendet", ${d.stats?.already_done || 0} erledigt, ${d.stats?.no_phone || 0} ohne Nummer, ${d.stats?.failed || 0} Fehler`
        : `📤 Versendet: ${d.stats?.sent || 0} SMS, ${d.stats?.already_done || 0} schon erledigt, ${d.stats?.failed || 0} Fehler`);
    } catch (e: any) {
      setErr(e.response?.data?.error || String(e));
    } finally { setRunNowLoading(false); }
  }

  async function onAddSubmit(e: any) {
    e.preventDefault();
    setErr(null); setOkMsg(null);
    try {
      const d = createUserSchema.parse(form);
      await api.post('/users', d);
      setForm({ email: '', name: '', password: '', role: 'STAFF' });
      setOkMsg('✅ Nutzer erfolgreich angelegt!');
      load();
    } catch (er: any) {
      if (er?.issues) setErr(er.issues.map((i: any) => i.message).join(', '));
      else setErr(er.response?.data?.error || 'Fehler beim Anlegen');
    }
  }

  async function deleteUser(id: string, name: string) {
    if (!confirm(`Nutzer "${name}" wirklich löschen?`)) return;
    setErr(null);
    try {
      await api.delete(`/users/${id}`);
      setOkMsg(`🗑️ Nutzer ${name} gelöscht!`);
      load();
    } catch (er: any) {
      setErr(er.response?.data?.error || 'Fehler beim Löschen');
    }
  }

  async function changeRole(id: string, role: string, name: string) {
    setErr(null);
    try {
      await api.put(`/users/${id}`, { role });
      setOkMsg(`👤 Rolle von ${name} geändert → ${role}`);
      load();
    } catch (er: any) {
      setErr(er.response?.data?.error || 'Fehler bei Rollenänderung');
    }
  }

  async function uploadFile(key: 'logo' | 'favicon', e: React.ChangeEvent<HTMLInputElement>, previewSetter: (v: string) => void) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) {
      setErr('⚠️ Datei zu groß! Max. 5MB erlaubt.');
      return;
    }
    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = reader.result as string;
      previewSetter(dataUrl);
      setErr(null);
      try {
        await api.put(`/settings/${key}`, { value: dataUrl });
        setOkMsg(`💾 ${key.toUpperCase()} erfolgreich gespeichert! (Seite neu laden für Vorschau im Header)`);
      } catch (er: any) {
        const detail = er?.response?.data?.error || er?.message || String(er || 'Unbekannter Fehler');
        const status = er?.response?.status;
        setErr(`❌ Fehler beim Speichern des ${key.toUpperCase()}: ${status ? `HTTP ${status} - ` : ''}${detail}`);
      }
    };
    reader.onerror = () => setErr('Datei konnte nicht gelesen werden (FileReader Error)');
    reader.readAsDataURL(f);
  }

  async function saveText(key: 'appTitle' | 'appName', val: string) {
    setErr(null);
    try {
      await api.put(`/settings/${key}`, { value: val });
      setOkMsg(`💾 ${key} gespeichert!`);
    } catch (er: any) {
      setErr(er.response?.data?.error || 'Fehler');
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-800 mb-2">⚙️ Einstellungen</h1>
        <p className="text-gray-600">Verwalte Admin- &amp; Staff-Teammitglieder sowie Branding.</p>
      </div>

      {err && (
        <div className="bg-red-50 border-2 border-red-200 text-red-800 rounded-lg p-4 font-medium">{err}</div>
      )}
      {okMsg && (
        <div className="bg-green-50 border-2 border-green-200 text-green-800 rounded-lg p-4 font-medium">{okMsg}</div>
      )}

      {/* SECTION 1: ADMIN / STAFF TEAM */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-6">
        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
          👥 Admin- &amp; Staff-Team
        </h2>
        <p className="text-gray-600 text-sm -mt-4">
          <span className="inline-block bg-red-100 text-red-700 px-2 py-0.5 rounded mr-2 font-semibold">Admin</span>
          darf alles &nbsp;·&nbsp;
          <span className="inline-block bg-blue-100 text-blue-700 px-2 py-0.5 rounded mr-2 font-semibold">Staff</span>
          sieht Auswertungen, Trainings, Fragen und Warnsignale – KEINE Rechte: Spieler anlegen/löschen, Einstellungen verändern.
        </p>

        <div className="overflow-x-auto border border-gray-200 rounded-xl">
          <table className="w-full text-sm">
            <thead className="bg-ofc-red text-white">
              <tr>
                <th className="px-4 py-3 text-left font-semibold">Name</th>
                <th className="px-4 py-3 text-left font-semibold">E-Mail</th>
                <th className="px-4 py-3 text-left font-semibold">Rolle</th>
                <th className="px-4 py-3 text-right font-semibold">Aktionen</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-500 italic">
                  Noch keine Team-Mitglieder angelegt.
                </td></tr>
              )}
              {users.map(u => (
                <tr key={u.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{u.name}</td>
                  <td className="px-4 py-3 text-gray-600">{u.email}</td>
                  <td className="px-4 py-3">
                    <select
                      value={u.role}
                      onChange={(e) => changeRole(u.id, e.target.value, u.name)}
                      className="border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm focus:border-ofc-red focus:ring-2 focus:ring-ofc-red/20 outline-none"
                    >
                      <option value="ADMIN">Admin</option>
                      <option value="STAFF">Staff</option>
                    </select>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => deleteUser(u.id, u.name)}
                      className="text-red-600 hover:bg-red-50 hover:text-red-700 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
                    >
                      🗑️ Löschen
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="pt-5 border-t border-gray-200">
          <h3 className="font-bold text-gray-800 mb-3">➕ Neuen Admin/Staff anlegen</h3>
          <form onSubmit={onAddSubmit} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
            <input
              placeholder="Name (z.B. Max Mustermann)"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="border border-gray-300 rounded-lg px-3.5 py-2.5 focus:border-ofc-red focus:ring-2 focus:ring-ofc-red/20 outline-none"
              required
            />
            <input
              type="email"
              placeholder="E-Mail"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value.toLowerCase() })}
              className="border border-gray-300 rounded-lg px-3.5 py-2.5 focus:border-ofc-red focus:ring-2 focus:ring-ofc-red/20 outline-none"
              required
            />
            <input
              type="password"
              placeholder="Passwort (min. 6 Zeichen)"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="border border-gray-300 rounded-lg px-3.5 py-2.5 focus:border-ofc-red focus:ring-2 focus:ring-ofc-red/20 outline-none"
              required
              minLength={6}
            />
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value as any })}
              className="border border-gray-300 rounded-lg px-3.5 py-2.5 focus:border-ofc-red focus:ring-2 focus:ring-ofc-red/20 outline-none bg-white"
            >
              <option value="STAFF">Staff</option>
              <option value="ADMIN">Admin</option>
            </select>
            <button
              type="submit"
              className="bg-ofc-red hover:bg-ofc-redDark active:scale-[.98] text-white font-semibold px-5 py-2.5 rounded-lg transition-colors shadow-sm"
            >
              ➕ Anlegen
            </button>
          </form>
        </div>
      </section>

      {/* SECTION 2: BRANDING */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-6">
        <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
          🎨 Branding: Logo / Favicon / Titel
        </h2>
        <p className="text-gray-600 text-sm -mt-4">
          Lade dein Vereins-Logo hoch – erscheint überall: Login, Header, Homescreen-Symbol, Browser-Tab.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* LOGO */}
          <div className="space-y-3 p-5 border border-gray-200 rounded-xl bg-gray-50/50">
            <h3 className="font-bold text-gray-800 flex items-center gap-2">
              🟥 Logo (Header / Login / Footer)
            </h3>
            <div className="flex items-center gap-4 min-h-[96px] bg-white rounded-lg border border-gray-200 p-4">
              {logoPreview ? (
                <img src={logoPreview} alt="Logo" className="h-20 w-20 object-contain" />
              ) : (
                <div className="h-20 w-20 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center text-gray-400 text-xs gap-1">
                  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                  </svg>
                  Logo
                </div>
              )}
              <div className="flex-1 space-y-2">
                <label className="block">
                  <span className="bg-white border-2 border-ofc-red text-ofc-red hover:bg-ofc-red hover:text-white transition-colors inline-block font-semibold px-4 py-2 rounded-lg cursor-pointer text-sm w-full text-center">
                    📷 Logo hochladen (PNG/JPG/SVG)
                  </span>
                  <input
                    type="file"
                    accept="image/*,.svg"
                    className="hidden"
                    onChange={(e) => uploadFile('logo', e, setLogoPreview)}
                  />
                </label>
                {logoPreview && (
                  <button
                    onClick={() => uploadFile('logo', { target: { files: [new File([new Blob()], '')] } } as any, () => {})}
                    className="w-full text-xs text-gray-500 hover:text-ofc-red underline"
                    style={{display:'none'}}
                  ></button>
                )}
              </div>
            </div>
            <p className="text-xs text-gray-500">
              Empfohlen: Quadratisch, mind. 256×256, transparenter Hintergrund (PNG oder SVG).
            </p>
          </div>

          {/* FAVICON */}
          <div className="space-y-3 p-5 border border-gray-200 rounded-xl bg-gray-50/50">
            <h3 className="font-bold text-gray-800 flex items-center gap-2">
              📌 Favicon (Browser-Tab / Lesezeichen)
            </h3>
            <div className="flex items-center gap-4 min-h-[96px] bg-white rounded-lg border border-gray-200 p-4">
              {faviconPreview ? (
                <img src={faviconPreview} alt="Favicon" className="h-12 w-12 object-contain" />
              ) : (
                <div className="h-12 w-12 border-2 border-dashed border-gray-300 rounded-lg flex flex-col items-center justify-center text-gray-400 text-xs">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"/>
                  </svg>
                  ico
                </div>
              )}
              <div className="flex-1 space-y-2">
                <label className="block">
                  <span className="bg-white border-2 border-ofc-red text-ofc-red hover:bg-ofc-red hover:text-white transition-colors inline-block font-semibold px-4 py-2 rounded-lg cursor-pointer text-sm w-full text-center">
                    🖼️ Favicon hochladen
                  </span>
                  <input
                    type="file"
                    accept="image/*,.ico"
                    className="hidden"
                    onChange={(e) => uploadFile('favicon', e, setFaviconPreview)}
                  />
                </label>
              </div>
            </div>
            <p className="text-xs text-gray-500">
              Empfohlen: Quadratisch, 32×32 oder 512×512 Pixel (PNG oder ICO).
            </p>
          </div>
        </div>

        {/* TEXT FIELDS: App Title + App Name */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-gray-200">
          <div className="space-y-2">
            <label className="font-semibold text-gray-800 block">🏷️ App-Name (Header groß)</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={appName}
                onChange={(e) => setAppName(e.target.value)}
                placeholder="z.B. OFC Leistungsdiagnostik"
                className="flex-1 border border-gray-300 rounded-lg px-3.5 py-2.5 focus:border-ofc-red focus:ring-2 focus:ring-ofc-red/20 outline-none"
              />
              <button
                onClick={() => saveText('appName', appName)}
                className="bg-ofc-red hover:bg-ofc-redDark text-white font-semibold px-5 py-2.5 rounded-lg transition-colors"
              >💾 Speichern</button>
            </div>
            <p className="text-xs text-gray-500">Erscheint in der Kopfzeile neben dem Logo.</p>
          </div>
          <div className="space-y-2">
            <label className="font-semibold text-gray-800 block">🔖 Browser-Titel / Tab</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={appTitle}
                onChange={(e) => setAppTitle(e.target.value)}
                placeholder="z.B. OFC Leistungsdiagnostik"
                className="flex-1 border border-gray-300 rounded-lg px-3.5 py-2.5 focus:border-ofc-red focus:ring-2 focus:ring-ofc-red/20 outline-none"
              />
              <button
                onClick={() => saveText('appTitle', appTitle)}
                className="bg-ofc-red hover:bg-ofc-redDark text-white font-semibold px-5 py-2.5 rounded-lg transition-colors"
              >💾 Speichern</button>
            </div>
            <p className="text-xs text-gray-500">Wird als Tab-Titel im Browser angezeigt.</p>
          </div>
        </div>

        <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
          💡 <strong>Hinweis:</strong> Damit Änderungen (neues Logo, Titel) überall sichtbar werden, bitte einmal die Seite komplett neu laden (Strg+F5). Bei Favicon wird der Browser-Cache manchmal erst nach Schließen + Neuöffnen des Tabs aktualisiert.
        </div>
      </section>

      {/* SECTION 3: WHATSAPP ERINNERUNGEN */}
      <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-6">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-xl font-bold text-gray-800 flex items-center gap-2">
              💬 WhatsApp-Erinnerungen (täglicher Fragebogen)
            </h2>
            <p className="text-gray-600 text-sm mt-1">
              Spieler erhalten automatisch eine WhatsApp-Nachricht, wenn sie den täglichen Fragebogen bis zu einer festen Uhrzeit <strong>noch nicht</strong> ausgefüllt haben.
            </p>
          </div>
          <label className="inline-flex items-center gap-3 bg-gray-50 rounded-xl px-5 py-3 border border-gray-200">
            <input
              type="checkbox"
              checked={wa.enabled}
              onChange={(e) => setWaField('enabled', e.target.checked)}
              className="h-6 w-6 accent-ofc-red cursor-pointer"
            />
            <div>
              <div className="font-bold text-gray-800">{wa.enabled ? '✅ Aktiviert' : '⏸️ Deaktiviert'}</div>
              <div className="text-xs text-gray-500">Scheduler läuft nur bei Häkchen</div>
            </div>
          </label>
        </div>

        {/* Zeile 1: Twilio Credentials */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="label">Twilio Account SID</label>
            <input
              className="input font-mono text-sm"
              placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              value={wa.accountSid}
              onChange={(e) => setWaField('accountSid', e.target.value)}
            />
          </div>
          <div>
            <label className="label">Twilio Auth Token</label>
            <input
              type="password"
              className="input font-mono text-sm"
              placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
              value={wa.authToken}
              onChange={(e) => setWaField('authToken', e.target.value)}
            />
          </div>
          <div>
            <label className="label">Absender-Nummer (Twilio WhatsApp)</label>
            <input
              className="input font-mono text-sm"
              placeholder="whatsapp:+4915112345678"
              value={wa.from}
              onChange={(e) => setWaField('from', e.target.value)}
            />
          </div>
        </div>

        {/* Zeile 2: Zeit + Timezone + Save Button */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="label">⏰ Erinnerungszeit (täglich)</label>
            <input
              type="time"
              className="input"
              value={wa.time}
              onChange={(e) => setWaField('time', e.target.value)}
            />
            <p className="text-xs text-gray-500 mt-1">
              Beispiel: <code>09:00</code> = jeden Morgen 9 Uhr (Zeitzone unten)
            </p>
          </div>
          <div>
            <label className="label">🌍 Zeitzone</label>
            <input
              className="input font-mono text-sm"
              value={wa.timezone}
              onChange={(e) => setWaField('timezone', e.target.value)}
              placeholder="Europe/Berlin"
            />
            <p className="text-xs text-gray-500 mt-1">
              IANA-Format – Deutschland ist <code>Europe/Berlin</code>
            </p>
          </div>
          <div className="flex flex-col justify-end gap-2">
            <button
              onClick={saveWAConfig}
              disabled={waSaving || !waDirty}
              className={`btn-primary text-lg py-3 ${(!waDirty || waSaving) ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              {waSaving ? '💾 Speichert…' : waDirty ? '💾 Änderungen speichern & Scheduler neustarten' : '✅ Konfiguration gespeichert'}
            </button>
          </div>
        </div>

        {/* Zeile 3: Nachrichtentext */}
        <div>
          <label className="label">📝 Nachrichtentext (Platzhalter: <code className="bg-gray-100 px-1.5 py-0.5 rounded">{'{{name}}'}</code>)</label>
          <textarea
            rows={4}
            className="input font-mono text-sm"
            value={wa.message}
            onChange={(e) => setWaField('message', e.target.value)}
            placeholder={`Hallo {{name}}! Bitte den täglichen Fragebogen ausfüllen!`}
          />
          <p className="text-xs text-gray-500 mt-1">
            <code>{'{{name}}'}</code> wird automatisch durch den Namen des Spielers ersetzt.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-gray-200">
          {/* Test-Nachricht senden */}
          <div className="p-5 border border-gray-200 rounded-xl bg-gray-50/50 space-y-3">
            <h3 className="font-bold text-gray-800 flex items-center gap-2">
              🧪 Test: WhatsApp an eigene Nummer senden
            </h3>
            <div className="flex gap-2">
              <input
                className="input font-mono text-sm"
                placeholder="+49 151 12345678"
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
                inputMode="tel"
              />
              <button
                onClick={sendTestWAMessage}
                disabled={!testTo || !wa.accountSid || !wa.authToken || !wa.from}
                className={`btn-primary ${(!testTo || !wa.accountSid) ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                Senden
              </button>
            </div>
            {testResult && (
              <pre className="text-xs bg-gray-900 text-gray-100 p-3 rounded-lg overflow-x-auto">
{JSON.stringify(testResult, null, 2)}
              </pre>
            )}
            <p className="text-xs text-gray-500">
              💡 Damit Test-Nachrichten funktionieren: <strong>Creds oben eintragen & Speichern</strong>. Bei Twilio-Sandbox muss die Nummer vorher „gejoined“ sein.
            </p>
          </div>

          {/* Jetzt-Run Dry Run / Echt */}
          <div className="p-5 border border-gray-200 rounded-xl bg-gray-50/50 space-y-3">
            <h3 className="font-bold text-gray-800 flex items-center gap-2">
              ▶️ Reminder-Jetzt-Starten (Test &amp; Echt)
            </h3>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => runReminderNow(true)}
                className="btn-secondary"
              >
                📋 Dry-Run (nur anzeigen – nichts gesendet)
              </button>
              <button
                onClick={() => {
                  if (!confirm('ECHT-versand: Alle Spieler ohne heutige Antwort bekommen JETZT WhatsApp!\nSicher?')) return;
                  runReminderNow(false);
                }}
                disabled={!wa.enabled || !wa.accountSid || runNowLoading}
                className={`btn-danger ${(!wa.enabled || runNowLoading) ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                {runNowLoading ? '⏳ Läuft…' : '📤 Echt-Versand starten'}
              </button>
            </div>
            {runNowResult && (
              <div className="max-h-64 overflow-auto bg-white border border-gray-200 rounded-lg p-3">
                <div className="text-xs font-mono">
                  <div className="mb-2 pb-2 border-b border-gray-200 font-bold text-gray-700">
                    Statistik:
                    <span className="ml-3 text-green-700">sent: {runNowResult.stats?.sent ?? 0}</span>
                    <span className="ml-3 text-blue-700">erledigt: {runNowResult.stats?.already_done ?? 0}</span>
                    <span className="ml-3 text-gray-500">keine#: {runNowResult.stats?.no_phone ?? 0}</span>
                    <span className="ml-3 text-red-700">fehler: {runNowResult.stats?.failed ?? 0}</span>
                  </div>
                  <pre className="whitespace-pre-wrap break-all text-[11px]">
{JSON.stringify(runNowResult.results ?? runNowResult, null, 2).slice(0, 8000)}
                  </pre>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800 space-y-2">
          <div><strong>💡 Einrichtung Twilio WhatsApp (kostenlos testbar):</strong></div>
          <ol className="list-decimal ml-5 space-y-1">
            <li>Account auf <a className="underline font-semibold" href="https://www.twilio.com/try-twilio" target="_blank" rel="noreferrer">twilio.com/try-twilio</a> erstellen</li>
            <li>In der Twilio-Console: <strong>Develop → Messaging → Try it out → Send a WhatsApp message</strong></li>
            <li>Sandbox-Nummer (z.B. <code>whatsapp:+14155238886</code>) als Absender eintragen</li>
            <li>Test-Nummer bei Sandbox anmelden: Twilio sagt, welche Nachricht an die Sandbox gesendet werden muss (z.B. <code>join <i>word</i></code>)</li>
            <li>SID + Auth Token (Kopfbereich Console) hier eintragen → Speichern → Test senden</li>
          </ol>
          <div className="pt-2 mt-2 border-t border-blue-200">
            <strong>⚠️ Railway Achtung:</strong> Damit der Scheduler <em>zuverlässig</em> läuft: In Railway unter <code>Settings → Sleep Mode</code> den Sleep <strong>ausschalten</strong> (Premium-Plan), sonst schläft die App nach Inaktivität und die tägliche WhatsApp-Nachricht wird nicht ausgelöst.
          </div>
        </div>
      </section>
    </div>
  );
}
