import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { readAll } from '@/components/qa/paging';
import InspectionDetail from '@/pages/InspectionDetail';
import { Loader2 } from 'lucide-react';
export default function VisiByCode() {
  const { code } = useParams();
  const [visiId, setVisiId] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      try {
        const all = await readAll('Visi');
        const found = all.find((v) => v.code === code);
        if (found) setVisiId(found.id);
      } catch {} finally { setLoading(false); }
    })();
  }, [code]);
  if (loading) return <div className="flex h-full items-center justify-center"><Loader2 className="animate-spin text-slate-300" size={32} /></div>;
  if (!visiId) return <div className="p-8 text-center text-sm text-slate-500">No Visi with code {code}</div>;
  return <InspectionDetail key={visiId} />;
}