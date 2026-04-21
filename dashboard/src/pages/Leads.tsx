import React, { useState, useMemo } from 'react';
import { Search, Filter, Target, Zap, MessageSquare, CheckCircle2, XCircle, Clock, ChevronLeft, ChevronRight, TrendingUp } from 'lucide-react';
import { useLeads } from '../hooks/useSupabase';
import type { LiveLead } from '../hooks/useSupabase';
import { cn } from '../lib/utils';
import type { LeadStatus } from '../types';

const STATUS_FILTERS: (LeadStatus | 'All')[] = ['All', 'new', 'contacted', 'appointment_booked', 'lost', 'opt_out'];

const StatusBadge = ({ status }: { status: LeadStatus }) => {
  const styles: Record<LeadStatus, string> = {
    new: 'bg-blue-100 text-blue-700 border-blue-200',
    contacted: 'bg-amber-100 text-amber-700 border-amber-200',
    appointment_booked: 'bg-emerald-100 text-emerald-700 border-emerald-200',
    lost: 'bg-slate-100 text-slate-700 border-slate-200',
    opt_out: 'bg-red-100 text-red-700 border-red-200',
  };

  return (
    <span className={cn('text-xs px-2 py-0.5 rounded-full border font-medium capitalize', styles[status])}>
      {status.replace('_', ' ')}
    </span>
  );
};

const ConfidenceScore = ({ score }: { score: number }) => {
  const color = score >= 90 ? 'text-emerald-500' : score >= 70 ? 'text-blue-500' : 'text-amber-500';
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-12 h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div 
          className={cn('h-full transition-all duration-500', 
            score >= 90 ? 'bg-emerald-500' : score >= 70 ? 'bg-blue-500' : 'bg-amber-500'
          )} 
          style={{ width: `${score}%` }} 
        />
      </div>
      <span className={cn('text-xs font-bold', color)}>{score}%</span>
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
    return (allLeads as LiveLead[]).filter(l => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (l.name || '').toLowerCase().includes(q) ||
        (l.business_name || '').toLowerCase().includes(q) ||
        l.phone.includes(search) ||
        (l.city || '').toLowerCase().includes(q);
    });
  }, [allLeads, search]);

  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const contacted = (allLeads as LiveLead[]).filter(l => l.status === 'contacted').length;
  const converted = (allLeads as LiveLead[]).filter(l => l.status === 'appointment_booked').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Target className="w-7 h-7 text-blue-500" />
            Growth Swarm
          </h1>
          <p className="text-slate-500 text-sm mt-1">High-intent lead management & AI engagement</p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-lg border border-emerald-100 flex items-center gap-2 text-sm font-medium">
            <TrendingUp className="w-4 h-4" />
            +12% conversion this week
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-500 text-xs font-medium uppercase tracking-wider">Total Leads</span>
            <Zap className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900">{loading ? '…' : total}</div>
          <div className="text-xs text-blue-600 mt-1 font-medium">Live from Supabase Growth v2</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-500 text-xs font-medium uppercase tracking-wider">Active Outreach</span>
            <MessageSquare className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900">
            {loading ? '…' : contacted}
          </div>
          <div className="text-xs text-slate-400 mt-1">AI automated followup enabled</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-slate-500 text-xs font-medium uppercase tracking-wider">Success Rate</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-bold text-slate-900">
            {loading ? '…' : total > 0 ? `${Math.round((converted / total) * 100)}%` : '0%'}
          </div>
          <div className="text-xs text-emerald-600 mt-1 font-medium">Higher than market average</div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search leads..."
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
                <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Lead</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Source</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Category</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Confidence</th>
                <th className="text-left px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Status</th>
                <th className="text-right px-4 py-3 font-semibold text-slate-600 text-xs uppercase tracking-wider">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {paginated.map((lead: LiveLead) => (
                <tr key={lead.id} className="hover:bg-blue-50/30 transition-colors group">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-slate-900">{lead.business_name || lead.name || 'Unknown Business'}</div>
                    <div className="text-xs text-slate-400 font-mono">{lead.phone} {lead.city ? `· ${lead.city}` : ''}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-slate-600 text-xs font-medium bg-slate-100 px-2 py-1 rounded">{lead.vertical || 'dental'}</span>
                  </td>
                  <td className="px-4 py-3 font-medium text-slate-700">
                    {lead.pain_signal?.replace('_', ' ') || '—'}
                  </td>
                  <td className="px-4 py-3">
                    <ConfidenceScore score={lead.confidence_score} />
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={lead.status as LeadStatus} />
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
        <span className="text-[10px] font-black uppercase tracking-[0.2em]">Growth Swarm Engine v2.5 by Antigravity</span>
      </div>
    </div>
  );
}
