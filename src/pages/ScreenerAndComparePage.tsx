import React, { useEffect, useState } from 'react';
import { Search, SlidersHorizontal, Star, Trash2, GitCompare } from 'lucide-react';
import { apiFetch, formatPct, formatYuanYi, priceColorClass } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

interface ScreenerAndComparePageProps {
  onSelectStock: (symbol: string) => void;
}

export const ScreenerAndComparePage: React.FC<ScreenerAndComparePageProps> = ({ onSelectStock }) => {
  const { user, signInWithGoogle } = useAuth();
  const [subTab, setSubTab] = useState<'search' | 'screener' | 'compare' | 'watchlist'>('search');

  // Search
  const [query, setQuery] = useState('');
  const [board, setBoard] = useState('全部');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searchProvenance, setSearchProvenance] = useState<any>(null);
  const [searching, setSearching] = useState(false);

  // Screener
  const [excludeSt, setExcludeSt] = useState(true);
  const [minChangePct, setMinChangePct] = useState('');
  const [maxPe, setMaxPe] = useState('40');
  const [minTurnover, setMinTurnover] = useState('');
  const [minMarketCapYi, setMinMarketCapYi] = useState('50');
  const [presetName, setPresetName] = useState('');
  const [screenItems, setScreenItems] = useState<any[]>([]);
  const [screenStatus, setScreenStatus] = useState<string | null>(null);

  // Compare
  const [compareInput, setCompareInput] = useState('600519,000858,000568');
  const [compareRows, setCompareRows] = useState<any[]>([]);
  const [comparing, setComparing] = useState(false);

  // Watchlist
  const [watchlists, setWatchlists] = useState<any[]>([]);
  const [loadingWatchlist, setLoadingWatchlist] = useState(false);

  const runSearch = async (q = query, b = board) => {
    setSearching(true);
    try {
      const res = await apiFetch(`/api/stocks/search?q=${encodeURIComponent(q)}&board=${encodeURIComponent(b)}`);
      setSearchResults(res.items || []);
      setSearchProvenance(res.provenance);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    runSearch('', '全部');
  }, []);

  const loadWatchlist = async () => {
    if (!user) return;
    setLoadingWatchlist(true);
    try {
      const res = await apiFetch('/api/watchlists');
      setWatchlists(res.items || []);
    } catch {
      setWatchlists([]);
    } finally {
      setLoadingWatchlist(false);
    }
  };

  useEffect(() => {
    if (subTab === 'watchlist' && user) loadWatchlist();
  }, [subTab, user]);

  const handleAddWatchlist = async (symbol: string, name: string) => {
    if (!user) {
      await signInWithGoogle();
      return;
    }
    try {
      await apiFetch('/api/watchlists', {
        method: 'POST',
        body: JSON.stringify({ symbol, stockName: name }),
      });
      if (subTab === 'watchlist') loadWatchlist();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleDeleteWatchlist = async (symbol: string) => {
    try {
      await apiFetch(`/api/watchlists/${symbol}`, { method: 'DELETE' });
      setWatchlists((prev) => prev.filter((w) => w.symbol !== symbol));
    } catch {
      // ignore
    }
  };

  const handleRunScreener = async () => {
    if (!user) {
      await signInWithGoogle();
      return;
    }
    setScreenStatus('正在扫描全市场真实数据...');
    try {
      const res = await apiFetch('/api/screener/run', {
        method: 'POST',
        body: JSON.stringify({
          savePresetName: presetName.trim() || undefined,
          conditions: {
            board,
            excludeSt,
            minChangePct: minChangePct !== '' ? Number(minChangePct) : undefined,
            maxPe: maxPe !== '' ? Number(maxPe) : undefined,
            minTurnover: minTurnover !== '' ? Number(minTurnover) : undefined,
            minMarketCapYi: minMarketCapYi !== '' ? Number(minMarketCapYi) : undefined,
          },
        }),
      });
      setScreenItems(res.items || []);
      setScreenStatus(`扫描 ${res.totalScanned} 只活跃A股，命中 ${res.items?.length || 0} 只标的`);
    } catch (err: any) {
      setScreenStatus(`筛选失败: ${err.message}`);
    }
  };

  const handleCompare = async () => {
    const codes = compareInput
      .split(/[,，\s]+/)
      .map((s) => s.replace(/[^0-9]/g, '').slice(0, 6))
      .filter((s) => /^\d{6}$/.test(s))
      .slice(0, 5);
    if (!codes.length) return;
    setComparing(true);
    try {
      const results = await Promise.all(
        codes.map((c) => apiFetch(`/api/stocks/${c}/research`).catch(() => null))
      );
      setCompareRows(results.filter(Boolean));
    } finally {
      setComparing(false);
    }
  };

  useEffect(() => {
    if (subTab === 'compare' && compareRows.length === 0) {
      handleCompare();
    }
  }, [subTab]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">全市场选股、对比与自选池</h1>
          <p className="mt-1 text-xs text-slate-500">
            覆盖上交所主板、深交所主板、创业板、科创板、北交所 · 自动识别 ST/*ST 与退市状态
          </p>
        </div>
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
          {[
            { id: 'search', label: '全市场搜索' },
            { id: 'screener', label: '智能选股器' },
            { id: 'compare', label: '多股票对比' },
            { id: 'watchlist', label: '我的自选股' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setSubTab(t.id as any)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 transition-colors ${
                subTab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {subTab === 'search' && (
        <div className="space-y-4">
          <div className="p-4 bg-white border border-slate-200 rounded-lg flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[240px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && runSearch()}
                placeholder="输入6位股票代码、名称或拼音首字母（如 600519、宁德时代、300750、688981）"
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <select
              value={board}
              onChange={(e) => {
                setBoard(e.target.value);
                runSearch(query, e.target.value);
              }}
              className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
            >
              {['全部', '主板', '创业板', '科创板', '北交所'].map((b) => (
                <option key={b} value={b}>
                  板块：{b}
                </option>
              ))}
            </select>
            <button
              onClick={() => runSearch()}
              disabled={searching}
              className="px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              {searching ? '检索中...' : '搜索A股'}
            </button>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 text-xs text-slate-500 flex justify-between">
              <span>{query ? `关键词 "${query}" 匹配结果` : '沪深京活跃成交榜 (Top 60)'}</span>
              <span>{searchProvenance ? `${searchProvenance.dataSource} · ${searchProvenance.dataStatus}` : ''}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium">代码</th>
                    <th className="text-left px-4 py-2.5 font-medium">名称</th>
                    <th className="text-left px-4 py-2.5 font-medium">市场 / 板块</th>
                    <th className="text-right px-4 py-2.5 font-medium">最新价</th>
                    <th className="text-right px-4 py-2.5 font-medium">涨跌幅</th>
                    <th className="text-right px-4 py-2.5 font-medium">换手率</th>
                    <th className="text-right px-4 py-2.5 font-medium">PE(TTM)</th>
                    <th className="text-right px-4 py-2.5 font-medium">总市值</th>
                    <th className="text-right px-4 py-2.5 font-medium">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {searchResults.map((s) => (
                    <tr key={s.symbol} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-mono text-slate-700">{s.tsCode}</td>
                      <td className="px-4 py-2.5 font-medium text-slate-900">
                        {s.name}
                        {s.isSt && <span className="ml-1.5 text-amber-700">[ST风险]</span>}
                        {s.isDelisting && <span className="ml-1.5 text-red-700">[退市整理]</span>}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">
                        {s.exchange} · {s.board}
                      </td>
                      <td className={`px-4 py-2.5 text-right font-mono tabular-nums ${priceColorClass(s.changePct)}`}>
                        {s.price !== undefined && s.price !== null ? s.price.toFixed(2) : '-'}
                      </td>
                      <td className={`px-4 py-2.5 text-right font-mono tabular-nums ${priceColorClass(s.changePct)}`}>
                        {s.changePct !== undefined && s.changePct !== null ? formatPct(s.changePct) : '-'}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                        {s.turnoverRate !== undefined && s.turnoverRate !== null ? `${s.turnoverRate.toFixed(2)}%` : '-'}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                        {s.peTtm !== undefined && s.peTtm !== null ? s.peTtm.toFixed(1) : '-'}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                        {s.totalMarketCap !== undefined ? formatYuanYi(s.totalMarketCap) : '-'}
                      </td>
                      <td className="px-4 py-2.5 text-right space-x-2 whitespace-nowrap">
                        <button
                          onClick={() => handleAddWatchlist(s.symbol, s.name)}
                          className="text-slate-500 hover:text-amber-600"
                          title="加入自选"
                        >
                          <Star className="w-3.5 h-3.5 inline" />
                        </button>
                        <button
                          onClick={() => onSelectStock(s.symbol)}
                          className="text-blue-700 font-medium hover:underline"
                        >
                          深度研究
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {subTab === 'screener' && (
        <div className="space-y-4">
          <div className="p-5 bg-white border border-slate-200 rounded-lg space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-slate-600" />
                实时量化与基本面筛选条件
              </h2>
              {screenStatus && <span className="text-xs text-blue-700">{screenStatus}</span>}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
              <div>
                <label className="block text-slate-500 mb-1">最小总市值 (亿元)</label>
                <input
                  value={minMarketCapYi}
                  onChange={(e) => setMinMarketCapYi(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-500 mb-1">最大PE(TTM)</label>
                <input
                  value={maxPe}
                  onChange={(e) => setMaxPe(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-500 mb-1">当日最小涨幅 (%)</label>
                <input
                  value={minChangePct}
                  onChange={(e) => setMinChangePct(e.target.value)}
                  placeholder="例如 2"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-500 mb-1">最小换手率 (%)</label>
                <input
                  value={minTurnover}
                  onChange={(e) => setMinTurnover(e.target.value)}
                  placeholder="例如 3"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-500 mb-1">保存方案名称 (可选)</label>
                <input
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  placeholder="低估值活跃龙头"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <label className="inline-flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={excludeSt}
                  onChange={(e) => setExcludeSt(e.target.checked)}
                />
                剔除 ST / *ST 与退市风险警示股票
              </label>
              <button
                onClick={handleRunScreener}
                className="px-4 py-2 text-xs font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 whitespace-nowrap shrink-0"
              >
                {user ? '立即执行全市场筛选' : '登录并执行筛选'}
              </button>
            </div>
          </div>

          {screenItems.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium">代码 / 名称</th>
                    <th className="text-left px-4 py-2.5 font-medium">行业</th>
                    <th className="text-right px-4 py-2.5 font-medium">最新价</th>
                    <th className="text-right px-4 py-2.5 font-medium">涨跌幅</th>
                    <th className="text-right px-4 py-2.5 font-medium">换手率</th>
                    <th className="text-right px-4 py-2.5 font-medium">PE / PB</th>
                    <th className="text-right px-4 py-2.5 font-medium">总市值</th>
                    <th className="text-right px-4 py-2.5 font-medium">研究</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {screenItems.map((s) => (
                    <tr key={s.symbol} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-medium text-slate-900">
                        <span className="font-mono text-slate-500 mr-1.5">{s.symbol}</span>
                        {s.name}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">{s.industry || '-'}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">{s.price?.toFixed(2)}</td>
                      <td className={`px-4 py-2.5 text-right font-mono tabular-nums ${priceColorClass(s.changePct)}`}>
                        {formatPct(s.changePct)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">{s.turnoverRate?.toFixed(2)}%</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                        {s.peTtm?.toFixed(1)} / {s.pb?.toFixed(2)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">{formatYuanYi(s.totalMarketCap)}</td>
                      <td className="px-4 py-2.5 text-right">
                        <button onClick={() => onSelectStock(s.symbol)} className="text-blue-700 hover:underline font-medium">
                          进入研究
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {subTab === 'compare' && (
        <div className="space-y-4">
          <div className="p-4 bg-white border border-slate-200 rounded-lg flex flex-wrap items-center gap-3">
            <GitCompare className="w-4 h-4 text-slate-500" />
            <input
              value={compareInput}
              onChange={(e) => setCompareInput(e.target.value)}
              placeholder="输入2-5只股票代码，逗号分隔（如 600519,000858,000568）"
              className="flex-1 min-w-[260px] px-3 py-2 text-sm border border-slate-200 rounded-lg font-mono"
            />
            <button
              onClick={handleCompare}
              disabled={comparing}
              className="px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              {comparing ? '采集对比中...' : '横向对比'}
            </button>
          </div>

          {compareRows.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">对比指标</th>
                    {compareRows.map((r) => (
                      <th key={r.quote.symbol} className="text-right px-4 py-3 font-medium text-slate-900">
                        <button onClick={() => onSelectStock(r.quote.symbol)} className="text-blue-700 hover:underline">
                          {r.quote.name} ({r.quote.symbol})
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                  <tr>
                    <td className="px-4 py-2.5 font-sans text-slate-600">所属板块 / 行业</td>
                    {compareRows.map((r) => (
                      <td key={r.quote.symbol} className="px-4 py-2.5 text-right font-sans">
                        {r.quote.board} · {r.quote.industry || '缺失'}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 font-sans text-slate-600">最新价 / 涨跌幅</td>
                    {compareRows.map((r) => (
                      <td key={r.quote.symbol} className={`px-4 py-2.5 text-right ${priceColorClass(r.quote.changePct)}`}>
                        {r.quote.price?.toFixed(2)} ({formatPct(r.quote.changePct)})
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 font-sans text-slate-600">总市值</td>
                    {compareRows.map((r) => (
                      <td key={r.quote.symbol} className="px-4 py-2.5 text-right">{formatYuanYi(r.quote.totalMarketCap)}</td>
                    ))}
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 font-sans text-slate-600">PE(TTM) / PB</td>
                    {compareRows.map((r) => (
                      <td key={r.quote.symbol} className="px-4 py-2.5 text-right">
                        {r.quote.peTtm ?? '缺失'} / {r.quote.pb ?? '缺失'}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 font-sans text-slate-600">最新ROE / 毛利率</td>
                    {compareRows.map((r) => {
                      const fin = r.quarterlyFinancials?.[0] || r.annualFinancials?.[0];
                      return (
                        <td key={r.quote.symbol} className="px-4 py-2.5 text-right">
                          {fin?.roe !== null && fin?.roe !== undefined ? `${fin.roe.toFixed(1)}%` : '缺失'} /{' '}
                          {fin?.grossMargin !== null && fin?.grossMargin !== undefined ? `${fin.grossMargin.toFixed(1)}%` : '缺失'}
                        </td>
                      );
                    })}
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 font-sans text-slate-600">长期投资评分 (100分)</td>
                    {compareRows.map((r) => (
                      <td key={r.quote.symbol} className="px-4 py-2.5 text-right font-semibold text-blue-700">
                        {r.scores.longTerm.total} ({r.scores.longTerm.grade})
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="px-4 py-2.5 font-sans text-slate-600">短线交易评分 (100分)</td>
                    {compareRows.map((r) => (
                      <td key={r.quote.symbol} className="px-4 py-2.5 text-right font-semibold text-slate-900">
                        {r.scores.shortTerm.total} ({r.scores.shortTerm.grade})
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {subTab === 'watchlist' && (
        <div className="bg-white border border-slate-200 rounded-lg p-5">
          {!user ? (
            <div className="py-10 text-center space-y-3">
              <p className="text-sm text-slate-600">登录后即可将关注的A股标的永久保存在您的个人 PostgreSQL 自选池中</p>
              <button
                onClick={signInWithGoogle}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800"
              >
                使用 Google 账号登录工作台
              </button>
            </div>
          ) : loadingWatchlist ? (
            <div className="py-8 text-center text-xs text-slate-500">正在同步自选股实时行情...</div>
          ) : watchlists.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500">
              当前自选池为空，请在「全市场搜索」或「个股深度研究」页面点击收藏加入。
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium">代码 / 名称</th>
                  <th className="text-left px-4 py-2.5 font-medium">分组</th>
                  <th className="text-right px-4 py-2.5 font-medium">最新价</th>
                  <th className="text-right px-4 py-2.5 font-medium">涨跌幅</th>
                  <th className="text-right px-4 py-2.5 font-medium">换手率</th>
                  <th className="text-right px-4 py-2.5 font-medium">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {watchlists.map((w) => (
                  <tr key={w.symbol} className="hover:bg-slate-50">
                    <td className="px-4 py-2.5 font-medium text-slate-900">
                      <button onClick={() => onSelectStock(w.symbol)} className="text-blue-700 hover:underline">
                        <span className="font-mono mr-1.5">{w.symbol}</span>
                        {w.quote?.name || w.stockName}
                      </button>
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{w.groupName}</td>
                    <td className={`px-4 py-2.5 text-right font-mono tabular-nums ${priceColorClass(w.quote?.changePct)}`}>
                      {w.quote?.price?.toFixed(2) ?? '缺失'}
                    </td>
                    <td className={`px-4 py-2.5 text-right font-mono tabular-nums ${priceColorClass(w.quote?.changePct)}`}>
                      {formatPct(w.quote?.changePct)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                      {w.quote?.turnoverRate ? `${w.quote.turnoverRate.toFixed(2)}%` : '-'}
                    </td>
                    <td className="px-4 py-2.5 text-right space-x-3">
                      <button onClick={() => onSelectStock(w.symbol)} className="text-blue-700 hover:underline">
                        研究
                      </button>
                      <button onClick={() => handleDeleteWatchlist(w.symbol)} className="text-slate-400 hover:text-red-600">
                        <Trash2 className="w-3.5 h-3.5 inline" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
};
