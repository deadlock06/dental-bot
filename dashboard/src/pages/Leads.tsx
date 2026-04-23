import React, { useState, useMemo } from 'react';
import { Search, Target, Zap, MessageSquare, CheckCircle2, ChevronLeft, ChevronRight, TrendingUp } from 'lucide-react';
import { useLeads } from '../hooks/useSupabase';
import { cn } from '../lib/utils';
import type { LeadStatus } from '../types';

const STATUS_FILTERS: (LeadStatus | 'All')[] = ['All', 'new', 'contacted', 'messaged', 'bumped_1', 'bumped_2', 'engaged', 'handed_off', 'opted_out'];

const StatusBadge = ({ status }: { status: string }) => {
  const styles: Record<string, string> = {
    new: 'bg-slate-100 text-slate-700 border-slate-200',
    contacted: 'bg-amber-100 text-amber-700 border-amber-200',
    messaged: 'bg-blue-100 text-blue-700 border-blue-200',
    bumped_1: 'bg-indigo-100 text-indigo-700 border-indigo-200',
    bumped_2: 'bg-purple-100 text-purple-700 border-purple-200',
    engaged: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    handed_off: 'bg-emerald-500 text-white border-emerald-600 shadow-sm',
    opted_out: 'bg-red-100 text-red-700 border-red-200',
  };

  return (
    <span className={cn('text-[10px] px-2 py-0.5 rounded border font-bold uppercase tracking-wider', styles[status] || styles.new)}>
      {status.replace('_', ' ')}
    </span>
  );
};

const FourDScore = ({ total, fit, pain, timing, reach }: { total: number, fit: number, pain: number, timing: number, reach: number }) => {
  const color = total >= 80 ? 'text-emerald-500 bg-emerald-50' : total >= 60 ? 'text-blue-500 bg-blue-50' : 'text-amber-500 bg-amber-50';
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span className={cn('text-xs font-black px-1.5 py-0.5 rounded', color)}>{total}/100</span>
      </div>
      <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[9px] font-mono text-slate-400">
        <div>F:{fit} P:{pain}</div>
        <div>T:{timing} R:{reach}</div>
      </div>
    </div>
  );
};

export default function Leads() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<LeadStatus | 'All'>('All');
  const [page, setPage] = useState(1);
  const PER_PAGE = 10;

  const { data: allLeads, loading, total } = useLeads({ status: statusFilter });

  const filtered = useMemo(() => {
    return (allLeads as any[]).filter(l => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (l.name || '').toLowerCase().includes(q) ||
        (l.company_name || '').toLowerCase().includes(q) ||
        l.phone.includes(search) ||
        (l.city || '').toLowerCase().includes(q);
    });
  }, [allLeads, search]);

  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const engaged = (allLeads as any[]).filter(l => ['engaged', 'handed_off'].includes(l.status)).length;
  const handedOff = (allLeads as any[]).filter(l => l.status === 'handed_off').length;

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Target className="w-7 h-7 text-blue-500" />
            Growth Swarm 3.0
          </h1>
          <p className="text-slate-500 text-sm mt-1">4D Intelligence & Automated Sequences</p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-lg border border-emerald-100 flex items-center gap-2 text-sm font-medium">
            <TrendingUp className="w-4 h-4" />
            AI Handoff Rate: {total > 0 ? Math.round((handedOff / total) * 100) : 0}%
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-500 text-xs font-medium uppercase tracking-wider">Scouted Leads</span>
            <Zap className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{loading ? '…' : total}</div>
          <div className="text-xs text-blue-600 mt-1 font-medium">GS 3.0 Pipeline</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-500 text-xs font-medium uppercase tracking-wider">Engaged / Talking</span>
            <MessageSquare className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900">
            {loading ? '…' : engaged}
          </div>
          <div className="text-xs text-slate-400 mt-1">Chatting with Jake</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-500 text-xs font-medium uppercase tracking-wider">Handed Off</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900">
            {loading ? '…' : handedOff}
          </div>
          <div className="text-xs text-emerald-600 mt-1 font-medium">Ready to close</div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search company, phone..."
            className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 bg-white transition-all shadow-sm"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {STATUS_FILTERS.map(s => (
            <button
              key={s}
              onClick={() => { setStatusFilter(s); setPage(1); }}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-lg border transition-all capitalize',
                statusFilter === s
                  ? 'bg-slate-900 text-white border-slate-900 shadow-md'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-blue-300'
              )}
            >
              {s.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50/50">
                <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Clinic & Contact</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Pain Signals</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">4D Score</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Status</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {paginated.map((lead: any) => (
                <tr key={lead.id} className="hover:bg-blue-50/30 transition-colors group">
                  <td className="px-4 py-3">
                    <div className="font-bold text-slate-900">{lead.company_name || 'Unknown Clinic'}</div>
                    <div className="text-[11px] text-slate-500 mt-0.5">{lead.owner_name || lead.name || 'Owner'}</div>
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">{lead.phone} {lead.city ? `· ${lead.city}` : ''}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1 max-w-[200px]">
                      {lead.pain_signals && lead.pain_signals.length > 0 ? (
                        lead.pain_signals.map((signal: string, i: number) => (
                          <span key={i} className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 bg-red-50 text-red-600 rounded border border-red-100">
                            {signal.replace('_', ' ')}
                          </span>
                        ))
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <FourDScore 
                      total={lead.total_score || 0} 
                      fit={lead.fit_score || 0}
                      pain={lead.pain_score || 0}
                      timing={lead.timing_score || 0}
                      reach={lead.reachability_score || 0}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={lead.status} />
                  </td>
                  <td className="px-4 py-3 text-right">
                    <a
                      href={`https://wa.me/${lead.phone.replace('+', '')}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-500 hover:text-blue-700 font-bold text-xs uppercase tracking-tighter opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      WhatsApp →
                    </a>
                  </td>
                </tr>
              ))}
              {paginated.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-400 italic">
                    No leads found matching your criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100 bg-slate-50/30">
            <span className="text-xs text-slate-400 font-medium">
              Showing {(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, filtered.length)} of {total}
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-slate-700 disabled:opacity-40 transition-colors bg-white"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs px-2 text-slate-600 font-bold">{page} / {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-slate-700 disabled:opacity-40 transition-colors bg-white"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Footer Branding */}
      <div className="flex items-center justify-center gap-2 opacity-30 mt-8 grayscale hover:grayscale-0 transition-all cursor-default select-none">
        <Zap className="w-4 h-4" />
        <span className="text-[10px] font-black uppercase tracking-[0.2em]">Growth Swarm Engine v3.0 by Antigravity</span>
      </div>
    </div>
  );
}
