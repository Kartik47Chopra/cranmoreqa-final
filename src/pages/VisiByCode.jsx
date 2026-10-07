import React, { useEffect, useState } from 'react';
import { useParams, Navigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { Loader2 } from 'lucide-react';
export default function VisiByCode() {
  const { code } = useParams();
  const [visiId, setVisiId] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      try {
        const found = (await base44.entities.Visi.filter({ code }))[0];
        if (found) setVisiId(found.id);
      } catch {} finally { setLoading(false); }
    })();
  }, [code]);
  if (loading) return <div className="flex h-full items-center justify-center"><Loader2 className="animate-spin text-slate-300" size={32} /></div>;
  if (!visiId) return <div className="p-8 text-center text-sm text-slate-500">No Visi with code {code}</div>;
  return <Navigate to={`/inspection/${visiId}`} replace />;
}