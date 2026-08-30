import React, { useState, useEffect } from 'react';
import { apiRequest } from '../../../../utils/api';

interface CollectionRecord {
  targetId: string;
  address: string;
  wasteType: 'DRY' | 'WET' | 'E_WASTE' | 'OTHER';
  status: 'COLLECTED' | 'MISSED' | 'SKIPPED';
  collectedAt: string | null;
  binType: string;
}

const WASTE_THEME: Record<string, { label: string; icon: string; text: string; bg: string }> = {
  DRY: { label: 'Dry Waste', icon: '📦', text: 'text-amber-700', bg: 'bg-amber-50 border-amber-200' },
  WET: { label: 'Wet Waste', icon: '🥬', text: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
  E_WASTE: { label: 'E-Waste', icon: '💻', text: 'text-purple-700', bg: 'bg-purple-50 border-purple-200' },
  OTHER: { label: 'Other', icon: '🗑️', text: 'text-slate-700', bg: 'bg-slate-50 border-slate-200' },
};

export default function CitizenHistoryPage() {
  const [history, setHistory] = useState<CollectionRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    fetchCollectionHistory();
  }, []);

  async function fetchCollectionHistory() {
    try {
      const res = await apiRequest('/assignments/citizen-history');
      if (res.ok) {
        setHistory(await res.json());
      } else {
        setErrorMsg('Failed to load your collection history.');
      }
    } catch {
      setErrorMsg('Network error.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="space-y-8 max-w-4xl pb-24">
      {/* Header */}
      <div className="glass-card p-8 relative overflow-hidden">
        <div className="text-xs text-nature-earth font-extrabold uppercase tracking-widest mb-1">Citizen Portal</div>
        <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight font-display">Waste Emptying History</h1>
        <p className="text-sm text-slate-600 mt-2 font-medium">Check verified schedules, historical emptying timestamps, and collection status for your properties.</p>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm font-medium">{errorMsg}</div>
      )}

      {isLoading ? (
        <div className="glass-card p-16 text-center">
          <div className="h-8 w-8 border-2 border-nature-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-500 text-sm font-medium">Fetching collection history...</p>
        </div>
      ) : history.length === 0 ? (
        <div className="glass-card p-16 text-center">
          <div className="text-5xl mb-4">🏠</div>
          <h2 className="text-slate-800 font-bold text-lg mb-2">No collection records found</h2>
          <p className="text-slate-500 text-sm font-medium max-w-md mx-auto">We couldn't find any collection history for your verified properties. Scheduled collections will appear here once executed.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <h3 className="text-xs font-extrabold text-slate-500 uppercase tracking-wider px-1">Emptying Timeline</h3>
          
          <div className="space-y-4">
            {history.map((record) => {
              const theme = WASTE_THEME[record.wasteType] || WASTE_THEME.OTHER;
              
              return (
                <div
                  key={record.targetId}
                  className="glass-card p-6 flex items-start gap-4 transition hover:shadow-md"
                >
                  {/* Icon indicator */}
                  <div className={`h-12 w-12 rounded-2xl border flex items-center justify-center text-2xl shrink-0 ${theme.bg}`}>
                    {theme.icon}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start gap-2 flex-wrap">
                      <div>
                        <h4 className="text-base font-bold text-slate-800 truncate">{record.address}</h4>
                        <p className="text-xs text-slate-500 mt-1 font-medium">Bin Type: <span className="text-slate-700 font-semibold">{record.binType}</span></p>
                      </div>

                      <span className={`px-3 py-1 rounded-xl text-xs font-extrabold border uppercase tracking-wider ${
                        record.status === 'COLLECTED' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                        record.status === 'MISSED' ? 'bg-red-50 text-red-700 border-red-200' :
                        'bg-cyan-50 text-cyan-700 border-cyan-200'
                      }`}>
                        {record.status}
                      </span>
                    </div>

                    <div className="flex justify-between items-center mt-4 pt-3 border-t border-surface-border text-xs text-slate-500 font-semibold">
                      <span>Waste Category: <strong className={theme.text}>{theme.label}</strong></span>
                      {record.collectedAt && (
                        <span className="text-slate-600">⏱️ Collected: {new Date(record.collectedAt).toLocaleString('en-IN', {
                          day: 'numeric',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

