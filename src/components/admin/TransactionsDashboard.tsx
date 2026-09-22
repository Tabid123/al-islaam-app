// @ts-nocheck
import React, { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Search, ChevronRight, ChevronLeft, TrendingUp, FileDown, FileSpreadsheet, ChevronDown, Phone, User, Calendar, DollarSign, Hash, Clock, FileText } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { format } from 'date-fns';
import { formatPrice } from '@/lib/utils';
import { exportTransactionsPDF, exportTransactionsExcel } from '@/utils/analyticsExporter';
import { calculateAlIslaamProfit, isNonFinancialOrder } from '@/lib/profit';

interface Transaction {
  id: string;
  customer_phone: string;
  package_name: string;
  data_amount: string;
  selling_price: number;
  status: string;
  delivery_status?: string;
  created_at: string;
  package_id: string;
  provider_id: string;
  cost_price: number;
  evoucher_rate: number;
  is_flow?: boolean;
  is_financial?: boolean;
  payment_source?: string | null;
  sender_phone?: string;
  receiver_phone?: string;
  provider_name: string;
  manual_action_note?: string;
  manual_action_email?: string;
  manual_action_at?: string;
  manual_action_type?: string;
  updated_at?: string;
}

const PAGE_SIZE = 50;

const formatPhone = (phone: string) => {
  if (!phone) return '';
  const clean = phone.replace(/\D/g, '').replace(/^252/, '');
  if (clean.length === 9) return `${clean.slice(0, 2)}-${clean.slice(2, 5)}-${clean.slice(5)}`;
  return clean;
};

const formatTime = (dateStr: string) => {
  const d = new Date(dateStr);
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
};

const formatDate = (dateStr: string) => {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
};

