import React, { useEffect, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import api from '../../lib/api';

export default function PlayerProfile() {
  const { user, refresh } = useAuth();
  const [profile, setProfile] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const res = await api.get('/players/me/profile');
      setProfile(res.data);
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="card text-gray-400">Lädt...</div>;

  const pp = profile || user?.playerProfile;
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-ofc-grayDark">Mein Profil</h2>
        <p className="text-gray-500 mt-1">Deine Stammdaten - Änderungen bitte bei deinem Trainer/Admin melden.</p>
      </div>

      <div className="card">
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <dt className="text-gray-500">Name</dt>
            <dd className="font-semibold text-lg mt-1">{user?.name}</dd>
          </div>
          <div>
            <dt className="text-gray-500">E-Mail</dt>
            <dd className="font-medium mt-1">{user?.email}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Position</dt>
            <dd className="mt-1">
              {pp?.position ? <span className="badge-red text-sm">{pp.position}</span> : '–'}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Geburtsdatum</dt>
            <dd className="font-medium mt-1">
              {pp?.birthDate ? new Date(pp.birthDate).toLocaleDateString('de-DE') : '–'}
            </dd>
          </div>
          <div>
            <dt className="text-gray-500">Größe</dt>
            <dd className="font-medium mt-1">{pp?.heightCm ? `${pp.heightCm} cm` : '–'}</dd>
          </div>
          <div>
            <dt className="text-gray-500">Gewicht</dt>
            <dd className="font-medium mt-1">{pp?.weightKg ? `${pp.weightKg} kg` : '–'}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
