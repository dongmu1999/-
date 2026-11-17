import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Brain,
  CheckCircle2,
  Cpu,
  Download,
  ExternalLink,
  Printer,
  RefreshCw,
  Star,
} from 'lucide-react';
import { KlineChart } from '../components/KlineChart';
import {
  BusinessMixChart,
  CapitalFlowVisuals,
  FinancialTrendChart,
  PriceRangeLadder,
  RsiZoneBar,
  ScoreRadarChart,
} from '../components/ResearchCharts';
import {
  apiFetch,
  downloadTextFile,
  formatPct,
  formatYuanYi,
  priceColorClass,
} from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

interface StockResearchWorkbenchProps {
  symbol: string;
  onSelectStock: (symbol: string) => void;
}

export const StockResearchWorkbench: React.FC<StockResearchWorkbenchProps> = ({
  symbol,
  onSelectStock,
}) => {
  const { user, signInWithGoogle } = useAuth();
  const [timeframe, setTimeframe] = useState<'1m' | '5m' | '15m' | '30m' | '60m' | 'day' | 'week' | 'month'>('day');
  const [showMA, setShowMA] = useState(true);
  const [showBoll, setShowBoll] = useState(false);
  const [subTab, setSubTab] = useState<'tech' | 'fundamental' | 'value_short' | 'ai_plan'>('tech');
  const [finPeriodMode, setFinPeriodMode] = useState<'quarterly' | 'annual'>('quarterly');
  const [selectedAiRoleIdx, setSelectedAiRoleIdx] = useState<number>(0);

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // AI Research state
  const [tradingStyle, setTradingStyle] = useState('波段');
  const [aiRunning, setAiRunning] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiResult, setAiResult] = useState<any>(null);
  const [planConfirmed, setPlanConfirmed] = useState(false);
  const [watchMessage, setWatchMessage] = useState<string | null>(null);

  // Quick AI Model / DeepSeek Configuration state
  const [aiConfigOpen, setAiConfigOpen] = useState(false);
  const [aiSettings, setAiSettings] = useState<{
    aiProviderType: string;
    aiBaseUrl: string;
    aiModelName: string;
    aiApiKeyConfigured: boolean;
    aiApiKeyLast4: string | null;
  }>({
    aiProviderType: 'deepseek',
    aiBaseUrl: 'https://api.deepseek.com',
    aiModelName: 'deepseek-chat',
    aiApiKeyConfigured: false,
    aiApiKeyLast4: null,
  });
  const [dsKeyInput, setDsKeyInput] = useState('');
  const [dsTesting, setDsTesting] = useState(false);
  const [dsStatusMsg, setDsStatusMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const loadResearch = async (tf = timeframe) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/stocks/${symbol}/research?timeframe=${tf}`);
      setData(res);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setAiResult(null);
    setPlanConfirmed(false);
    setSelectedAiRoleIdx(0);
    loadResearch(timeframe);
  }, [symbol]);

  useEffect(() => {
    if (!user) return;
    apiFetch('/api/user/settings')
      .then((s) => {
        setAiSettings({
          aiProviderType: s.aiProviderType || 'gemini',
          aiBaseUrl: s.aiBaseUrl || 'https://api.deepseek.com',
          aiModelName: s.aiModelName || (s.aiProviderType === 'gemini' ? 'gemini-4-hydrogen' : 'deepseek-chat'),
          aiApiKeyConfigured: Boolean(s.aiApiKeyConfigured),
          aiApiKeyLast4: s.aiApiKeyLast4 || null,
        });
      })
      .catch(() => {});
  }, [user]);

  const handleSaveAndTestAi = async (testOnly = false) => {
    if (!user) {
      await signInWithGoogle();
      return;
    }
    setDsTesting(true);
    setDsStatusMsg(null);
    try {
      if (!testOnly) {
        const payload: Record<string, any> = {
          aiProviderType: aiSettings.aiProviderType,
          aiBaseUrl: aiSettings.aiBaseUrl || 'https://api.deepseek.com',
          aiModelName: aiSettings.aiModelName || 'deepseek-chat',
        };
        if (dsKeyInput.trim()) {
          payload.aiApiKeyPlain = dsKeyInput.trim();
        }
        await apiFetch('/api/user/settings', {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
      }

      const testRes = await apiFetch('/api/user/test-ai', {
        method: 'POST',
        body: JSON.stringify({
          aiProviderType: aiSettings.aiProviderType,
          aiBaseUrl: aiSettings.aiBaseUrl || 'https://api.deepseek.com',
          aiModelName: aiSettings.aiModelName || 'deepseek-chat',
          aiApiKeyPlain: dsKeyInput.trim() || undefined,
        }),
      });

      const refreshed = await apiFetch('/api/user/settings');
      setAiSettings({
        aiProviderType: refreshed.aiProviderType || aiSettings.aiProviderType,
        aiBaseUrl: refreshed.aiBaseUrl || aiSettings.aiBaseUrl,
        aiModelName: refreshed.aiModelName || aiSettings.aiModelName,
        aiApiKeyConfigured: Boolean(refreshed.aiApiKeyConfigured),
        aiApiKeyLast4: refreshed.aiApiKeyLast4 || null,
      });
      setDsKeyInput('');
      setDsStatusMsg({
        type: 'ok',
        text: `连接成功 (${testRes.model} · 延迟 ${testRes.latencyMs}ms · 回复: ${testRes.replyPreview})`,
      });
    } catch (err: any) {
      setDsStatusMsg({ type: 'err', text: err.message });
    } finally {
      setDsTesting(false);
    }
  };

  const handleTimeframeChange = (tf: typeof timeframe) => {
    setTimeframe(tf);
    loadResearch(tf);
  };

  const handleAddWatchlist = async () => {
    if (!user) {
      await signInWithGoogle();
      return;
    }
    try {
      await apiFetch('/api/watchlists', {
        method: 'POST',
        body: JSON.stringify({
          symbol: data.quote.symbol,
          stockName: data.quote.name,
        }),
      });
      setWatchMessage('已加入自选池');
      setTimeout(() => setWatchMessage(null), 3000);
    } catch (err: any) {
      setWatchMessage(err.message);
    }
  };

  const handleRunAiResearch = async () => {
    if (!user) {
      await signInWithGoogle();
      return;
    }
    setAiRunning(true);
    setAiError(null);
    setPlanConfirmed(false);
    try {
      const res = await apiFetch(`/api/stocks/${symbol}/ai-research`, {
        method: 'POST',
        body: JSON.stringify({ tradingStyle }),
      });
      setAiResult(res);
      setSelectedAiRoleIdx(0);
      setSubTab('ai_plan');
    } catch (err: any) {
      setAiError(err.message);
    } finally {
      setAiRunning(false);
    }
  };

  const handleConfirmPlan = async () => {
    if (!aiResult?.plan?.id) return;
    try {
      await apiFetch(`/api/trading-plans/${aiResult.plan.id}/confirm`, { method: 'POST' });
      setPlanConfirmed(true);
    } catch (err: any) {
      setAiError(err.message);
    }
  };

  const handleExportMarkdown = () => {
    if (aiResult?.report?.reportMarkdown) {
      downloadTextFile(`${data.quote.symbol}_${data.quote.name}_投研报告.md`, aiResult.report.reportMarkdown);
      return;
    }
    if (!data) return;
    const md =
      `# ${data.quote.name} (${data.quote.symbol}) 基础量化研究摘要\n\n` +
      `- 数据来源：${data.quote.provenance.dataSource}\n- 数据日期：${data.quote.provenance.dataDate} (${data.quote.provenance.dataStatus})\n` +
      `- 最新价：${data.quote.price} 元 (${formatPct(data.quote.changePct)})\n` +
      `- 长期评分：${data.scores.longTerm.total}/100 (${data.scores.longTerm.grade})\n` +
      `- 短线评分：${data.scores.shortTerm.total}/100 (${data.scores.shortTerm.grade})\n` +
      `- 技术趋势：${data.technicals.trendDirection} · ${data.technicals.maAlignment}\n`;
    downloadTextFile(`${data.quote.symbol}_${data.quote.name}_基础研究.md`, md);
  };

  const handleExportCsv = () => {
    if (!data?.annualFinancials?.length) return;
    const header = '报告期,类型,营业收入,营收同比%,净利润,净利同比%,经营现金流,毛利率%,ROE%,资产负债率%\n';
    const rows = data.annualFinancials
      .map((f: any) =>
        [
          f.reportDate,
          f.reportType,
          f.revenue ?? '',
          f.revenueYoy ?? '',
          f.netProfit ?? '',
          f.netProfitYoy ?? '',
          f.operatingCashFlow ?? '',
          f.grossMargin ?? '',
          f.roe ?? '',
          f.debtToAssetRatio ?? '',
        ].join(',')
      )
      .join('\n');
    downloadTextFile(
      `${data.quote.symbol}_财务数据.csv`,
      '\uFEFF' + header + rows,
      'text/csv;charset=utf-8'
    );
  };

  if (loading && !data) {
    return (
      <div className="p-8 bg-white border border-slate-200 rounded-lg text-center text-sm text-slate-500">
        正在并行采集 {symbol} 真实行情、K线、F10财报、资金流向与巨潮资讯公告...
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="p-6 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
        {error}
      </div>
    );
  }

  if (!data) return null;

  const { quote, tradingRule, technicals, valuation } = data;
  const activeScores = aiResult?.scores || data.scores;
  const latestInd = technicals.latest;

  // 52w position percentage
  const pos52wPct =
    quote.price && quote.high52w && quote.low52w && quote.high52w > quote.low52w
      ? Math.max(0, Math.min(100, ((quote.price - quote.low52w) / (quote.high52w - quote.low52w)) * 100))
      : null;

  const finRows =
    finPeriodMode === 'quarterly'
      ? data.quarterlyFinancials || []
      : data.annualFinancials || [];

  const roleOutputs: any[] = aiResult?.aiRes?.roleOutputs || [];
  const activeRole = roleOutputs[selectedAiRoleIdx] || null;

  return (
    <div className="space-y-5">
      {/* Stock Header Summary */}
      <div className="p-5 bg-white border border-slate-200 rounded-lg space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-baseline gap-3">
              <h1 className="text-2xl font-bold text-slate-900">{quote.name}</h1>
              <span className="font-mono text-base text-slate-500">{quote.tsCode}</span>
              {quote.isSt && <span className="text-xs font-semibold text-amber-700">[ST风险警示]</span>}
              {quote.isSuspended && <span className="text-xs font-semibold text-red-700">[停牌]</span>}
            </div>
            <div className="mt-1 text-xs text-slate-500">
              {quote.exchange} · {quote.board} · 行业：{quote.industry || '未知'} · 数据日期：{quote.provenance.dataDate} · 状态：{quote.provenance.dataStatus}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 no-print">
            <button
              onClick={handleAddWatchlist}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <Star className="w-3.5 h-3.5 text-amber-500" />
              {watchMessage || '加自选'}
            </button>
            <button
              onClick={() => loadResearch(timeframe)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              刷新
            </button>
            <button
              onClick={handleExportMarkdown}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              导出MD
            </button>
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <Printer className="w-3.5 h-3.5" />
              打印PDF
            </button>
            <button
              onClick={handleRunAiResearch}
              disabled={aiRunning}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 whitespace-nowrap shrink-0 disabled:opacity-60"
            >
              <Brain className="w-3.5 h-3.5" />
              {aiRunning ? '9角色AI研判中...' : '启动AI多角色研究'}
            </button>
          </div>
        </div>

        {/* Price & Core Quote Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-9 gap-4 pt-3 border-t border-slate-100">
          <div className="col-span-2">
            <div className="text-xs text-slate-500">最新价格 / 涨跌幅</div>
            <div className={`mt-1 text-2xl font-bold font-mono tabular-nums ${priceColorClass(quote.changePct)}`}>
              {quote.price !== null ? quote.price.toFixed(2) : '缺失'}
              <span className="ml-2 text-sm font-medium">{formatPct(quote.changePct)}</span>
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">今开 / 昨收</div>
            <div className="mt-1 text-xs font-mono tabular-nums text-slate-900">
              {quote.open?.toFixed(2) ?? '-'} / {quote.prevClose?.toFixed(2) ?? '-'}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">最高 / 最低</div>
            <div className="mt-1 text-xs font-mono tabular-nums text-slate-900">
              {quote.high?.toFixed(2) ?? '-'} / {quote.low?.toFixed(2) ?? '-'}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">成交额 / 换手</div>
            <div className="mt-1 text-xs font-mono tabular-nums text-slate-900">
              {formatYuanYi(quote.amount)} · {quote.turnoverRate ?? '-'}%
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">总市值 / 流通</div>
            <div className="mt-1 text-xs font-mono tabular-nums text-slate-900">
              {formatYuanYi(quote.totalMarketCap)} / {formatYuanYi(quote.floatMarketCap)}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">PE(TTM) / PB</div>
            <div className="mt-1 text-xs font-mono tabular-nums text-slate-900">
              {quote.peTtm ?? '-'} / {quote.pb ?? '-'}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">股息率(TTM)</div>
            <div className="mt-1 text-xs font-mono tabular-nums text-slate-900">
              {quote.dividendYield !== null && quote.dividendYield !== undefined
                ? `${quote.dividendYield.toFixed(2)}%`
                : '-'}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">52周高 / 低</div>
            <div className="mt-1 text-xs font-mono tabular-nums text-slate-900">
              {quote.high52w ?? '-'} / {quote.low52w ?? '-'}
            </div>
          </div>
        </div>

        {/* Visual Quick-Glance Summary Strip */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
          <button
            type="button"
            onClick={() => setSubTab('ai_plan')}
            className="text-left p-3 bg-slate-50 border border-slate-200 rounded-lg hover:border-blue-300 transition-colors"
          >
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">长期价值评分</span>
              <span className="font-mono font-bold text-blue-700">
                {activeScores.longTerm.total} / 100 · {activeScores.longTerm.grade}
              </span>
            </div>
            <div className="mt-2 h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
              <div className="h-full bg-blue-700 rounded-full" style={{ width: `${activeScores.longTerm.total}%` }} />
            </div>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('ai_plan')}
            className="text-left p-3 bg-slate-50 border border-slate-200 rounded-lg hover:border-teal-300 transition-colors"
          >
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">短线交易评分</span>
              <span className="font-mono font-bold text-teal-700">
                {activeScores.shortTerm.total} / 100 · {activeScores.shortTerm.grade}
              </span>
            </div>
            <div className="mt-2 h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
              <div className="h-full bg-teal-600 rounded-full" style={{ width: `${activeScores.shortTerm.total}%` }} />
            </div>
          </button>

          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">52周价格相对分位</span>
              <span className="font-mono font-semibold text-slate-900">
                {pos52wPct !== null ? `${pos52wPct.toFixed(1)}%` : '-'}
              </span>
            </div>
            <div className="mt-2 h-1.5 w-full bg-slate-200 rounded-full relative">
              {pos52wPct !== null && (
                <div
                  className="h-2.5 w-2.5 bg-slate-900 rounded-full border border-white absolute top-1/2 -translate-y-1/2 -translate-x-1/2"
                  style={{ left: `${pos52wPct}%` }}
                />
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={() => setSubTab('value_short')}
            className="text-left p-3 bg-slate-50 border border-slate-200 rounded-lg hover:border-slate-300 transition-colors"
          >
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-500">当日主力估算净流向</span>
              <span className={`font-mono font-bold ${priceColorClass(data.capitalFlow?.todaySnapshot?.mainNetInflowEst)}`}>
                {data.capitalFlow?.todaySnapshot
                  ? `${data.capitalFlow.todaySnapshot.mainNetInflowEst >= 0 ? '+' : ''}${formatYuanYi(
                      data.capitalFlow.todaySnapshot.mainNetInflowEst
                    )}`
                  : '-'}
              </span>
            </div>
            <div className="mt-1.5 text-[11px] text-slate-500 truncate">
              {data.marketContext?.sentiment
                ? `市场情绪：${data.marketContext.sentiment.phaseLabel} (${data.marketContext.sentiment.sentimentScore}分)`
                : '第三方统计估算口径'}
            </div>
          </button>
        </div>

        {/* Dynamic Trading Rule Bar */}
        <div className="px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 flex flex-wrap items-center justify-between gap-2">
          <div>
            <span className="font-medium text-slate-900">规则引擎：</span>
            {tradingRule.ruleName} · {tradingRule.tPlusRule} ·{' '}
            <span className="font-mono font-medium text-slate-900">
              {tradingRule.priceLimitPct !== null ? `±${tradingRule.priceLimitPct}%` : '新股不设限期'}
            </span>
            {tradingRule.limitUpPriceValue && (
              <span className="ml-2 font-mono">
                (涨停 {tradingRule.limitUpPriceValue} / 跌停 {tradingRule.limitDownPriceValue})
              </span>
            )}
            <span className="mx-2">·</span>
            最小申报 {tradingRule.minOrderQty} 股
          </div>
          <a
            href={tradingRule.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="text-blue-700 hover:underline inline-flex items-center gap-1"
          >
            交易所规则来源
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      {/* Sub-navigation tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 no-print">
        <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-lg">
          {[
            { id: 'tech', label: '1. K线与技术图表' },
            { id: 'fundamental', label: '2. 基本面、主营构成与财报图' },
            { id: 'value_short', label: '3. 估值标尺、资金流与公告' },
            { id: 'ai_plan', label: '4. 双轨雷达评分、AI研究与计划' },
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

      {/* TAB 1: KLINE & TECHNICALS */}
      {subTab === 'tech' && (
        <div className="space-y-6">
          <div className="p-5 bg-white border border-slate-200 rounded-lg space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-lg">
                {(['1m', '5m', '15m', '30m', '60m', 'day', 'week', 'month'] as const).map((tf) => (
                  <button
                    key={tf}
                    onClick={() => handleTimeframeChange(tf)}
                    className={`px-2.5 py-1 text-xs font-mono rounded-md whitespace-nowrap shrink-0 ${
                      timeframe === tf ? 'bg-white text-slate-900 shadow-sm font-medium' : 'text-slate-600'
                    }`}
                  >
                    {tf === 'day' ? '日线' : tf === 'week' ? '周线' : tf === 'month' ? '月线' : tf}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-4 text-xs text-slate-600">
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={showMA} onChange={(e) => setShowMA(e.target.checked)} />
                  MA5/20/60
                </label>
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input type="checkbox" checked={showBoll} onChange={(e) => setShowBoll(e.target.checked)} />
                  BOLL布林带
                </label>
                <span className="text-slate-400">{data.ohlcvProvenance?.dataSource}</span>
              </div>
            </div>

            <KlineChart
              bars={data.ohlcv}
              indicators={technicals.series}
              showMA={showMA}
              showBoll={showBoll}
              height={420}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="p-5 bg-white border border-slate-200 rounded-lg space-y-4">
              <h3 className="text-sm font-semibold text-slate-900 border-b border-slate-100 pb-2.5">
                真实K线量化技术指标 ({timeframe})
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                <div>
                  <div className="text-slate-500">MA5 / 10 / 20</div>
                  <div className="mt-1 font-mono tabular-nums text-slate-900">
                    {latestInd?.ma5?.toFixed(2) ?? '-'} / {latestInd?.ma10?.toFixed(2) ?? '-'} / {latestInd?.ma20?.toFixed(2) ?? '-'}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">MA60 / 120 / 250</div>
                  <div className="mt-1 font-mono tabular-nums text-slate-900">
                    {latestInd?.ma60?.toFixed(2) ?? '-'} / {latestInd?.ma120?.toFixed(2) ?? '-'} / {latestInd?.ma250?.toFixed(2) ?? '-'}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">MACD (DIF/DEA/柱)</div>
                  <div className="mt-1 font-mono tabular-nums text-slate-900">
                    {latestInd?.macdDif?.toFixed(2) ?? '-'} / {latestInd?.macdDea?.toFixed(2) ?? '-'} / {latestInd?.macdHist?.toFixed(2) ?? '-'}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">KDJ (K/D/J)</div>
                  <div className="mt-1 font-mono tabular-nums text-slate-900">
                    {latestInd?.kdjK ?? '-'} / {latestInd?.kdjD ?? '-'} / {latestInd?.kdjJ ?? '-'}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">BOLL (上/中/下)</div>
                  <div className="mt-1 font-mono tabular-nums text-slate-900">
                    {latestInd?.bollUpper?.toFixed(2) ?? '-'} / {latestInd?.bollMid?.toFixed(2) ?? '-'} / {latestInd?.bollLower?.toFixed(2) ?? '-'}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">ATR(14) 波动幅度</div>
                  <div className="mt-1 font-mono tabular-nums text-slate-900">
                    {latestInd?.atr14?.toFixed(2) ?? '-'} 元
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">VWAP (20周期)</div>
                  <div className="mt-1 font-mono tabular-nums text-slate-900">
                    {latestInd?.vwap?.toFixed(2) ?? '-'}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">OBV 能量潮</div>
                  <div className="mt-1 font-mono tabular-nums text-slate-900">
                    {latestInd?.obv ? formatYuanYi(latestInd.obv) : '-'}
                  </div>
                </div>
              </div>
              <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-500">
                VWAP 口径说明：{technicals.vwapMethodology}
              </div>
            </div>

            <div className="p-5 bg-white border border-slate-200 rounded-lg space-y-3 text-xs">
              <h3 className="text-sm font-semibold text-slate-900 border-b border-slate-100 pb-2.5">
                技术位置标尺与形态结构识别
              </h3>
              <RsiZoneBar rsi={latestInd?.rsi14} />
              <PriceRangeLadder
                title="关键支撑位 / 现价 / 压力位标尺"
                currentPrice={quote.price}
                markers={[
                  ...(technicals.supportLevels || []).slice(0, 2).map((v: number, i: number) => ({
                    label: `支撑${i + 1}`,
                    value: v,
                    colorClass: 'bg-emerald-600 text-white',
                  })),
                  ...(technicals.resistanceLevels || []).slice(0, 2).map((v: number, i: number) => ({
                    label: `压力${i + 1}`,
                    value: v,
                    colorClass: 'bg-red-600 text-white',
                  })),
                ]}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 text-slate-700">
                <div><span className="text-slate-500">趋势：</span><span className="font-semibold text-slate-900">{technicals.trendDirection}</span> ({technicals.maAlignment})</div>
                <div><span className="text-slate-500">量能与状态：</span>{technicals.volumeAnalysis} · {technicals.breakoutState}</div>
                {technicals.crossovers.length > 0 && (
                  <div className="text-blue-700"><span className="text-slate-500">交叉信号：</span>{technicals.crossovers.join('；')}</div>
                )}
                {technicals.candlestickPatterns.length > 0 && (
                  <div><span className="text-slate-500">K线形态：</span>{technicals.candlestickPatterns.join('；')}</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: FUNDAMENTALS & PEERS */}
      {subTab === 'fundamental' && (
        <div className="space-y-6">
          <div className="p-5 bg-white border border-slate-200 rounded-lg space-y-4 text-xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <h2 className="text-sm font-semibold text-slate-900">公司档案与主营收入结构</h2>
              <button onClick={handleExportCsv} className="text-blue-700 hover:underline inline-flex items-center gap-1">
                <Download className="w-3.5 h-3.5" />
                导出财务CSV
              </button>
            </div>
            {data.profile ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-2 leading-relaxed text-slate-700">
                  <div><span className="text-slate-500">公司全称：</span><span className="font-medium text-slate-900">{data.profile.orgName || quote.name}</span></div>
                  <div><span className="text-slate-500">董事长 / 总经理：</span>{data.profile.chairman || '-'} / {data.profile.president || '-'}</div>
                  <div>
                    <span className="text-slate-500">上市日期 / 员工：</span>
                    <span className="font-mono">{data.profile.listDate || '-'}</span> ·{' '}
                    <span className="font-mono">{data.profile.employees ?? '-'} 人</span> · {data.profile.province || '-'}
                  </div>
                  <div><span className="text-slate-500 font-medium">主营业务：</span>{data.profile.mainBusiness || '暂无描述'}</div>
                  <div className="text-slate-600"><span className="text-slate-500 font-medium">经营范围：</span>{data.profile.businessScope || '-'}</div>
                </div>
                <div>
                  {data.profile.businessComposition?.length > 0 ? (
                    <BusinessMixChart composition={data.profile.businessComposition} />
                  ) : (
                    <div className="p-4 bg-slate-50 rounded text-slate-500">暂无产品拆解明细。</div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-slate-500">F10公司概况暂未返回。</div>
            )}
          </div>

          {valuation.anomalies.length > 0 && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 space-y-1">
              <div className="font-semibold flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4" />
                财务质量异常预警
              </div>
              {valuation.anomalies.map((a: string, i: number) => (
                <div key={i}>· {a}</div>
              ))}
            </div>
          )}

          {/* Period Toggle + Visual Financial Chart */}
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg text-xs">
                <button
                  onClick={() => setFinPeriodMode('quarterly')}
                  className={`px-3 py-1.5 rounded-md font-medium ${
                    finPeriodMode === 'quarterly' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                  }`}
                >
                  最近季度报表 (单期累计)
                </button>
                <button
                  onClick={() => setFinPeriodMode('annual')}
                  className={`px-3 py-1.5 rounded-md font-medium ${
                    finPeriodMode === 'annual' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
                  }`}
                >
                  过去5年完整年报对比
                </button>
              </div>
              <span className="text-xs text-slate-500">{data.financialProvenance?.dataSource}</span>
            </div>

            <FinancialTrendChart
              rows={finRows}
              title={finPeriodMode === 'quarterly' ? '近6期财务营收、净利润与经营现金流趋势图' : '历年完整年报营收、净利润与现金流对比图'}
            />

            <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-500 whitespace-nowrap">
                    <tr>
                      <th className="text-left px-3 py-2.5 font-medium">报告期</th>
                      <th className="text-left px-3 py-2.5 font-medium">类型</th>
                      <th className="text-right px-3 py-2.5 font-medium">营业收入</th>
                      <th className="text-right px-3 py-2.5 font-medium">营收同比</th>
                      <th className="text-right px-3 py-2.5 font-medium">归母净利</th>
                      <th className="text-right px-3 py-2.5 font-medium">净利同比</th>
                      <th className="text-right px-3 py-2.5 font-medium">经营现金流</th>
                      <th className="text-right px-3 py-2.5 font-medium">毛利率</th>
                      <th className="text-right px-3 py-2.5 font-medium">ROE</th>
                      <th className="text-right px-3 py-2.5 font-medium">货币资金</th>
                      <th className="text-right px-3 py-2.5 font-medium">应收账款</th>
                      <th className="text-right px-3 py-2.5 font-medium">存货</th>
                      <th className="text-right px-3 py-2.5 font-medium">负债率</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono tabular-nums whitespace-nowrap">
                    {finRows.slice(0, 8).map((f: any, idx: number) => (
                      <tr key={`${f.reportDate}-${idx}`} className="hover:bg-slate-50">
                        <td className="px-3 py-2 text-slate-900">{f.reportDate}</td>
                        <td className="px-3 py-2 font-sans text-slate-600">{f.reportType}</td>
                        <td className="px-3 py-2 text-right">{formatYuanYi(f.revenue)}</td>
                        <td className={`px-3 py-2 text-right ${priceColorClass(f.revenueYoy)}`}>{formatPct(f.revenueYoy)}</td>
                        <td className="px-3 py-2 text-right">{formatYuanYi(f.netProfit)}</td>
                        <td className={`px-3 py-2 text-right ${priceColorClass(f.netProfitYoy)}`}>{formatPct(f.netProfitYoy)}</td>
                        <td className={`px-3 py-2 text-right ${priceColorClass(f.operatingCashFlow)}`}>{formatYuanYi(f.operatingCashFlow)}</td>
                        <td className="px-3 py-2 text-right">{f.grossMargin !== null ? `${f.grossMargin.toFixed(1)}%` : '-'}</td>
                        <td className="px-3 py-2 text-right">{f.roe !== null ? `${f.roe.toFixed(1)}%` : '-'}</td>
                        <td className="px-3 py-2 text-right">{formatYuanYi(f.monetaryFunds)}</td>
                        <td className="px-3 py-2 text-right">{formatYuanYi(f.accountsReceivable)}</td>
                        <td className="px-3 py-2 text-right">{formatYuanYi(f.inventory)}</td>
                        <td className="px-3 py-2 text-right">{f.debtToAssetRatio !== null ? `${f.debtToAssetRatio.toFixed(1)}%` : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Shareholders, Institutional Holdings & Dividends */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 text-xs">
            <div className="p-5 bg-white border border-slate-200 rounded-lg space-y-3">
              <h3 className="text-sm font-semibold text-slate-900 border-b border-slate-100 pb-2">
                股东户数与筹码集中度
              </h3>
              {(data.shareholderNumbers || []).length === 0 ? (
                <div className="text-slate-500">暂无股东户数记录</div>
              ) : (
                <div className="space-y-2">
                  {data.shareholderNumbers.map((h: any, i: number) => (
                    <div key={i} className="flex items-center justify-between border-b border-slate-100 pb-1.5 last:border-0">
                      <span className="font-mono text-slate-600">{h.endDate}</span>
                      <div className="text-right font-mono tabular-nums">
                        <span className="text-slate-900 font-medium">{Number(h.holderNum || 0).toLocaleString()} 户</span>
                        {h.changeRatioPct !== null && h.changeRatioPct !== undefined && (
                          <span className={`ml-2 ${priceColorClass(-h.changeRatioPct)}`}>
                            ({h.changeRatioPct > 0 ? '+' : ''}{Number(h.changeRatioPct).toFixed(2)}%)
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-5 bg-white border border-slate-200 rounded-lg space-y-3">
              <h3 className="text-sm font-semibold text-slate-900 border-b border-slate-100 pb-2">
                主力机构持仓汇总
              </h3>
              {(data.institutionalHoldings || []).length === 0 ? (
                <div className="text-slate-500">暂无公开机构持仓汇总</div>
              ) : (
                <div className="space-y-2">
                  {data.institutionalHoldings.map((o: any, i: number) => (
                    <div key={i} className="flex items-center justify-between border-b border-slate-100 pb-1.5 last:border-0">
                      <span className="font-mono text-slate-600">{o.reportDate}</span>
                      <div className="text-right font-mono tabular-nums">
                        <span className="text-slate-900">{o.orgCount ?? '-'} 家机构</span>
                        <span className="ml-2 text-blue-700 font-medium">
                          {o.totalSharesRatioPct !== null && o.totalSharesRatioPct !== undefined
                            ? `${Number(o.totalSharesRatioPct).toFixed(2)}%`
                            : '-'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-5 bg-white border border-slate-200 rounded-lg space-y-3">
              <h3 className="text-sm font-semibold text-slate-900 border-b border-slate-100 pb-2">
                近期分红送转记录
              </h3>
              {(data.dividends || []).length === 0 ? (
                <div className="text-slate-500">暂无近期分红记录</div>
              ) : (
                <div className="space-y-2">
                  {data.dividends.map((d: any, i: number) => (
                    <div key={i} className="border-b border-slate-100 pb-1.5 last:border-0">
                      <div className="flex items-center justify-between font-mono text-slate-600">
                        <span>{d.reportDate}</span>
                        <span>{d.exDividendDate ? `除权 ${d.exDividendDate}` : d.planNoticeDate}</span>
                      </div>
                      <div className="text-slate-900 mt-0.5">{d.planExplain}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Comparable Peers */}
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 text-sm font-semibold text-slate-900">
              同行业可比公司对比 (点击代码切换研究标的)
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium">代码 / 名称</th>
                    <th className="text-left px-4 py-2.5 font-medium">行业</th>
                    <th className="text-right px-4 py-2.5 font-medium">最新价</th>
                    <th className="text-right px-4 py-2.5 font-medium">涨跌幅</th>
                    <th className="text-right px-4 py-2.5 font-medium">PE(TTM)</th>
                    <th className="text-right px-4 py-2.5 font-medium">PB</th>
                    <th className="text-right px-4 py-2.5 font-medium">总市值</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(data.peers || []).map((p: any) => (
                    <tr key={p.symbol} className="hover:bg-slate-50">
                      <td className="px-4 py-2.5">
                        <button onClick={() => onSelectStock(p.symbol)} className="text-blue-700 hover:underline font-medium">
                          <span className="font-mono mr-1.5">{p.symbol}</span>
                          {p.name}
                        </button>
                      </td>
                      <td className="px-4 py-2.5 text-slate-600">{p.industry}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">{p.price?.toFixed(2) ?? '-'}</td>
                      <td className={`px-4 py-2.5 text-right font-mono tabular-nums ${priceColorClass(p.changePct)}`}>
                        {formatPct(p.changePct)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">{p.peTtm?.toFixed(1) ?? '-'}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">{p.pb?.toFixed(2) ?? '-'}</td>
                      <td className="px-4 py-2.5 text-right font-mono tabular-nums">{formatYuanYi(p.totalMarketCap)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: VALUE & SHORT-TERM & ANNOUNCEMENTS */}
      {subTab === 'value_short' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Value Investment Valuation */}
            <div className="p-5 bg-white border border-slate-200 rounded-lg space-y-4">
              <div className="border-b border-slate-100 pb-2.5 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900">价值投资三情景估值模型</h2>
                <span className="text-xs font-mono text-slate-500">
                  中性安全边际：{valuation.marginOfSafetyPct !== null ? `${valuation.marginOfSafetyPct}%` : '-'}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-2.5 bg-slate-50 rounded border border-slate-100">
                  <div className="text-slate-500">PE / PB / PS</div>
                  <div className="mt-1 font-mono font-semibold text-slate-900">
                    {valuation.peTtm ?? '-'} / {valuation.pb ?? '-'} / {valuation.ps ?? '-'}
                  </div>
                </div>
                <div className="p-2.5 bg-slate-50 rounded border border-slate-100">
                  <div className="text-slate-500">PEG</div>
                  <div className="mt-1 font-mono font-semibold text-slate-900">{valuation.peg ?? '不适用'}</div>
                </div>
                <div className="p-2.5 bg-slate-50 rounded border border-slate-100">
                  <div className="text-slate-500">股息率 / EV估值</div>
                  <div className="mt-1 font-mono font-semibold text-slate-900">
                    {valuation.dividendYield !== null && valuation.dividendYield !== undefined
                      ? `${valuation.dividendYield.toFixed(2)}%`
                      : '-'}{' '}
                    / {formatYuanYi(valuation.enterpriseValueApprox)}
                  </div>
                </div>
                <div className="p-2.5 bg-slate-50 rounded border border-slate-100">
                  <div className="text-slate-500">价格历史分位</div>
                  <div className="mt-1 font-mono font-semibold text-slate-900">
                    {valuation.pePercentile !== null ? `${valuation.pePercentile}%` : '-'}
                  </div>
                </div>
              </div>

              <PriceRangeLadder
                title="三情景估值目标价 vs 当前股价标尺"
                currentPrice={quote.price}
                markers={(valuation.scenarios || [])
                  .filter((s: any) => s.targetPrice !== null)
                  .map((s: any) => ({
                    label: s.label.replace('情景', ''),
                    value: s.targetPrice,
                    colorClass:
                      s.label === '乐观情景'
                        ? 'bg-red-600 text-white'
                        : s.label === '中性情景'
                        ? 'bg-blue-700 text-white'
                        : 'bg-emerald-600 text-white',
                  }))}
              />

              <div className="space-y-2">
                {valuation.scenarios.map((sc: any) => (
                  <div key={sc.label} className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                    <div className="flex items-center justify-between font-medium text-slate-900">
                      <span>{sc.label}</span>
                      <span className={`font-mono ${priceColorClass(sc.upsidePct)}`}>
                        {sc.targetPrice !== null ? `${sc.targetPrice} 元 (${formatPct(sc.upsidePct)})` : '不适用'}
                      </span>
                    </div>
                    <div className="mt-1 text-slate-600">{sc.assumptions}</div>
                  </div>
                ))}
              </div>
              {valuation.psBasis && (
                <div className="text-[11px] text-slate-500">PS计算口径：{valuation.psBasis}</div>
              )}
            </div>

            {/* Short-Term & Capital Flow Visuals */}
            <div className="p-5 bg-white border border-slate-200 rounded-lg space-y-4">
              <div className="border-b border-slate-100 pb-2.5 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-slate-900">短线交投与资金口径监测</h2>
                <span className="text-xs text-slate-500">{data.capitalFlow?.provenance?.dataStatus}</span>
              </div>
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-800">
                {data.capitalFlow?.definitionNote}
              </div>

              <CapitalFlowVisuals
                todaySnapshot={data.capitalFlow?.todaySnapshot}
                intradayCurve={data.capitalFlow?.intradayCurve || []}
              />

              {data.stockDragonTiger?.length > 0 && (
                <div className="pt-3 border-t border-slate-100 space-y-2 text-xs">
                  <div className="font-semibold text-slate-900">近期个股龙虎榜上榜记录</div>
                  {data.stockDragonTiger.slice(0, 3).map((l: any, i: number) => (
                    <div key={i} className="p-2.5 bg-slate-50 rounded border border-slate-200">
                      <div className="flex justify-between font-mono">
                        <span className="text-slate-700">{l.tradeDate}</span>
                        <span className={priceColorClass(l.netBuyAmount)}>净买 {formatYuanYi(l.netBuyAmount)}</span>
                      </div>
                      <div className="text-slate-600 mt-0.5">{l.reason}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Official CNINFO Announcements */}
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-slate-900">巨潮资讯网官方公告采集</h3>
              <span className="text-xs text-slate-500">{data.announcementsProvenance?.dataSource}</span>
            </div>
            <div className="divide-y divide-slate-100">
              {(data.announcements || []).length === 0 ? (
                <div className="p-6 text-xs text-slate-500">暂无近期公告数据。</div>
              ) : (
                data.announcements.map((a: any, i: number) => (
                  <div key={`${a.announcementId}-${i}`} className="px-5 py-3 flex flex-wrap items-center justify-between gap-3 text-xs hover:bg-slate-50">
                    <div className="flex items-start gap-2.5 flex-1 min-w-[260px]">
                      <span
                        className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                          a.sentimentLabel === '利好'
                            ? 'bg-red-600'
                            : a.sentimentLabel === '利空'
                            ? 'bg-emerald-600'
                            : 'bg-slate-400'
                        }`}
                      />
                      <div>
                        <a href={a.sourceUrl} target="_blank" rel="noreferrer" className="font-medium text-slate-900 hover:text-blue-700">
                          {a.title}
                        </a>
                        <div className="mt-0.5 text-slate-500">
                          {a.publishedAt} · {a.sourceName} · 初步定性：{a.sentimentLabel}
                        </div>
                      </div>
                    </div>
                    <a
                      href={a.pdfUrl || a.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-700 hover:underline inline-flex items-center gap-1 whitespace-nowrap shrink-0"
                    >
                      查看原文
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: DUAL SCORES RADAR, 9 AI ROLES & RISK-BUDGET TRADING PLAN */}
      {subTab === 'ai_plan' && (
        <div className="space-y-6">
          {/* Control Bar + DeepSeek API Key Quick Setup */}
          <div className="p-4 bg-white border border-slate-200 rounded-lg space-y-4 no-print">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-slate-600 font-medium">交易计划风格：</span>
                {['超短线', '短线', '波段', '中线', '长线'].map((st) => (
                  <button
                    key={st}
                    onClick={() => setTradingStyle(st)}
                    className={`px-3 py-1.5 rounded-md font-medium whitespace-nowrap shrink-0 ${
                      tradingStyle === st ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setAiConfigOpen((v) => !v)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 whitespace-nowrap shrink-0"
                >
                  <Cpu className="w-3.5 h-3.5 text-blue-700" />
                  {aiSettings.aiProviderType === 'gemini'
                    ? '当前引擎：内置 Gemini (切换 DeepSeek)'
                    : `DeepSeek (${aiSettings.aiModelName})${
                        aiSettings.aiApiKeyConfigured ? ` · ****${aiSettings.aiApiKeyLast4}` : ' · 未填Key'
                      }`}
                </button>
                <button
                  onClick={handleRunAiResearch}
                  disabled={aiRunning}
                  className="px-4 py-2 text-xs font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 whitespace-nowrap shrink-0 disabled:opacity-60"
                >
                  {aiRunning ? '正在调用9角色AI分析...' : user ? '生成9角色AI研究与风控交易计划' : '登录并运行AI深度研究'}
                </button>
              </div>
            </div>

            {aiConfigOpen && (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-semibold text-slate-900">
                    DeepSeek / 个人大模型 API Key 快捷配置（服务端 AES-256-GCM 加密存储）
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setAiSettings((prev) => ({
                          ...prev,
                          aiProviderType: 'deepseek',
                          aiBaseUrl: 'https://api.deepseek.com',
                          aiModelName: 'deepseek-chat',
                        }))
                      }
                      className="px-2.5 py-1 bg-white border border-slate-200 rounded hover:bg-slate-100 text-blue-700 font-medium"
                    >
                      填入 DeepSeek 官方默认
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setAiSettings((prev) => ({
                          ...prev,
                          aiProviderType: 'gemini',
                          aiModelName: 'gemini-4-hydrogen',
                        }))
                      }
                      className="px-2.5 py-1 bg-white border border-slate-200 rounded hover:bg-slate-100 text-slate-700"
                    >
                      切回内置 Gemini
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-slate-500 mb-1">模型选择</label>
                    <select
                      value={aiSettings.aiProviderType === 'gemini' ? 'gemini' : aiSettings.aiModelName}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === 'gemini') {
                          setAiSettings((p) => ({ ...p, aiProviderType: 'gemini', aiModelName: 'gemini-4-hydrogen' }));
                        } else {
                          setAiSettings((p) => ({
                            ...p,
                            aiProviderType: 'deepseek',
                            aiBaseUrl: p.aiBaseUrl || 'https://api.deepseek.com',
                            aiModelName: v,
                          }));
                        }
                      }}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"
                    >
                      <option value="deepseek-chat">DeepSeek-V3 (deepseek-chat · 推荐JSON)</option>
                      <option value="deepseek-reasoner">DeepSeek-R1 (deepseek-reasoner · 深度推理)</option>
                      <option value="gemini">内置 Gemini 引擎 (免Key)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-500 mb-1">接口 Base URL</label>
                    <input
                      value={aiSettings.aiBaseUrl}
                      onChange={(e) => setAiSettings((p) => ({ ...p, aiBaseUrl: e.target.value }))}
                      placeholder="https://api.deepseek.com"
                      disabled={aiSettings.aiProviderType === 'gemini'}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono bg-white disabled:bg-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 mb-1">
                      DeepSeek API Key{' '}
                      {aiSettings.aiApiKeyConfigured ? `(已保存 ****${aiSettings.aiApiKeyLast4})` : '(未保存)'}
                    </label>
                    <input
                      type="password"
                      value={dsKeyInput}
                      onChange={(e) => setDsKeyInput(e.target.value)}
                      placeholder={aiSettings.aiApiKeyConfigured ? '留空沿用已保存Key，或输入新 sk-...' : '输入您的 DeepSeek sk-... 密钥'}
                      disabled={aiSettings.aiProviderType === 'gemini'}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono bg-white disabled:bg-slate-100"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                  <div className={dsStatusMsg?.type === 'err' ? 'text-red-600' : 'text-emerald-700'}>
                    {dsStatusMsg?.text || '支持直接粘贴 DeepSeek sk- 密钥，保存后自动加密存入 Cloud SQL 并在服务端代发请求。'}
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSaveAndTestAi(false)}
                    disabled={dsTesting}
                    className="px-3.5 py-1.5 bg-slate-900 text-white font-medium rounded-lg hover:bg-slate-800 disabled:opacity-60 whitespace-nowrap"
                  >
                    {dsTesting ? '验证中...' : '保存并测试 DeepSeek 连接'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {aiError && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              {aiError}
            </div>
          )}

          {/* Dual-Track Visual Radar Comparison */}
          <div className="p-5 bg-white border border-slate-200 rounded-lg space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900">双轨量化能力六维雷达与评分明细</h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  长期价值与短线博弈分开独立计算 · 模型版本：{activeScores.modelVersion}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <ScoreRadarChart
                title="长期投资评分体系"
                total={activeScores.longTerm.total}
                grade={activeScores.longTerm.grade}
                accentColor="#1d4ed8"
                dimensions={activeScores.longTerm.dimensions}
              />
              <ScoreRadarChart
                title="短线交易评分体系"
                total={activeScores.shortTerm.total}
                grade={activeScores.shortTerm.grade}
                accentColor="#0d9488"
                dimensions={activeScores.shortTerm.dimensions}
              />
            </div>

            {/* Clean Dimension Evidence Matrix */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 pt-2">
              {[
                { label: '长线维度真实依据明细', dims: activeScores.longTerm.dimensions },
                { label: '短线维度真实依据明细', dims: activeScores.shortTerm.dimensions },
              ].map((col) => (
                <div key={col.label} className="space-y-2.5">
                  <div className="text-xs font-semibold text-slate-800">{col.label}</div>
                  {col.dims.map((d: any) => (
                    <div key={d.key} className="p-3 bg-slate-50 border border-slate-100 rounded-lg text-xs space-y-1">
                      <div className="flex items-center justify-between font-medium text-slate-900">
                        <span>{d.label}</span>
                        <span className="font-mono tabular-nums">{d.score} / {d.maxScore}</span>
                      </div>
                      <div className="text-slate-700">{d.reason}</div>
                      <div className="text-[11px] text-slate-500">
                        数据依据：{d.evidence} · 来源：{d.dataSource}
                      </div>
                      {d.missingInfo && (
                        <div className="text-[11px] text-amber-700">缺失提示：{d.missingInfo}</div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* Risk-Budget Trading Plan & AI Chief Conclusion */}
          {aiResult && (
            <div className="space-y-6">
              <div className="p-5 bg-white border border-slate-200 rounded-lg space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                  <div>
                    <h3 className="text-base font-semibold text-slate-900">
                      风险预算交易计划 ({aiResult.plan.tradingStyle} · {aiResult.plan.stance})
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      仓位严格依据个人风控预算与止损距离计算，不自动下单 · {aiResult.plan.applicableRuleSummary}
                    </p>
                  </div>
                  <button
                    onClick={handleConfirmPlan}
                    disabled={planConfirmed}
                    className={`px-3.5 py-2 text-xs font-medium rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
                      planConfirmed
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-slate-900 text-white hover:bg-slate-800'
                    }`}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    {planConfirmed ? '已确认研究计划' : '人工确认此交易计划'}
                  </button>
                </div>

                <PriceRangeLadder
                  title="交易计划点位布局图 (止损线 → 入场区间 → 分批止盈)"
                  currentPrice={quote.price}
                  markers={[
                    { label: '止损位', value: aiResult.plan.stopLossPrice, colorClass: 'bg-emerald-600 text-white' },
                    { label: '入场下沿', value: aiResult.plan.entryLow, colorClass: 'bg-blue-700 text-white' },
                    { label: '入场上沿', value: aiResult.plan.entryHigh, colorClass: 'bg-blue-500 text-white' },
                    ...(aiResult.plan.takeProfitTargets || []).map((tp: number, idx: number) => ({
                      label: `止盈${idx + 1}`,
                      value: tp,
                      colorClass: 'bg-red-600 text-white',
                    })),
                  ]}
                />

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 text-xs">
                  <div>
                    <div className="text-slate-500">入场参考区间</div>
                    <div className="mt-1 font-mono font-semibold text-slate-900">
                      {aiResult.plan.entryLow} ~ {aiResult.plan.entryHigh}
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">止损位置</div>
                    <div className="mt-1 font-mono font-semibold text-emerald-700">
                      {aiResult.plan.stopLossPrice} 元
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">分批止盈目标</div>
                    <div className="mt-1 font-mono font-semibold text-red-600">
                      {(aiResult.plan.takeProfitTargets || []).join(' / ')} 元
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">目标盈亏比</div>
                    <div className="mt-1 font-mono font-semibold text-slate-900">
                      {aiResult.plan.riskRewardRatio}:1
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">风控建议股数</div>
                    <div className="mt-1 font-mono font-semibold text-blue-700">
                      {aiResult.plan.suggestedShares} 股 ({aiResult.plan.suggestedPositionPct}%)
                    </div>
                  </div>
                  <div>
                    <div className="text-slate-500">最大允许亏损</div>
                    <div className="mt-1 font-mono font-semibold text-red-700">
                      {aiResult.plan.maxLossYuan} 元
                    </div>
                  </div>
                </div>
                <div className="text-xs text-slate-600 space-y-1 pt-2 border-t border-slate-100">
                  <div><span className="font-medium text-slate-800">突破确认条件：</span>{aiResult.plan.breakoutCondition}</div>
                  <div><span className="font-medium text-slate-800">计划失效条件：</span>{aiResult.plan.invalidationCondition}</div>
                </div>
              </div>

              {/* Chief Conclusion & Conflicts */}
              <div className="p-5 bg-white border border-slate-200 rounded-lg space-y-4 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                  <h3 className="text-sm font-semibold text-slate-900">首席投资研究员综合决策</h3>
                  <span className="font-mono text-slate-500">调用模型：{aiResult.aiRes.llmModelUsed} · 立场：{aiResult.aiRes.chiefConclusion.finalStance}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-slate-700 leading-relaxed">
                  <div className="p-3.5 bg-blue-50/40 border border-blue-100 rounded-lg">
                    <div className="font-semibold text-blue-900 mb-1">长期投资逻辑</div>
                    <p>{aiResult.aiRes.chiefConclusion.longTermThesis}</p>
                  </div>
                  <div className="p-3.5 bg-teal-50/40 border border-teal-100 rounded-lg">
                    <div className="font-semibold text-teal-900 mb-1">短线交易逻辑</div>
                    <p>{aiResult.aiRes.chiefConclusion.shortTermThesis}</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
                  <div>
                    <span className="font-semibold text-slate-900">角色观点分歧：</span>
                    {(aiResult.aiRes.chiefConclusion.conflictsIdentified || []).join('；') || '各角色方向基本一致'}
                  </div>
                  <div>
                    <span className="font-semibold text-red-700">关键风险边界：</span>
                    {(aiResult.aiRes.chiefConclusion.keyRisks || []).join('；')}
                  </div>
                </div>
              </div>

              {/* 9 Independent AI Roles — Clean Interactive Role Inspector */}
              {roleOutputs.length > 0 && (
                <div className="p-5 bg-white border border-slate-200 rounded-lg space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                    <h3 className="text-sm font-semibold text-slate-900">9位独立AI投研角色深度研判明细</h3>
                    <span className="text-xs text-slate-500">点击下方角色标签切换查看，避免长篇大论信息过载</span>
                  </div>

                  <div className="flex flex-wrap gap-1.5 bg-slate-100 p-1.5 rounded-lg">
                    {roleOutputs.map((role: any, idx: number) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setSelectedAiRoleIdx(idx)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
                          selectedAiRoleIdx === idx
                            ? 'bg-white text-slate-900 shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {role.roleName}
                      </button>
                    ))}
                  </div>

                  {activeRole && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 text-xs pt-1">
                      <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-2.5">
                        <div className="font-semibold text-slate-900 border-b border-slate-200 pb-1.5">
                          A. 真实采集数据与系统计算依据
                        </div>
                        <div>
                          <div className="text-slate-500 font-medium mb-1">真实采集数据</div>
                          <ul className="list-disc pl-4 space-y-1 text-slate-700">
                            {(activeRole.collectedDataRefs || []).map((item: string, i: number) => (
                              <li key={i}>{item}</li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <div className="text-slate-500 font-medium mb-1">系统量化指标</div>
                          <ul className="list-disc pl-4 space-y-1 text-slate-700">
                            {(activeRole.computedMetrics || []).map((item: string, i: number) => (
                              <li key={i}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      </div>

                      <div className="p-4 bg-white border border-slate-200 rounded-lg space-y-2.5">
                        <div className="font-semibold text-slate-900 border-b border-slate-200 pb-1.5">
                          B. {activeRole.roleName} · 专业研判观点
                        </div>
                        <p className="text-slate-800 leading-relaxed">{activeRole.analystView}</p>
                        {activeRole.missingData?.length > 0 && (
                          <div className="pt-2 border-t border-slate-100 text-amber-700">
                            客观缺失项：{activeRole.missingData.join('；')}
                          </div>
                        )}
                      </div>

                      <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg space-y-2.5">
                        <div className="font-semibold text-slate-900 border-b border-slate-200 pb-1.5">
                          C. AI逻辑推断与未来情景推演
                        </div>
                        <div>
                          <div className="text-blue-700 font-medium mb-1">AI逻辑推断</div>
                          <p className="text-slate-700 leading-relaxed">{activeRole.aiInference}</p>
                        </div>
                        <div className="pt-2 border-t border-slate-200">
                          <div className="text-amber-700 font-medium mb-1">未来情景推演（非保证）</div>
                          <p className="text-slate-700 leading-relaxed">{activeRole.futureOutlook}</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
