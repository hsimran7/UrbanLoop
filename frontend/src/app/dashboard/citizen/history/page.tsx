'use client';

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
  DRY: { label: 'Dry Waste', icon: '📦', text: 'text-amber-400', bg: 'bg-amber-500/10' },
  WET: { label: 'Wet Waste', icon: '🥬', text: 'text-green-400', bg: 'bg-green-500/10' },
  E_WASTE: { label: 'E-Waste', icon: '💻', text: 'text-purple-400', bg: 'bg-purple-500/10' },
  OTHER: { label: 'Other', icon: '🗑️', text: 'text-slate-400', bg: 'bg-slate-500/10' },
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
    <div className="space-y-8 max-w-3xl pb-24">
      {/* Header */}
      <div className="p-6 rounded-2xl border border-slate-800 bg-gradient-to-br from-slate-900/80 to-teal-950/20 backdrop-blur">
        <div className="text-xs text-teal-400 font-semibold uppercase tracking-widest mb-1">Citizen Portal</div>
        <h1 className="text-2xl font-bold text-slate-100 font-display">Waste Emptying History</h1>
        <p className="text-sm text-slate-400 mt-1">Check verified schedules, historical emptying timestamps, and collection status for your properties.</p>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-xl border border-red-500/30 bg-red-950/20 text-red-300 text-sm">{errorMsg}</div>
      )}

      {isLoading ? (
        <div className="p-16 text-center">
          <div className="h-8 w-8 border-2 border-teal-400 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-500 text-sm">Fetching collection history...</p>
        </div>
      ) : history.length === 0 ? (
        <div className="p-16 text-center rounded-2xl border border-slate-800 bg-slate-900/40">
          <div className="text-5xl mb-4">🏠</div>
          <h2 className="text-slate-200 font-semibold mb-2">No collection records found</h2>
          <p className="text-slate-500 text-sm">We couldn't find any collection history for your verified properties. Scheduled collections will appear here once executed.</p>
        </div>
      ) : (
        <div className="space-y-4">
          <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider">Emptying Timeline</h3>
          
          <div className="space-y-4">
            {history.map((record) => {
              const theme = WASTE_THEME[record.wasteType] || WASTE_THEME.OTHER;
              
              return (
                <div
                  key={record.targetId}
                  className="p-5 rounded-2xl border border-slate-800 bg-slate-900/30 hover:bg-slate-900/40 transition flex items-start gap-4"
                >
                  {/* Icon indicator */}
                  <div className={`h-11 w-11 rounded-xl flex items-center justify-center text-xl shrink-0 ${theme.bg}`}>
                    {theme.icon}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start gap-2 flex-wrap">
                      <div>
                        <h4 className="text-sm font-semibold text-slate-200 truncate">{record.address}</h4>
                        <p className="text-xs text-slate-500 mt-1">Bin Type: <span className="text-slate-400 font-medium">{record.binType}</span></p>
                      </div>

                      <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wider ${
                        record.status === 'COLLECTED' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                        record.status === 'MISSED' ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                        'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
                      }`}>
                        {record.status}
                      </span>
                    </div>

                    <div className="flex justify-between items-center mt-4 pt-3 border-t border-slate-800/40 text-xs text-slate-500">
                      <span>Waste Category: <strong className={theme.text}>{theme.label}</strong></span>
                      {record.collectedAt && (
                        <span>⏱️ Collected: {new Date(record.collectedAt).toLocaleString('en-IN', {
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
