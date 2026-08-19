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

export default function AdminSettings() {
  const [users, setUsers] = useState<any[]>([]);
  const [form, setForm] = useState<CreateUser>({ email: '', name: '', password: '', role: 'STAFF' });
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  const [logoPreview, setLogoPreview] = useState<string>('');
  const [faviconPreview, setFaviconPreview] = useState<string>('');
  const [appTitle, setAppTitle] = useState('');
  const [appName, setAppName] = useState('');

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
    } catch (e: any) {
      setErr(e.response?.data?.error || 'Fehler beim Laden der Einstellungen');
    }
  }
  useEffect(() => { load(); }, []);

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
    </div>
  );
}