export function TransactionsDashboard() {
  const { language } = useLanguage();
  const isSo = language === 'so';
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [totalSales, setTotalSales] = useState(0);
  const [totalProfit, setTotalProfit] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [receipts, setReceipts] = useState<Record<string, any>>({});

  useEffect(() => {
    if (!expandedId || receipts[expandedId] !== undefined) return;
    let cancelled = false;
    setReceipts(prev => ({ ...prev, [expandedId]: 'loading' }));
    (async () => {
      const { data } = await supabase
        .from('delivery_queue')
        .select('id, status, provider_response, somlink_response, error_message, completed_at, last_attempt_at, created_at, delivery_method')
        .eq('order_id', expandedId)
        .order('created_at', { ascending: false })
        .limit(1);
      if (!cancelled) setReceipts(prev => ({ ...prev, [expandedId]: data?.[0] ?? null }));
    })();
    return () => { cancelled = true; };
  }, [expandedId]);

  const [statsData, setStatsData] = useState<any>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [periodFilter, setPeriodFilter] = useState('today');
  const [providerFilter, setProviderFilter] = useState('all');

  const [providers, setProviders] = useState<{id: string; name: string}[]>([]);
  const [debouncedSearch, setDebouncedSearch] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    const loadProviders = async () => {
      const { data } = await supabase
        .from('providers_config')
        .select('id, provider_name')
        .eq('is_active', true)
        .order('display_order');
      if (data) {
        setProviders(data.map(p => ({ id: p.id, name: p.provider_name })));
      }
    };
    loadProviders();
  }, []);

  const loadStats = useCallback(async () => {
    const provId = providerFilter === 'all' ? null : providerFilter;
    const [currentRes, monthRes] = await Promise.all([
      supabase.rpc('get_admin_transactions_summary', {
        p_provider_id: provId,
        p_period: periodFilter,
      }),
      supabase.rpc('get_admin_transactions_summary', {
        p_provider_id: provId,
        p_period: 'month',
      }),
    ]);

    setStatsData({
      current: currentRes.data || {},
      month: monthRes.data || {},
    });
  }, [providerFilter, periodFilter]);

  const loadTransactions = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('get_admin_transactions_paginated', {
      p_search: debouncedSearch,
      p_status: statusFilter,
      p_provider_id: providerFilter,
      p_period: periodFilter,
      p_page_size: PAGE_SIZE,
      p_page: currentPage,
    });

    if (!error && data) {
      const result = data as any;
      setTransactions(result.rows || []);
      setTotalCount(result.total_count || 0);
      setTotalSales(result.total_sales || 0);
      setTotalProfit(result.total_profit || 0);
    }
    setLoading(false);
  }, [debouncedSearch, statusFilter, providerFilter, periodFilter, currentPage]);

  useEffect(() => {
    setCurrentPage(0);
  }, [debouncedSearch, statusFilter, providerFilter, periodFilter]);

  useEffect(() => {
    loadTransactions();
    loadStats();

    const channel = supabase
      .channel('transactions-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, () => {
        loadTransactions();
        loadStats();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, () => {
        loadTransactions();
        loadStats();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [loadTransactions, loadStats]);

  const totalPages = Math.ceil(totalCount / PAGE_SIZE);

  const handleManualVerify = async (orderId: string) => {
    try {
      await supabase
        .from('orders')
        .update({
          delivery_status: 'delivered',
          delivery_notes: 'Manually verified by admin',
          delivered_at: new Date().toISOString()
        })
        .eq('id', orderId);
      loadTransactions();
    } catch (error) {
      console.error('Manual verify error:', error);
    }
  };

  const currentStats = statsData?.current || {};
  const monthStats = statsData?.month || {};
  const sTransactions = Number(currentStats.total_orders ?? 0);
  const sSales = Number(currentStats.total_revenue ?? 0);
  const sSalesMonth = Number(monthStats.total_revenue ?? 0);
  const sProfit = Number(currentStats.total_profit ?? 0);
  const sCost = Number(currentStats.total_cost ?? 0);
  const sMonthCost = Number(monthStats.total_cost ?? 0);

  const getPeriodLabel = () => {
    switch (periodFilter) {
      case 'today': return "Today's";
      case 'yesterday': return "Yesterday's";
      case 'week': return "Week's";
      case 'month': return "Month's";
      case 'year': return "Year's";
      default: return 'Total';
    }
  };

  const getExportPeriod = () => {
    switch (periodFilter) {
      case 'today': return 'Today';
      case 'yesterday': return 'Yesterday';
      case 'week': return 'This Week';
      case 'month': return 'This Month';
      case 'year': return 'This Year';
      default: return 'All Time';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': case 'delivered':
        return 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300';
      case 'failed':
        return 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300';
      case 'timeout':
        return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300';
      case 'pending': case 'queued':
        return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300';
      case 'payment_confirmed':
        return 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300';
      default:
        return 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300';
    }
  };

  return (
    <div className="space-y-3">
      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-1.5">
        <Card className="bg-blue-500 text-white border-0 shadow-md">
          <CardContent className="p-2">
            <p className="text-[8px] text-blue-100 font-medium">Transactions</p>
            <p className="text-sm font-bold">{sTransactions}</p>
            <p className="text-[7px] text-blue-200 mt-0.5">{getPeriodLabel()} orders</p>
          </CardContent>
        </Card>

        <Card className="bg-purple-600 text-white border-0 shadow-md">
          <CardContent className="p-2">
            <p className="text-[8px] text-purple-100 font-medium">Sales</p>
            <p className="text-sm font-bold">${sSales.toFixed(2)}</p>
            <p className="text-[7px] text-purple-200 mt-0.5">Cost: ${sCost.toFixed(2)}</p>
          </CardContent>
        </Card>

        <Card className="bg-gray-600 text-white border-0 shadow-md">
          <CardContent className="p-2">
            <p className="text-[8px] text-gray-300 font-medium">Monthly</p>
            <p className="text-sm font-bold">${sSalesMonth.toFixed(2)}</p>
            <p className="text-[7px] text-gray-400 mt-0.5">Cost: ${sMonthCost.toFixed(2)}</p>
          </CardContent>
        </Card>

        <Card className="bg-emerald-500 text-white border-0 shadow-md">
          <CardContent className="p-2">
            <p className="text-[8px] text-emerald-100 font-medium">Profit</p>
            <p className="text-sm font-bold">${sProfit.toFixed(2)}</p>
            <p className="text-[7px] text-emerald-200 mt-0.5">Cost: ${sCost.toFixed(2)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
        <Input
          placeholder={isSo ? 'Raadi Phone/ID...' : 'Search by Phone/ID...'}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9 h-9 text-sm bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
        />
      </div>

      {/* Compact horizontal filter bar */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-hide">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="h-8 text-xs min-w-[90px] max-w-[100px] bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Status</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>

        <Select value={providerFilter} onValueChange={setProviderFilter}>
          <SelectTrigger className="h-8 text-xs min-w-[100px] max-w-[110px] bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Providers</SelectItem>
            {providers.map(p => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={periodFilter} onValueChange={setPeriodFilter}>
          <SelectTrigger className="h-8 text-xs min-w-[80px] max-w-[90px] bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="yesterday">Yesterday</SelectItem>
            <SelectItem value="week">This Week</SelectItem>
            <SelectItem value="month">This Month</SelectItem>
            <SelectItem value="year">This Year</SelectItem>
            <SelectItem value="all">All Time</SelectItem>
          </SelectContent>
        </Select>

        <button
          onClick={() => exportTransactionsPDF(transactions, { totalCount, totalSales, totalProfit, period: getExportPeriod() })}
          disabled={transactions.length === 0}
          className="h-8 px-2.5 text-xs font-medium rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 flex items-center gap-1 shrink-0 disabled:opacity-40"
        >
          <FileDown className="h-3.5 w-3.5" /> PDF
        </button>

        <button
          onClick={() => exportTransactionsExcel(transactions, { totalCount, totalSales, totalProfit, period: getExportPeriod() })}
          disabled={transactions.length === 0}
          className="h-8 px-2.5 text-xs font-medium rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 flex items-center gap-1 shrink-0 disabled:opacity-40"
        >
          <FileSpreadsheet className="h-3.5 w-3.5" /> Excel
        </button>
      </div>

      {/* Accordion Transaction Cards */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-12 gap-2">
          <Loader2 className="h-7 w-7 animate-spin text-gray-300" />
          <span className="text-xs text-gray-400">{isSo ? 'Xogta la soo rarayo...' : 'Loading...'}</span>
        </div>
      ) : transactions.length === 0 ? (
        <div className="text-center py-12">
          <div className="text-3xl mb-2">📭</div>
          <p className="text-gray-400 dark:text-gray-500 text-sm">
            {isSo ? 'Wax transaction ah lama helin' : 'No transactions found'}
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {transactions.map((t) => {
            const isExpanded = expandedId === t.id;
            const nonFinancial = isNonFinancialOrder(t);
            const profit = nonFinancial ? 0 : calculateAlIslaamProfit(t.selling_price, t.cost_price || 0, t.evoucher_rate || 0, !!t.is_flow);
            const isPositiveProfit = profit > 0;
            const displayStatus = t.delivery_status || t.status;

            return (
              <div key={t.id} className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
                {/* Summary row */}
                <button
                  onClick={() => setExpandedId(isExpanded ? null : t.id)}
                  className="w-full p-3 flex items-center justify-between text-left active:bg-gray-50 dark:active:bg-gray-750 transition-colors"
                >
                  <div className="flex flex-col min-w-0 flex-1">
                    <span className="font-bold text-gray-800 dark:text-gray-100 text-sm truncate">{t.package_name}</span>
                    <span className="text-xs text-gray-400">{formatPhone(t.receiver_phone || '')} · {formatTime(t.created_at)}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-semibold text-sm text-gray-700 dark:text-gray-200">${Number(t.selling_price).toFixed(2)}</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${getStatusColor(displayStatus)}`}>
                      {displayStatus}
                    </span>
                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} />
                  </div>
                </button>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="border-t border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-850 px-3 pb-3 pt-2 space-y-2 animate-in slide-in-from-top-1 duration-150">
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="flex items-center gap-1.5">
                        <Phone className="w-3.5 h-3.5 text-blue-500" />
                        <div>
                          <div className="text-[10px] text-gray-400">{isSo ? 'Qaataha' : 'Receiver'}</div>
                          <div className="font-medium text-gray-700 dark:text-gray-200">{formatPhone(t.receiver_phone || '')}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-purple-500" />
                        <div>
                          <div className="text-[10px] text-gray-400">{isSo ? 'Macmiilka' : 'Customer'}</div>
                          <div className="font-medium text-gray-700 dark:text-gray-200">{formatPhone(t.customer_phone || '')}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <DollarSign className="w-3.5 h-3.5 text-green-500" />
                        <div>
                          <div className="text-[10px] text-gray-400">Cost</div>
                          <div className="font-medium text-gray-700 dark:text-gray-200">${Number(t.cost_price || 0).toFixed(2)}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <TrendingUp className={`w-3.5 h-3.5 ${isPositiveProfit ? 'text-green-500' : 'text-red-500'}`} />
                        <div>
                          <div className="text-[10px] text-gray-400">Profit</div>
                          <div className={`font-medium ${isPositiveProfit ? 'text-green-600' : 'text-red-600'}`}>
                            {isPositiveProfit ? '+' : ''}${formatPrice(profit)}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5 text-teal-500" />
                        <div>
                          <div className="text-[10px] text-gray-400">{isSo ? 'Taariikhda' : 'Date'}</div>
                          <div className="font-medium text-gray-700 dark:text-gray-200">{formatDate(t.created_at)}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <Hash className="w-3.5 h-3.5 text-cyan-500" />
                        <div>
                          <div className="text-[10px] text-gray-400">Provider</div>
                          <div className="font-medium text-gray-700 dark:text-gray-200">{t.provider_name}</div>
                        </div>
                      </div>
                      {t.sender_phone && (
                        <div className="flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5 text-orange-500" />
                          <div>
                            <div className="text-[10px] text-gray-400">{isSo ? 'Diraha' : 'Sender'}</div>
                            <div className="font-medium text-gray-700 dark:text-gray-200">{formatPhone(t.sender_phone)}</div>
                          </div>
                        </div>
                      )}
                      {t.data_amount && (
                        <div className="flex items-center gap-1.5">
                          <FileText className="w-3.5 h-3.5 text-indigo-500" />
                          <div>
                            <div className="text-[10px] text-gray-400">Data</div>
                            <div className="font-medium text-gray-700 dark:text-gray-200">{t.data_amount}</div>
                          </div>
                        </div>
                      )}
                    </div>
                    {(t.manual_action_note || t.manual_action_email || t.manual_action_at) && (
                      <div className="rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-2 space-y-1">
                        {t.manual_action_type && (
                          <div className="flex items-start gap-1.5 text-xs">
                            <FileText className="w-3.5 h-3.5 text-amber-500 mt-0.5" />
                            <div>
                              <div className="text-[10px] text-gray-400">{isSo ? 'Ficilka' : 'Action'}</div>
                              <div className="font-medium text-gray-700 dark:text-gray-200">{t.manual_action_type}</div>
                            </div>
                          </div>
                        )}
                        {t.manual_action_note && (
                          <div className="flex items-start gap-1.5 text-xs">
                            <FileText className="w-3.5 h-3.5 text-red-500 mt-0.5" />
                            <div>
                              <div className="text-[10px] text-gray-400">{isSo ? 'Sababta' : 'Reason'}</div>
                              <div className="font-medium text-gray-700 dark:text-gray-200 break-words">{t.manual_action_note}</div>
                            </div>
                          </div>
                        )}
                        {t.manual_action_email && (
                          <div className="flex items-start gap-1.5 text-xs">
                            <User className="w-3.5 h-3.5 text-blue-500 mt-0.5" />
                            <div>
                              <div className="text-[10px] text-gray-400">{isSo ? 'Qofka qabtay' : 'Handled by'}</div>
                              <div className="font-medium text-gray-700 dark:text-gray-200 break-all">{t.manual_action_email}</div>
                            </div>
                          </div>
                        )}
                        {(t.manual_action_at || t.updated_at) && (
                          <div className="flex items-start gap-1.5 text-xs">
                            <Clock className="w-3.5 h-3.5 text-purple-500 mt-0.5" />
                            <div>
                              <div className="text-[10px] text-gray-400">{isSo ? 'Waqtiga la cusboonaysiiyay' : 'Updated at'}</div>
                              <div className="font-medium text-gray-700 dark:text-gray-200">
                                {formatDate((t.manual_action_at || t.updated_at)!)} · {formatTime((t.manual_action_at || t.updated_at)!)}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    {(() => {
                      const r = receipts[t.id];
                      if (r === 'loading') {
                        return <div className="text-[10px] text-gray-400">{isSo ? 'Caddaynta la soo rarayo...' : 'Loading receipt...'}</div>;
                      }
                      if (!r) return null;
                      const raw = r.somlink_response || {};
                      const ok = r.status === 'completed';
                      const msg = raw?.message || r.provider_response || r.error_message;
                      const ts = r.completed_at || r.last_attempt_at || r.created_at;
                      return (
                        <div className={`rounded-md border p-2 space-y-1 ${ok ? 'border-green-200 bg-green-50 dark:bg-green-900/20 dark:border-green-800' : 'border-red-200 bg-red-50 dark:bg-red-900/20 dark:border-red-800'}`}>
                          <div className="text-[11px] text-gray-700 dark:text-gray-200 space-y-0.5">
                            <div>{isSo ? 'Natiijada dalabka' : 'Order result'}: <strong>{msg || (ok ? (isSo ? 'Waa la gaarsiiyay' : 'Delivered') : r.status)}</strong></div>
                            {ts && <div>{isSo ? 'Waqtiga' : 'Time'}: <strong>{formatDate(ts)} · {formatTime(ts)}</strong></div>}
                          </div>
                        </div>
                      );
                    })()}
                    {t.delivery_status === 'timeout' && (
                      <button
                        onClick={() => handleManualVerify(t.id)}
                        className="w-full mt-1 py-1.5 text-xs font-medium bg-green-500 text-white rounded-md active:bg-green-600"
                      >
                        ✓ {isSo ? 'Xaqiiji' : 'Verify Manually'}
                      </button>
                    )}
                    <div className="text-[10px] text-gray-300 dark:text-gray-600 font-mono mt-1 truncate">ID: {t.id}</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Footer Summary + Pagination */}
      {!loading && transactions.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-700 p-3">
          <div className="flex flex-wrap justify-between gap-2 text-xs">
            <span>Total: <strong>{totalCount}</strong></span>
            <span>Sales: <strong className="text-blue-600">${Number(totalSales).toFixed(2)}</strong></span>
            <span>Cost: <strong className="text-red-600">${sCost.toFixed(2)}</strong></span>
            <span>Profit: <strong className="text-green-600">${Number(totalProfit).toFixed(2)}</strong></span>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-3">
              <Button variant="outline" size="sm" className="h-7 text-xs" disabled={currentPage === 0} onClick={() => setCurrentPage(p => p - 1)}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </Button>
              <span className="text-xs text-gray-400">
                {currentPage + 1} / {totalPages}
              </span>
              <Button variant="outline" size="sm" className="h-7 text-xs" disabled={currentPage >= totalPages - 1} onClick={() => setCurrentPage(p => p + 1)}>
                <ChevronRight className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
