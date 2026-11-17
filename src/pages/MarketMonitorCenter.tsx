import React, { useEffect, useState } from 'react';
import { RefreshCw, ArrowUpRight, AlertCircle } from 'lucide-react';
import { apiFetch, formatPct, formatYuanYi, priceColorClass } from '../lib/api';

interface MarketMonitorCenterProps {
  onSelectStock: (symbol: string) => void;
}

export const MarketMonitorCenter: React.FC<MarketMonitorCenterProps> = ({ onSelectStock }) => {
  const [subTab, setSubTab] = useState<'overview' | 'ladder' | 'sectors' | 'lhb_macro'>('overview');
  const [overview, setOverview] = useState<any>(null);
  const [lhb, setLhb] = useState<any>(null);
  const [macro, setMacro] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await apiFetch('/api/market/overview');
      setOverview(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadLhbAndMacro = async () => {
    try {
      const [lhbRes, macroRes] = await Promise.all([
        apiFetch('/api/market/dragon-tiger'),
        apiFetch('/api/market/macro'),
      ]);
      setLhb(lhbRes);
      setMacro(macroRes.items || []);
    } catch {
      // non-fatal
    }
  };

  useEffect(() => {
    loadOverview();
  }, []);

  useEffect(() => {
    if (subTab === 'lhb_macro' && !lhb) {
      loadLhbAndMacro();
    }
  }, [subTab]);

  const ladderGroups: Record<number, any[]> = {};
  (overview?.limitUpPool || []).forEach((s: any) => {
    const b = s.continuousBoards || 1;
    if (!ladderGroups[b]) ladderGroups[b] = [];
    ladderGroups[b].push(s);
  });
  const sortedBoards = Object.keys(ladderGroups)
    .map(Number)
    .sort((a, b) => b - a);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">A股市场监控中心</h1>
          <p className="mt-1 text-xs text-slate-500">
            {overview?.provenance
              ? `${overview.provenance.dataSource} · 数据日期 ${overview.provenance.dataDate} · 状态：${overview.provenance.dataStatus}`
              : '正在采集实时/准实时市场数据...'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
            {[
              { id: 'overview', label: '市场总览与情绪' },
              { id: 'ladder', label: '涨停连板梯队' },
              { id: 'sectors', label: '行业与概念轮动' },
              { id: 'lhb_macro', label: '龙虎榜与宏观' },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setSubTab(t.id as any)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 transition-colors ${
                  subTab === t.id
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button
            onClick={loadOverview}
            disabled={loading}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            刷新行情
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {overview?.provenance?.delayNotice && (
        <div className="px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
          数据口径提示：{overview.provenance.delayNotice}
        </div>
      )}

      {loading && !overview ? (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-24 bg-white border border-slate-200 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : null}

      {overview && subTab === 'overview' && (
        <div className="space-y-6">
          {/* 5 Major Indices */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            {(overview.indices || []).map((idx: any) => (
              <div key={idx.code} className="p-4 bg-white border border-slate-200 rounded-lg">
                <div className="text-xs text-slate-500 flex items-center justify-between">
                  <span>{idx.name}</span>
                  <span className="font-mono">{idx.code.toUpperCase()}</span>
                </div>
                <div className={`mt-2 text-xl font-semibold font-mono tabular-nums ${priceColorClass(idx.changePct)}`}>
                  {idx.price !== null ? idx.price.toFixed(2) : '缺失'}
                </div>
                <div className={`mt-1 text-xs font-mono tabular-nums flex items-center justify-between ${priceColorClass(idx.changePct)}`}>
                  <span>{formatPct(idx.changePct)}</span>
                  <span className="text-slate-500">成交 {formatYuanYi(idx.amountYuan)}</span>
                </div>
              </div>
            ))}
          </div>

          {/* Breadth + Quantitative Sentiment */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 p-5 bg-white border border-slate-200 rounded-lg">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <h2 className="text-sm font-semibold text-slate-900">两市涨跌广度与涨跌停统计</h2>
                <span className="text-xs text-slate-500 font-mono tabular-nums">
                  沪深两市 {overview.breadth.shSzTurnoverYi ?? overview.breadth.totalTurnoverYi} 亿 · 沪深京 {overview.breadth.totalTurnoverYi} 亿
                </span>
              </div>
              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div>
                  <div className="text-xs text-slate-500">上涨家数</div>
                  <div className="mt-1 text-lg font-semibold font-mono tabular-nums text-red-600">
                    {overview.breadth.upCount}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">下跌家数 / 平盘</div>
                  <div className="mt-1 text-lg font-semibold font-mono tabular-nums text-emerald-600">
                    {overview.breadth.downCount}
                    <span className="text-slate-400 text-xs font-normal ml-1.5">
                      (平 {overview.breadth.flatCount ?? 0})
                    </span>
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">涨停 / 跌停</div>
                  <div className="mt-1 text-lg font-semibold font-mono tabular-nums text-slate-900">
                    <span className="text-red-600">{overview.breadth.limitUpCount}</span>
                    <span className="text-slate-400 mx-1">/</span>
                    <span className="text-emerald-600">{overview.breadth.limitDownCount}</span>
                  </div>
                </div>
                <div>
                  <div className="text-xs text-slate-500">炸板数 / 封板率</div>
                  <div className="mt-1 text-lg font-semibold font-mono tabular-nums text-slate-900">
                    {overview.breadth.brokenBoardCount ?? '缺失'}
                    <span className="text-slate-400 mx-1">/</span>
                    {overview.breadth.sealRatePct !== null ? `${overview.breadth.sealRatePct}%` : '缺失'}
                  </div>
                </div>
              </div>
              <div className="mt-5">
                <div className="flex flex-wrap justify-between gap-2 text-xs text-slate-500 mb-1.5">
                  <span>
                    全市场上涨占比 {overview.breadth.upRatioPct}%（共 {overview.breadth.totalStocks ?? (overview.breadth.upCount + overview.breadth.downCount + (overview.breadth.flatCount || 0))} 家）
                  </span>
                  <span>最高连板高度 {overview.breadth.maxContinuousBoards} 板</span>
                </div>
                {(() => {
                  const total = overview.breadth.totalStocks || (overview.breadth.upCount + overview.breadth.downCount + (overview.breadth.flatCount || 0)) || 1;
                  const upPct = (overview.breadth.upCount / total) * 100;
                  const flatPct = ((overview.breadth.flatCount || 0) / total) * 100;
                  const downPct = Math.max(0, 100 - upPct - flatPct);
                  return (
                    <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden flex">
                      <div className="bg-red-500 h-full" style={{ width: `${upPct}%` }} title={`上涨 ${overview.breadth.upCount}`} />
                      <div className="bg-slate-300 h-full" style={{ width: `${flatPct}%` }} title={`平盘 ${overview.breadth.flatCount || 0}`} />
                      <div className="bg-emerald-500 h-full" style={{ width: `${downPct}%` }} title={`下跌 ${overview.breadth.downCount}`} />
                    </div>
                  );
                })()}
                {overview.breadth.marketBreakdown && (
                  <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500 font-mono tabular-nums">
                    {['sh', 'sz', 'bj'].map((k) => {
                      const m = overview.breadth.marketBreakdown[k];
                      if (!m) return null;
                      return (
                        <span key={k}>
                          {m.name}：<span className="text-red-600">{m.up}↑</span> / <span className="text-emerald-600">{m.down}↓</span> ({m.amountYi}亿)
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="p-5 bg-white border border-slate-200 rounded-lg">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h2 className="text-sm font-semibold text-slate-900">量化市场情绪周期</h2>
                <span className="text-xs text-slate-500">纯指标客观模型</span>
              </div>
              <div className="mt-4 flex items-baseline justify-between">
                <div>
                  <div className="text-xs text-slate-500">当前情绪定性</div>
                  <div className="mt-1 text-2xl font-bold text-slate-900">
                    {overview.sentiment.phaseLabel}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-500">量化情绪分</div>
                  <div className="mt-1 text-2xl font-semibold font-mono tabular-nums text-blue-700">
                    {overview.sentiment.sentimentScore} / 100
                  </div>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 space-y-1.5 text-xs text-slate-600">
                <div className="flex justify-between">
                  <span>全市场上涨占比</span>
                  <span className="font-mono tabular-nums">{overview.sentiment.quantitativeBasis.upRatioPct}%</span>
                </div>
                <div className="flex justify-between">
                  <span>连板最高空间</span>
                  <span className="font-mono tabular-nums">{overview.sentiment.quantitativeBasis.maxContinuousBoards} 板</span>
                </div>
                <div className="flex justify-between">
                  <span>涨停封板成功率</span>
                  <span className="font-mono tabular-nums">
                    {overview.sentiment.quantitativeBasis.sealRatePct !== null
                      ? `${overview.sentiment.quantitativeBasis.sealRatePct}%`
                      : '缺失'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Hot Sectors Snapshot */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900">领涨行业板块 Top 8</h2>
                <span className="text-xs text-slate-500">点击领涨股进入研究</span>
              </div>
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium">行业名称</th>
                    <th className="text-right px-4 py-2.5 font-medium">涨跌幅</th>
                    <th className="text-right px-4 py-2.5 font-medium">估算净流入</th>
                    <th className="text-left px-4 py-2.5 font-medium">领涨股</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(overview.industries || []).slice(0, 8).map((ind: any) => (
                    <tr key={ind.code} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-medium text-slate-900">{ind.name}</td>
                      <td className={`px-4 py-2.5 text-right font-mono tabular-nums ${priceColorClass(ind.changePct)}`}>
                        {formatPct(ind.changePct)}
                      </td>
                      <td className={`px-4 py-2.5 text-right font-mono tabular-nums ${priceColorClass(ind.netInflowEst)}`}>
                        {formatYuanYi(ind.netInflowEst)}
                      </td>
                      <td className="px-4 py-2.5">
                        {ind.leaderCode ? (
                          <button
                            onClick={() => onSelectStock(ind.leaderCode)}
                            className="text-blue-700 hover:underline inline-flex items-center gap-0.5"
                          >
                            {ind.leaderName}
                            <ArrowUpRight className="w-3 h-3" />
                          </button>
                        ) : (
                          '缺失'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900">领涨概念题材 Top 8</h2>
                <span className="text-xs text-slate-500">注：资金列属第三方估算口径</span>
              </div>
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium">概念题材</th>
                    <th className="text-right px-4 py-2.5 font-medium">涨跌幅</th>
                    <th className="text-right px-4 py-2.5 font-medium">涨/跌家数</th>
                    <th className="text-left px-4 py-2.5 font-medium">领涨股</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(overview.concepts || []).slice(0, 8).map((c: any) => (
                    <tr key={c.code} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-medium text-slate-900">{c.name}</td>
                      <td className={`px-4 py-2.5 text-right font-mono tabular-nums ${priceColorClass(c.changePct)}`}>
                        {formatPct(c.changePct)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums text-slate-600">
                        {c.upCount}/{c.downCount}
                      </td>
                      <td className="px-4 py-2.5">
                        {c.leaderCode ? (
                          <button
                            onClick={() => onSelectStock(c.leaderCode)}
                            className="text-blue-700 hover:underline inline-flex items-center gap-0.5"
                          >
                            {c.leaderName}
                            <ArrowUpRight className="w-3 h-3" />
                          </button>
                        ) : (
                          '缺失'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {overview && subTab === 'ladder' && (
        <div className="space-y-4">
          <div className="p-4 bg-white border border-slate-200 rounded-lg flex flex-wrap items-center justify-between gap-4 text-xs text-slate-600">
            <div>
              涨跌停池日期：<span className="font-mono font-medium text-slate-900">{overview.ztDate}</span>
              <span className="mx-2">·</span>
              涨停总数：<span className="font-mono font-semibold text-red-600">{overview.breadth.limitUpCount}</span>
              <span className="mx-2">·</span>
              跌停总数：<span className="font-mono font-semibold text-emerald-600">{overview.breadth.limitDownCount}</span>
              <span className="mx-2">·</span>
              最高连板：<span className="font-mono font-semibold text-slate-900">{overview.breadth.maxContinuousBoards}板</span>
              <span className="mx-2">·</span>
              封板率：<span className="font-mono font-medium text-slate-900">{overview.breadth.sealRatePct ?? '缺失'}%</span>
            </div>
            <div className="text-slate-500">涨停原因/题材如数据源未直接返回则标注所属行业板块，不做猜测</div>
          </div>

          {sortedBoards.length === 0 ? (
            <div className="p-8 bg-white border border-slate-200 rounded-lg text-center text-sm text-slate-500">
              当前交易时段或接口暂未返回涨停梯队数据。
            </div>
          ) : (
            sortedBoards.map((boardNum) => (
              <div key={boardNum} className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-900">
                    {boardNum >= 2 ? `${boardNum} 连板梯队` : '首板梯队'}（{ladderGroups[boardNum].length} 只）
                  </span>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead className="text-slate-500 border-b border-slate-100">
                      <tr>
                        <th className="text-left px-4 py-2 font-medium">代码 / 名称</th>
                        <th className="text-left px-4 py-2 font-medium">所属行业</th>
                        <th className="text-right px-4 py-2 font-medium">最新价</th>
                        <th className="text-right px-4 py-2 font-medium">换手率</th>
                        <th className="text-right px-4 py-2 font-medium">成交额</th>
                        <th className="text-right px-4 py-2 font-medium">首次封板</th>
                        <th className="text-right px-4 py-2 font-medium">炸板次数</th>
                        <th className="text-right px-4 py-2 font-medium">封单金额</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {ladderGroups[boardNum].map((item: any) => (
                        <tr key={item.symbol} className="hover:bg-slate-50">
                          <td className="px-4 py-2.5">
                            <button
                              onClick={() => onSelectStock(item.symbol)}
                              className="font-medium text-blue-700 hover:underline text-left"
                            >
                              <span className="font-mono mr-1.5">{item.symbol}</span>
                              {item.name}
                            </button>
                          </td>
                          <td className="px-4 py-2.5 text-slate-600">{item.industry}</td>
                          <td className="px-4 py-2.5 text-right font-mono tabular-nums text-red-600">
                            {item.price !== null ? item.price.toFixed(2) : '缺失'}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                            {item.turnoverRate !== null ? `${item.turnoverRate.toFixed(2)}%` : '缺失'}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                            {formatYuanYi(item.amountYuan)}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                            {item.firstSealTime || '缺失'}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                            {item.openTimes !== null ? item.openTimes : '缺失'}
                          </td>
                          <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                            {formatYuanYi(item.sealAmount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))
          )}

          {(overview.limitDownPool || []).length > 0 && (
            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 bg-emerald-50 border-b border-emerald-200 flex items-center justify-between">
                <span className="text-xs font-semibold text-emerald-900">
                  跌停风险池（共 {overview.breadth.limitDownCount} 只，展示前 {overview.limitDownPool.length} 只）
                </span>
                <span className="text-[11px] text-emerald-700">按封单金额降序</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="text-slate-500 border-b border-slate-100">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium">代码 / 名称</th>
                      <th className="text-left px-4 py-2 font-medium">所属行业</th>
                      <th className="text-right px-4 py-2 font-medium">最新价</th>
                      <th className="text-right px-4 py-2 font-medium">跌幅</th>
                      <th className="text-right px-4 py-2 font-medium">换手率</th>
                      <th className="text-right px-4 py-2 font-medium">成交额</th>
                      <th className="text-right px-4 py-2 font-medium">最后封板</th>
                      <th className="text-right px-4 py-2 font-medium">开板次数</th>
                      <th className="text-right px-4 py-2 font-medium">封单金额</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {overview.limitDownPool.map((item: any) => (
                      <tr key={`dt-${item.symbol}`} className="hover:bg-slate-50">
                        <td className="px-4 py-2.5">
                          <button
                            onClick={() => onSelectStock(item.symbol)}
                            className="font-medium text-blue-700 hover:underline text-left"
                          >
                            <span className="font-mono mr-1.5">{item.symbol}</span>
                            {item.name}
                          </button>
                        </td>
                        <td className="px-4 py-2.5 text-slate-600">{item.industry}</td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums text-emerald-600">
                          {item.price !== null ? item.price.toFixed(2) : '缺失'}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums text-emerald-600">
                          {item.changePct !== null ? `${item.changePct.toFixed(2)}%` : '缺失'}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                          {item.turnoverRate !== null ? `${item.turnoverRate.toFixed(2)}%` : '缺失'}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                          {formatYuanYi(item.amountYuan)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                          {item.lastSealTime || '缺失'}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                          {item.openTimes !== null ? item.openTimes : '缺失'}
                        </td>
                        <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                          {formatYuanYi(item.sealAmount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {overview && subTab === 'sectors' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 text-sm font-semibold text-slate-900">
              全部行业板块强度排名（Top 20）
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium">行业</th>
                    <th className="text-right px-4 py-2.5 font-medium">涨跌幅</th>
                    <th className="text-right px-4 py-2.5 font-medium">成交额</th>
                    <th className="text-right px-4 py-2.5 font-medium">估算净流</th>
                    <th className="text-left px-4 py-2.5 font-medium">领涨股</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(overview.industries || []).map((ind: any) => (
                    <tr key={ind.code} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-medium text-slate-900">{ind.name}</td>
                      <td className={`px-4 py-2.5 text-right font-mono tabular-nums ${priceColorClass(ind.changePct)}`}>
                        {formatPct(ind.changePct)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">{formatYuanYi(ind.amountYuan)}</td>
                      <td className={`px-4 py-2.5 text-right font-mono tabular-nums ${priceColorClass(ind.netInflowEst)}`}>
                        {formatYuanYi(ind.netInflowEst)}
                      </td>
                      <td className="px-4 py-2.5">
                        {ind.leaderCode && (
                          <button onClick={() => onSelectStock(ind.leaderCode)} className="text-blue-700 hover:underline">
                            {ind.leaderName}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 text-sm font-semibold text-slate-900">
              热门概念题材轮动排名（Top 20）
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium">概念名称</th>
                    <th className="text-right px-4 py-2.5 font-medium">涨跌幅</th>
                    <th className="text-right px-4 py-2.5 font-medium">成交额</th>
                    <th className="text-right px-4 py-2.5 font-medium">涨/跌</th>
                    <th className="text-left px-4 py-2.5 font-medium">领涨股</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(overview.concepts || []).map((c: any) => (
                    <tr key={c.code} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-medium text-slate-900">{c.name}</td>
                      <td className={`px-4 py-2.5 text-right font-mono tabular-nums ${priceColorClass(c.changePct)}`}>
                        {formatPct(c.changePct)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">{formatYuanYi(c.amountYuan)}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">
                        {c.upCount}/{c.downCount}
                      </td>
                      <td className="px-4 py-2.5">
                        {c.leaderCode && (
                          <button onClick={() => onSelectStock(c.leaderCode)} className="text-blue-700 hover:underline">
                            {c.leaderName}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {subTab === 'lhb_macro' && (
        <div className="space-y-6">
          {/* Macro Indicators */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {macro.map((m) => (
              <div key={m.key} className="p-4 bg-white border border-slate-200 rounded-lg">
                <div className="text-xs text-slate-500">{m.name}</div>
                <div className="mt-2 text-xl font-semibold font-mono tabular-nums text-slate-900">
                  {m.latestValue !== null && m.latestValue !== undefined ? `${m.latestValue}${m.unit}` : '缺失'}
                </div>
                <div className="mt-1 text-xs text-slate-500">
                  统计期：{m.latestPeriod} · {m.dataStatus}
                </div>
              </div>
            ))}
          </div>

          {/* Dragon Tiger List */}
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">近期龙虎榜异动与后续表现统计</h2>
              <span className="text-xs text-slate-500">{lhb?.provenance?.dataSource || '加载中...'}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium">日期</th>
                    <th className="text-left px-4 py-2.5 font-medium">代码 / 名称</th>
                    <th className="text-right px-4 py-2.5 font-medium">涨跌幅</th>
                    <th className="text-right px-4 py-2.5 font-medium">龙虎榜净买</th>
                    <th className="text-left px-4 py-2.5 font-medium">上榜原因</th>
                    <th className="text-right px-4 py-2.5 font-medium">后1日</th>
                    <th className="text-right px-4 py-2.5 font-medium">后3日</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(lhb?.items || []).map((row: any, i: number) => (
                    <tr key={`${row.symbol}-${row.tradeDate}-${i}`} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5 font-mono text-slate-500">{row.tradeDate}</td>
                      <td className="px-4 py-2.5">
                        <button onClick={() => onSelectStock(row.symbol)} className="text-blue-700 hover:underline font-medium">
                          <span className="font-mono mr-1">{row.symbol}</span>
                          {row.name}
                        </button>
                      </td>
                      <td className={`px-4 py-2.5 text-right font-mono tabular-nums ${priceColorClass(row.changePct)}`}>
                        {formatPct(row.changePct)}
                      </td>
                      <td className={`px-4 py-2.5 text-right font-mono tabular-nums ${priceColorClass(row.netBuyAmount)}`}>
                        {formatYuanYi(row.netBuyAmount)}
                      </td>
                      <td className="px-4 py-2.5 text-slate-600 max-w-xs truncate">{row.reason}</td>
                      <td className={`px-4 py-2.5 text-right font-mono tabular-nums ${priceColorClass(row.after1dPct)}`}>
                        {row.after1dPct !== null ? formatPct(row.after1dPct) : '待统计'}
                      </td>
                      <td className={`px-4 py-2.5 text-right font-mono tabular-nums ${priceColorClass(row.after3dPct)}`}>
                        {row.after3dPct !== null ? formatPct(row.after3dPct) : '待统计'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
