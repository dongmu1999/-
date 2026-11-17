import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Brain,
  CheckCircle2,
  Download,
  RefreshCw,
  ShieldAlert,
  SlidersHorizontal,
  Star,
} from 'lucide-react';
import { KlineChart, KlinePriceLine } from '../components/KlineChart';
import { FinancialTrendChart } from '../components/ResearchCharts';
import { apiFetch, downloadTextFile, formatPct, formatYuanYi, priceColorClass } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

interface CuratedStocksPageProps {
  onSelectStock: (symbol: string) => void;
}

function formatCuratedMarkdown(data: any): string {
  const m = data.screeningMeta;
  const f = m.funnel;
  const lines: string[] = [
    `# A股精选好股深度投研报告`,
    ``,
    `- 分析日期：${m.analysisDate}（生成时间：${m.generatedAt}）`,
    `- 筛选范围：${m.universeScope} · 选股风格：${m.stylePreference}`,
    `- 生效条件（同时满足）：${(m.appliedFiltersSummary || []).join(' ｜ ') || '默认均衡口径'}`,
    `- 财报口径：年报基准 ${m.annualPeriodUsed}${m.interimPeriodUsed ? ` + 最新季报 ${m.interimPeriodUsed}` : ''}`,
    ``,
    `## 第一部分：市场筛选概况`,
    `- 筛选范围样本基数：${f.universeTotalCount} 家`,
    `- ST/*ST/退市/异常风险排除：约 ${f.excludedStDelistingCount} 家`,
    `- 基本面与财务增长未达标排除：${f.excludedFinancialWeakCount} 家`,
    `- 实时行情/价格/市值/估值过滤排除：${f.excludedQuoteValuationCount} 家`,
    `- 进入深度尽调与K线分析池：${f.deepAnalyzedCount} 家（其中风控/买区淘汰与备选 ${f.eliminatedRiskCount} 家）`,
    `- 最终入选精选候选：${f.finalistCount} 家`,
    ``,
    `## 第二部分：最终候选股票排名`,
    `| 排名 | 代码 | 名称 | 所属行业 | 最新股价 | 总评分 | 评级 | 理想买区(元) | 止盈T1/T2 | 止损价 | 盈亏比 |`,
    `| --- | --- | --- | --- | ---: | ---: | --- | --- | --- | ---: | ---: |`,
  ];

  for (const c of data.candidates || []) {
    lines.push(
      `| ${c.rank} | ${c.symbol} | ${c.name} | ${c.industry} | ${c.price.toFixed(2)} | ${c.totalScore} | ${c.ratingLabel} | ${c.tradePlan.buyZoneLow}~${c.tradePlan.buyZoneHigh} | ${c.tradePlan.takeProfit1}/${c.tradePlan.takeProfit2} | ${c.tradePlan.stopLossPrice} | ${c.tradePlan.riskRewardRatio}:1 |`
    );
  }

  lines.push(``, `## 第三至五部分：单只股票深度分析、价值判断与K线买卖计划`);
  for (const c of data.candidates || []) {
    const d = c.deepAnalysis11;
    const v = c.valueJudgment5;
    const t = c.tradePlan;
    lines.push(
      ``,
      `### ${c.rank}. ${c.name} (${c.symbol}) — 综合评分 ${c.totalScore}/100 (${c.ratingLabel})`,
      `- **最新价**：${c.price.toFixed(2)}元 (${c.priceDate}) · PE(TTM) ${c.peTtm ?? '未知'} · PB ${c.pb ?? '未知'} · 股息率 ${c.dividendYield ?? '未知'}%`,
      `- **核心逻辑**：${c.coreThesis}`,
      `- **主要风险**：${(c.mainRisks || []).join('；')}`,
      `- **1. 公司业务**：${d.companyBusiness}`,
      `- **2. 行业地位**：${d.industryPosition}`,
      `- **3. 核心竞争力**：${d.coreMoat}`,
      `- **4. 近5年财务**：${d.fiveYearFinancialSummary}`,
      `- **5. 盈利质量**：${d.earningsQuality}`,
      `- **6. 成长逻辑**：${d.growthLogic}`,
      `- **7. 估值水平**：${d.valuationLevel}`,
      `- **8. 机构与筹码变化**：${d.institutionalChange}`,
      `- **9. K线技术趋势**：${d.technicalTrend}`,
      `- **10. 投资逻辑是否成立**：${d.thesisValidity}`,
      `- **价值判断**：估值合理性——${v.isValuationReasonable}；当前买点判断——${v.suitableToBuyNow}；等待条件——${v.waitConditionsIfNot}`,
      `- **K线买卖计划**：理想观察买区 **${t.buyZoneLow}~${t.buyZoneHigh}元**（${t.buyTimingVerdict}）；止损价 **${t.stopLossPrice}元**（${t.stopLossPctFromBuyMid}%）；第一止盈 **${t.takeProfit1}元**（+${t.takeProfit1Pct}%），第二止盈 **${t.takeProfit2}元**（+${t.takeProfit2Pct}%）；分批思路：${t.batchBuyStrategy}；逻辑失效条件：${t.invalidationCondition}`
    );
  }

  lines.push(``, `## 第六部分：最终结论`);
  for (const p of data.finalConclusion?.topFocusPicks || []) {
    lines.push(`- **第${p.rank}名 ${p.name} (${p.symbol})**：${p.whyChosen}`);
  }
  lines.push(`- **次优排序说明**：${data.finalConclusion?.whyOthersRankedLower || ''}`);
  lines.push(`- **纪律提示**：${data.finalConclusion?.executionDisciplineNote || ''}`);

  return lines.join('\n');
}

interface CatalogItem {
  code: string;
  name: string;
  category: string;
}

export const CuratedStocksPage: React.FC<CuratedStocksPageProps> = ({ onSelectStock }) => {
  const { user, signInWithGoogle } = useAuth();

  // Filter catalog (Industries & Concepts)
  const [industries, setIndustries] = useState<CatalogItem[]>([]);
  const [concepts, setConcepts] = useState<CatalogItem[]>([]);
  const [conceptSearch, setConceptSearch] = useState<string>('');

  // Screening controls (all composable via AND)
  const [targetCount, setTargetCount] = useState<number>(5);
  const [boardFilter, setBoardFilter] = useState<'全部' | '主板' | '创业板' | '科创板' | '北交所'>('全部');
  const [stylePreference, setStylePreference] = useState<'均衡优质' | '低估价值' | '成长龙头'>('均衡优质');
  const [industryNode, setIndustryNode] = useState<string>('');
  const [conceptNode, setConceptNode] = useState<string>('');
  const [minPrice, setMinPrice] = useState<string>('');
  const [maxPrice, setMaxPrice] = useState<string>('');
  const [minMarketCapYi, setMinMarketCapYi] = useState<string>('50');
  const [maxMarketCapYi, setMaxMarketCapYi] = useState<string>('');
  const [minRoePct, setMinRoePct] = useState<number>(12);
  const [maxPe, setMaxPe] = useState<number>(42);
  const [maxPb, setMaxPb] = useState<string>('');
  const [minDividendYield, setMinDividendYield] = useState<string>('');
  const [minRevYoyPct, setMinRevYoyPct] = useState<string>('');
  const [minProfitYoyPct, setMinProfitYoyPct] = useState<string>('');
  const [minGrossMarginPct, setMinGrossMarginPct] = useState<string>('');
  const [maxDebtRatioPct, setMaxDebtRatioPct] = useState<string>('');
  const [onlyBuyZone, setOnlyBuyZone] = useState<boolean>(false);

  // Result state
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedSymbol, setSelectedSymbol] = useState<string>('');
  const [detailTab, setDetailTab] = useState<'scores' | 'deep11' | 'value5' | 'financials'>('scores');

  // K-line overlay controls
  const [showMA, setShowMA] = useState(true);
  const [showMA120, setShowMA120] = useState(true);
  const [showBoll, setShowBoll] = useState(false);

  // AI Deep Report state
  const [aiRunning, setAiRunning] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiReport, setAiReport] = useState<{ modelUsed: string; generatedAt: string; reportMarkdown: string } | null>(
    null
  );
  const [watchTip, setWatchTip] = useState<string | null>(null);

  const filteredConcepts = useMemo(() => {
    const q = conceptSearch.trim().toLowerCase();
    if (!q) return concepts.slice(0, 120);
    return concepts.filter((c) => c.name.toLowerCase().includes(q)).slice(0, 120);
  }, [concepts, conceptSearch]);

  const selectedIndustryName = useMemo(
    () => industries.find((i) => i.code === industryNode)?.name || '',
    [industries, industryNode]
  );
  const selectedConceptName = useMemo(
    () => concepts.find((c) => c.code === conceptNode)?.name || '',
    [concepts, conceptNode]
  );

  const resetFilters = () => {
    setStylePreference('均衡优质');
    setBoardFilter('全部');
    setIndustryNode('');
    setConceptNode('');
    setConceptSearch('');
    setMinPrice('');
    setMaxPrice('');
    setMinMarketCapYi('50');
    setMaxMarketCapYi('');
    setMinRoePct(12);
    setMaxPe(42);
    setMaxPb('');
    setMinDividendYield('');
    setMinRevYoyPct('');
    setMinProfitYoyPct('');
    setMinGrossMarginPct('');
    setMaxDebtRatioPct('');
    setOnlyBuyZone(false);
    setTargetCount(5);
  };

  const runScreen = async () => {
    setLoading(true);
    setError(null);
    setAiReport(null);
    setAiError(null);
    try {
      const parseOpt = (val: string) => (val.trim() !== '' && Number.isFinite(Number(val)) ? Number(val) : undefined);
      const res = await apiFetch('/api/curated/screen', {
        method: 'POST',
        body: JSON.stringify({
          targetCount,
          boardFilter,
          stylePreference,
          industryNode: industryNode || undefined,
          industryName: selectedIndustryName || undefined,
          conceptNode: conceptNode || undefined,
          conceptName: selectedConceptName || undefined,
          minPrice: parseOpt(minPrice),
          maxPrice: parseOpt(maxPrice),
          minMarketCapYi: parseOpt(minMarketCapYi),
          maxMarketCapYi: parseOpt(maxMarketCapYi),
          minRoePct,
          maxPe,
          maxPb: parseOpt(maxPb),
          minDividendYield: parseOpt(minDividendYield),
          minRevYoyPct: parseOpt(minRevYoyPct),
          minProfitYoyPct: parseOpt(minProfitYoyPct),
          minGrossMarginPct: parseOpt(minGrossMarginPct),
          maxDebtRatioPct: parseOpt(maxDebtRatioPct),
          onlyBuyZone,
        }),
      });
      setData(res);
      if (res?.candidates?.length > 0) {
        setSelectedSymbol(res.candidates[0].symbol);
      } else {
        setSelectedSymbol('');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    apiFetch('/api/curated/filters')
      .then((res) => {
        if (Array.isArray(res?.industries)) setIndustries(res.industries);
        if (Array.isArray(res?.concepts)) setConcepts(res.concepts);
      })
      .catch(() => {
        // non-fatal; filters remain usable
      });
    runScreen();
  }, []);

  const selectedCandidate = useMemo(() => {
    if (!data?.candidates?.length) return null;
    return data.candidates.find((c: any) => c.symbol === selectedSymbol) || data.candidates[0];
  }, [data, selectedSymbol]);

  const klinePriceLines: KlinePriceLine[] = useMemo(() => {
    if (!selectedCandidate?.tradePlan) return [];
    const tp = selectedCandidate.tradePlan;
    return [
      {
        price: tp.takeProfit2,
        color: '#dc2626',
        title: `止盈T2 ${tp.takeProfit2}`,
        lineStyle: 3,
        lineWidth: 1,
      },
      {
        price: tp.takeProfit1,
        color: '#d97706',
        title: `止盈T1 ${tp.takeProfit1}`,
        lineStyle: 2,
        lineWidth: 2,
      },
      {
        price: tp.buyZoneHigh,
        color: '#2563eb',
        title: `买区上沿 ${tp.buyZoneHigh}`,
        lineStyle: 2,
        lineWidth: 1,
      },
      {
        price: tp.buyZoneLow,
        color: '#1d4ed8',
        title: `理想买点 ${tp.buyZoneLow}`,
        lineStyle: 0,
        lineWidth: 2,
      },
      {
        price: tp.stopLossPrice,
        color: '#059669',
        title: `止损位 ${tp.stopLossPrice}`,
        lineStyle: 2,
        lineWidth: 2,
      },
    ];
  }, [selectedCandidate]);

  const handleRunAiReport = async () => {
    if (!data?.candidates?.length) return;
    if (!user) {
      await signInWithGoogle();
      return;
    }
    setAiRunning(true);
    setAiError(null);
    try {
      const res = await apiFetch('/api/curated/ai-report', {
        method: 'POST',
        body: JSON.stringify({ selection: data }),
      });
      setAiReport(res);
    } catch (err: any) {
      setAiError(err.message);
    } finally {
      setAiRunning(false);
    }
  };

  const handleAddWatchlist = async (c: any) => {
    if (!user) {
      await signInWithGoogle();
      return;
    }
    try {
      await apiFetch('/api/watchlists', {
        method: 'POST',
        body: JSON.stringify({
          symbol: c.symbol,
          stockName: c.name,
          groupName: '精选好股池',
          targetBuyPrice: c.tradePlan?.buyZoneHigh ?? null,
          stopLossPrice: c.tradePlan?.stopLossPrice ?? null,
          notes: `总分${c.totalScore} · 买区${c.tradePlan?.buyZoneLow}~${c.tradePlan?.buyZoneHigh} · 止损${c.tradePlan?.stopLossPrice}`,
        }),
      });
      setWatchTip(`已将 ${c.name} (${c.symbol}) 加入自选池并写入目标买价与止损价`);
      setTimeout(() => setWatchTip(null), 3500);
    } catch (err: any) {
      setWatchTip(err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="p-5 bg-white border border-slate-200 rounded-lg space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">精选好股研究中心</h1>
            <p className="mt-1 text-xs text-slate-500">
              沪深京全市场基本面严选 · 八维度100分量化评级 · 重大风险一票淘汰 · K线买点与止盈止损推演
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            {data?.candidates?.length > 0 && (
              <>
                <button
                  onClick={() =>
                    downloadTextFile(
                      `A股精选好股投研报告_${data.screeningMeta.analysisDate}.md`,
                      aiReport?.reportMarkdown || formatCuratedMarkdown(data)
                    )
                  }
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 whitespace-nowrap shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  导出研报
                </button>
                <button
                  onClick={handleRunAiReport}
                  disabled={aiRunning}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-slate-900 bg-slate-100 border border-slate-200 rounded-lg hover:bg-slate-200 disabled:opacity-60 whitespace-nowrap shrink-0"
                >
                  <Brain className={`w-3.5 h-3.5 ${aiRunning ? 'animate-pulse' : ''}`} />
                  {aiRunning ? 'AI专家撰写六部分报告中...' : 'AI专家深度报告 (DeepSeek/Gemini)'}
                </button>
              </>
            )}
            <button
              onClick={runScreen}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-60 whitespace-nowrap shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              {loading ? '全市场筛选分析中...' : '执行全市场精选筛选'}
            </button>
          </div>
        </div>

        {/* Composable Multi-Condition Filter Matrix */}
        <div className="pt-3 border-t border-slate-100 space-y-3 text-xs">
          {/* Row 1: Style, Count, Board, Industry, Concept */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-1.5 text-slate-500 font-medium">
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>多条件组合筛选（同时生效）：</span>
              </div>

              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
                {(['均衡优质', '低估价值', '成长龙头'] as const).map((st) => (
                  <button
                    key={st}
                    onClick={() => {
                      setStylePreference(st);
                      if (st === '低估价值') {
                        setMinRoePct(10);
                        setMaxPe(25);
                      } else if (st === '成长龙头') {
                        setMinRoePct(14);
                        setMaxPe(60);
                      } else {
                        setMinRoePct(12);
                        setMaxPe(42);
                      }
                    }}
                    className={`px-2.5 py-1 rounded-md font-medium whitespace-nowrap shrink-0 transition-colors ${
                      stylePreference === st ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>

              <label className="flex items-center gap-1.5 text-slate-600">
                <span>精选数量</span>
                <select
                  value={targetCount}
                  onChange={(e) => setTargetCount(Number(e.target.value))}
                  className="px-2 py-1 border border-slate-200 rounded-md bg-white text-slate-900 text-xs font-mono font-semibold"
                >
                  <option value={3}>3 只</option>
                  <option value={5}>5 只</option>
                  <option value={10}>10 只</option>
                  <option value={20}>20 只</option>
                </select>
              </label>

              <label className="flex items-center gap-1.5 text-slate-600">
                <span>板块</span>
                <select
                  value={boardFilter}
                  onChange={(e) => setBoardFilter(e.target.value as any)}
                  className="px-2 py-1 border border-slate-200 rounded-md bg-white text-slate-900 text-xs"
                >
                  <option value="全部">全部A股</option>
                  <option value="主板">沪深主板</option>
                  <option value="创业板">创业板</option>
                  <option value="科创板">科创板</option>
                  <option value="北交所">北交所</option>
                </select>
              </label>

              <label className="flex items-center gap-1.5 text-slate-600">
                <span>行业</span>
                <select
                  value={industryNode}
                  onChange={(e) => {
                    const v = e.target.value;
                    setIndustryNode(v);
                    if (v && minMarketCapYi === '50') setMinMarketCapYi('15');
                  }}
                  className="px-2 py-1 border border-slate-200 rounded-md bg-white text-slate-900 text-xs max-w-[160px]"
                >
                  <option value="">全部行业</option>
                  <optgroup label="申万一级行业 (31)">
                    {industries
                      .filter((i) => i.category === '申万一级')
                      .map((i) => (
                        <option key={i.code} value={i.code}>
                          {i.name}
                        </option>
                      ))}
                  </optgroup>
                  <optgroup label="新浪行业分类">
                    {industries
                      .filter((i) => i.category !== '申万一级')
                      .map((i) => (
                        <option key={i.code} value={i.code}>
                          {i.name}
                        </option>
                      ))}
                  </optgroup>
                </select>
              </label>

              <div className="flex items-center gap-1.5 text-slate-600">
                <span>概念题材</span>
                <input
                  type="text"
                  value={conceptSearch}
                  onChange={(e) => setConceptSearch(e.target.value)}
                  placeholder="搜概念(如创新药/算力)"
                  className="w-32 px-2 py-1 border border-slate-200 rounded-md bg-white text-slate-900 text-xs placeholder:text-slate-400"
                />
                <select
                  value={conceptNode}
                  onChange={(e) => {
                    const v = e.target.value;
                    setConceptNode(v);
                    if (v && minMarketCapYi === '50') setMinMarketCapYi('15');
                  }}
                  className="px-2 py-1 border border-slate-200 rounded-md bg-white text-slate-900 text-xs max-w-[170px]"
                >
                  <option value="">
                    {conceptSearch.trim() ? `不限概念 (匹配${filteredConcepts.length}个)` : `全部概念 (${concepts.length})`}
                  </option>
                  {filteredConcepts.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <button
              type="button"
              onClick={resetFilters}
              className="px-2.5 py-1 text-xs text-slate-500 hover:text-slate-900 border border-slate-200 rounded-md hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              重置条件
            </button>
          </div>

          {/* Row 2: Quantitative Numeric Conditions Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 pt-2 border-t border-slate-100">
            <div className="space-y-1">
              <div className="text-[11px] text-slate-500">股价区间 (元)</div>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  step="1"
                  value={minPrice}
                  onChange={(e) => setMinPrice(e.target.value)}
                  placeholder="下限"
                  className="w-full px-2 py-1 border border-slate-200 rounded bg-white text-slate-900 font-mono tabular-nums"
                />
                <span className="text-slate-400">-</span>
                <input
                  type="number"
                  min={0}
                  step="1"
                  value={maxPrice}
                  onChange={(e) => setMaxPrice(e.target.value)}
                  placeholder="上限如50"
                  className="w-full px-2 py-1 border border-slate-200 rounded bg-white text-slate-900 font-mono tabular-nums"
                />
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-[11px] text-slate-500">总市值区间 (亿元)</div>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  step="10"
                  value={minMarketCapYi}
                  onChange={(e) => setMinMarketCapYi(e.target.value)}
                  placeholder="下限"
                  className="w-full px-2 py-1 border border-slate-200 rounded bg-white text-slate-900 font-mono tabular-nums"
                />
                <span className="text-slate-400">-</span>
                <input
                  type="number"
                  min={0}
                  step="50"
                  value={maxMarketCapYi}
                  onChange={(e) => setMaxMarketCapYi(e.target.value)}
                  placeholder="上限"
                  className="w-full px-2 py-1 border border-slate-200 rounded bg-white text-slate-900 font-mono tabular-nums"
                />
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-[11px] text-slate-500">PE / PB 上限</div>
              <div className="flex items-center gap-1">
                <select
                  value={maxPe}
                  onChange={(e) => setMaxPe(Number(e.target.value))}
                  className="w-full px-1.5 py-1 border border-slate-200 rounded bg-white text-slate-900 font-mono tabular-nums"
                  title="PE(TTM)上限"
                >
                  <option value={15}>PE≤15</option>
                  <option value={20}>PE≤20</option>
                  <option value={25}>PE≤25</option>
                  <option value={35}>PE≤35</option>
                  <option value={42}>PE≤42</option>
                  <option value={60}>PE≤60</option>
                  <option value={100}>PE≤100</option>
                  <option value={200}>PE≤200</option>
                </select>
                <input
                  type="number"
                  min={0}
                  step="0.5"
                  value={maxPb}
                  onChange={(e) => setMaxPb(e.target.value)}
                  placeholder="PB≤"
                  className="w-full px-2 py-1 border border-slate-200 rounded bg-white text-slate-900 font-mono tabular-nums"
                  title="PB市净率上限"
                />
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-[11px] text-slate-500">ROE下限 / 股息率≥</div>
              <div className="flex items-center gap-1">
                <select
                  value={minRoePct}
                  onChange={(e) => setMinRoePct(Number(e.target.value))}
                  className="w-full px-1.5 py-1 border border-slate-200 rounded bg-white text-slate-900 font-mono tabular-nums"
                >
                  <option value={0}>ROE≥0%</option>
                  <option value={5}>ROE≥5%</option>
                  <option value={8}>ROE≥8%</option>
                  <option value={10}>ROE≥10%</option>
                  <option value={12}>ROE≥12%</option>
                  <option value={15}>ROE≥15%</option>
                  <option value={18}>ROE≥18%</option>
                </select>
                <input
                  type="number"
                  min={0}
                  step="0.5"
                  value={minDividendYield}
                  onChange={(e) => setMinDividendYield(e.target.value)}
                  placeholder="股息%"
                  className="w-full px-2 py-1 border border-slate-200 rounded bg-white text-slate-900 font-mono tabular-nums"
                  title="最低股息率(%)"
                />
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-[11px] text-slate-500">营收 / 净利同比 ≥ (%)</div>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  step="5"
                  value={minRevYoyPct}
                  onChange={(e) => setMinRevYoyPct(e.target.value)}
                  placeholder="营收%"
                  className="w-full px-2 py-1 border border-slate-200 rounded bg-white text-slate-900 font-mono tabular-nums"
                />
                <input
                  type="number"
                  step="5"
                  value={minProfitYoyPct}
                  onChange={(e) => setMinProfitYoyPct(e.target.value)}
                  placeholder="净利%"
                  className="w-full px-2 py-1 border border-slate-200 rounded bg-white text-slate-900 font-mono tabular-nums"
                />
              </div>
            </div>

            <div className="space-y-1">
              <div className="text-[11px] text-slate-500">毛利率≥ / 负债率≤ (%)</div>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="5"
                  value={minGrossMarginPct}
                  onChange={(e) => setMinGrossMarginPct(e.target.value)}
                  placeholder="毛利%"
                  className="w-full px-2 py-1 border border-slate-200 rounded bg-white text-slate-900 font-mono tabular-nums"
                />
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="5"
                  value={maxDebtRatioPct}
                  onChange={(e) => setMaxDebtRatioPct(e.target.value)}
                  placeholder="负债≤"
                  className="w-full px-2 py-1 border border-slate-200 rounded bg-white text-slate-900 font-mono tabular-nums"
                />
              </div>
            </div>

            <div className="space-y-1 flex flex-col justify-end">
              <label className="flex items-center gap-1.5 px-2.5 py-1.5 border border-slate-200 rounded bg-slate-50 hover:bg-slate-100 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={onlyBuyZone}
                  onChange={(e) => setOnlyBuyZone(e.target.checked)}
                  className="rounded border-slate-300 text-slate-900"
                />
                <span className="text-[11px] font-medium text-slate-700 whitespace-nowrap">仅看进入理想买区</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      {watchTip && (
        <div className="px-4 py-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{watchTip}</span>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
          筛选异常：{error}
        </div>
      )}

      {aiError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
          AI报告生成失败：{aiError}
        </div>
      )}

      {loading && !data && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-20 bg-white border border-slate-200 rounded-lg animate-pulse" />
            ))}
          </div>
          <div className="h-72 bg-white border border-slate-200 rounded-lg animate-pulse" />
        </div>
      )}

      {data && (
        <div className="space-y-6">
          {/* Part 1: Screening Funnel Overview */}
          <div className="p-5 bg-white border border-slate-200 rounded-lg space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <h2 className="text-sm font-semibold text-slate-900">01. 全市场筛选概况与排除漏斗</h2>
              <span className="text-xs text-slate-500 font-mono tabular-nums">
                分析日期 {data.screeningMeta.analysisDate} · 年报基准 {data.screeningMeta.annualPeriodUsed}
                {data.screeningMeta.interimPeriodUsed ? ` · 最新季报 ${data.screeningMeta.interimPeriodUsed}` : ''}
                {data.screeningMeta.marketSentiment
                  ? ` · 市场情绪 ${data.screeningMeta.marketSentiment.phaseLabel}(${data.screeningMeta.marketSentiment.sentimentScore}分)`
                  : ''}
              </span>
            </div>

            {Array.isArray(data.screeningMeta.appliedFiltersSummary) && (
              <div className="text-xs text-slate-600 bg-slate-50 border border-slate-200/70 rounded-lg px-3.5 py-2 leading-relaxed">
                <span className="font-semibold text-slate-800 mr-2">生效过滤条件（同时满足）：</span>
                <span className="font-mono tabular-nums">
                  {data.screeningMeta.appliedFiltersSummary.join(' ｜ ')}
                </span>
              </div>
            )}

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
              <div className="p-3 bg-slate-50 rounded-lg">
                <div className="text-[11px] text-slate-500">本次扫描范围基数</div>
                <div className="mt-1 text-lg font-semibold font-mono tabular-nums text-slate-900">
                  {data.screeningMeta.funnel.universeTotalCount} 家
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500 truncate" title={data.screeningMeta.universeScope}>
                  {data.screeningMeta.industryFilterName || data.screeningMeta.conceptFilterName || `${data.screeningMeta.boardFilter}市场`}
                </div>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg">
                <div className="text-[11px] text-slate-500">ST / 退市风险排除</div>
                <div className="mt-1 text-lg font-semibold font-mono tabular-nums text-slate-700">
                  -{data.screeningMeta.funnel.excludedStDelistingCount} 家
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500">默认剔除风险警示</div>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg">
                <div className="text-[11px] text-slate-500">财务增长/ROE过滤</div>
                <div className="mt-1 text-lg font-semibold font-mono tabular-nums text-slate-700">
                  -{data.screeningMeta.funnel.excludedFinancialWeakCount} 家
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500">未达ROE或增速门槛</div>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg">
                <div className="text-[11px] text-slate-500">深度精研复核池</div>
                <div className="mt-1 text-lg font-semibold font-mono tabular-nums text-blue-700">
                  {data.screeningMeta.funnel.deepAnalyzedCount} 家
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500">多条件达标 + 5年财报核验</div>
              </div>
              <div className="p-3 bg-slate-900 text-white rounded-lg">
                <div className="text-[11px] text-slate-300">最终严选候选</div>
                <div className="mt-1 text-lg font-semibold font-mono tabular-nums">
                  {data.screeningMeta.funnel.finalistCount} / {data.screeningMeta.targetCount ?? targetCount} 家
                </div>
                <div className="mt-0.5 text-[11px] text-slate-300">
                  淘汰/备选 {data.screeningMeta.funnel.eliminatedRiskCount} 家
                </div>
              </div>
            </div>

            <div className="text-xs text-slate-500">{data.screeningMeta.dataIntegrityNote}</div>
          </div>

          {/* Part 2: Final Ranked Table */}
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">
                  02. 最终候选股票排名（共 {data.candidates?.length || 0} 只 · 点击任意行切换下方K线买卖点与深度剖析）
                </h2>
              </div>
              <span className="text-xs text-slate-500">
                评分结构：基本面20 + 财务20 + 成长15 + 估值15 + 景气10 + 筹码10 + 技术5 + 风控5 = 100分
              </span>
            </div>

            {(data.candidates || []).length === 0 ? (
              <div className="p-8 text-center text-sm text-slate-500">
                当前多重组合条件较为严格，暂未找到同时满足所有约束的标的；请尝试放宽股价上限、PE/ROE或移除部分交叉条件后重试。
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-4 py-2.5 font-medium">排名</th>
                      <th className="text-left px-4 py-2.5 font-medium">代码 / 名称</th>
                      <th className="text-left px-4 py-2.5 font-medium">行业</th>
                      <th className="text-right px-4 py-2.5 font-medium">最新股价</th>
                      <th className="text-right px-4 py-2.5 font-medium">PE / PB · 股息</th>
                      <th className="text-right px-4 py-2.5 font-medium">总评分 / 评级</th>
                      <th className="text-left px-4 py-2.5 font-medium">当前K线买点判断</th>
                      <th className="text-right px-4 py-2.5 font-medium">理想观察买区</th>
                      <th className="text-right px-4 py-2.5 font-medium">止盈T1 / 止损</th>
                      <th className="text-right px-4 py-2.5 font-medium">盈亏比</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.candidates.map((c: any) => {
                      const active = selectedCandidate?.symbol === c.symbol;
                      const inBuy = c.tradePlan.buyTimingVerdict === '当前进入理想买区';
                      return (
                        <tr
                          key={c.symbol}
                          onClick={() => setSelectedSymbol(c.symbol)}
                          className={`cursor-pointer transition-colors ${
                            active ? 'bg-blue-50/70' : 'hover:bg-slate-50'
                          }`}
                        >
                          <td className="px-4 py-3 font-mono font-bold text-slate-900">#{c.rank}</td>
                          <td className="px-4 py-3">
                            <div className="font-semibold text-slate-900">
                              <span className="font-mono text-blue-700 mr-1.5">{c.symbol}</span>
                              {c.name}
                            </div>
                            <div className="text-[11px] text-slate-500 mt-0.5">
                              {c.board} · 市值 {c.totalMarketCapYi ?? '-'}亿
                            </div>
                          </td>
                          <td className="px-4 py-3 text-slate-700">{c.industry}</td>
                          <td className={`px-4 py-3 text-right font-mono tabular-nums ${priceColorClass(c.changePct)}`}>
                            <div className="font-semibold">{c.price.toFixed(2)}</div>
                            <div className="text-[11px]">{formatPct(c.changePct)}</div>
                          </td>
                          <td className="px-4 py-3 text-right font-mono tabular-nums text-slate-600">
                            <div>{c.peTtm !== null ? `${c.peTtm.toFixed(1)}x` : '-'}</div>
                            <div className="text-[11px]">
                              {c.pb !== null ? `PB ${c.pb.toFixed(2)}` : '-'}
                              {c.dividendYield !== null && c.dividendYield > 0 ? ` · 息${c.dividendYield.toFixed(1)}%` : ''}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="font-mono tabular-nums text-sm font-bold text-slate-900">
                              {c.totalScore} / 100
                            </div>
                            <div className="text-[11px] text-slate-600">{c.ratingLabel}</div>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`font-medium ${
                                inBuy ? 'text-red-600' : 'text-amber-700'
                              }`}
                            >
                              {c.tradePlan.buyTimingVerdict}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-mono tabular-nums font-medium text-blue-700">
                            {c.tradePlan.buyZoneLow}~{c.tradePlan.buyZoneHigh}
                          </td>
                          <td className="px-4 py-3 text-right font-mono tabular-nums">
                            <span className="text-red-600">{c.tradePlan.takeProfit1}</span>
                            <span className="text-slate-400 mx-1">/</span>
                            <span className="text-emerald-600">{c.tradePlan.stopLossPrice}</span>
                          </td>
                          <td className="px-4 py-3 text-right font-mono tabular-nums font-semibold text-slate-900">
                            {c.tradePlan.riskRewardRatio}:1
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Selected Candidate Deep Interactive K-Line + Buy/TP/SL Plan + 8D Scores */}
          {selectedCandidate && (
            <div className="space-y-6">
              {/* Top Focus Anchor: K-Line Buy/TP/SL Chart + Trade Plan */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
                <div className="lg:col-span-2 p-5 bg-white border border-slate-200 rounded-lg flex flex-col justify-between space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                    <div>
                      <div className="flex items-baseline gap-2.5">
                        <h3 className="text-base font-semibold text-slate-900">
                          {selectedCandidate.name} ({selectedCandidate.symbol}) — K线技术面与买卖点位标注
                        </h3>
                        <span className="text-xs text-slate-500">
                          {selectedCandidate.industry} · 价格日期 {selectedCandidate.priceDate}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-slate-500">
                        图例：蓝色线=理想买点区（{selectedCandidate.tradePlan.buyZoneLow}~{selectedCandidate.tradePlan.buyZoneHigh}元） · 琥珀/红线=分批止盈（{selectedCandidate.tradePlan.takeProfit1}/{selectedCandidate.tradePlan.takeProfit2}元） · 绿色线=严格止损（{selectedCandidate.tradePlan.stopLossPrice}元）
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <button
                        onClick={() => setShowMA(!showMA)}
                        className={`px-2.5 py-1 rounded border whitespace-nowrap shrink-0 ${
                          showMA ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200'
                        }`}
                      >
                        MA5/20/60
                      </button>
                      <button
                        onClick={() => setShowMA120(!showMA120)}
                        className={`px-2.5 py-1 rounded border whitespace-nowrap shrink-0 ${
                          showMA120 ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200'
                        }`}
                      >
                        MA120
                      </button>
                      <button
                        onClick={() => setShowBoll(!showBoll)}
                        className={`px-2.5 py-1 rounded border whitespace-nowrap shrink-0 ${
                          showBoll ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200'
                        }`}
                      >
                        BOLL
                      </button>
                    </div>
                  </div>

                  <KlineChart
                    bars={selectedCandidate.klineBars || []}
                    indicators={selectedCandidate.klineIndicators || []}
                    showMA={showMA}
                    showMA120={showMA120}
                    showBoll={showBoll}
                    priceLines={klinePriceLines}
                    height={390}
                  />

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-100 text-xs">
                    <div>
                      <div className="text-slate-500">趋势与均线</div>
                      <div className="mt-0.5 font-medium text-slate-900">
                        {selectedCandidate.technicalSummary.trendDirection}
                      </div>
                      <div className="text-[11px] text-slate-500 truncate" title={selectedCandidate.technicalSummary.maAlignment}>
                        {selectedCandidate.technicalSummary.maAlignment}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500">关键支撑 / 压力位</div>
                      <div className="mt-0.5 font-mono tabular-nums text-slate-900">
                        支 {selectedCandidate.technicalSummary.supportLevels.slice(0, 2).join('/') || '-'}
                      </div>
                      <div className="text-[11px] font-mono tabular-nums text-slate-500">
                        压 {selectedCandidate.technicalSummary.resistanceLevels.slice(0, 2).join('/') || '-'}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500">MA20 / MA60 / MA120</div>
                      <div className="mt-0.5 font-mono tabular-nums text-slate-900">
                        {selectedCandidate.technicalSummary.latestMa20?.toFixed(2) ?? '-'} /{' '}
                        {selectedCandidate.technicalSummary.latestMa60?.toFixed(2) ?? '-'}
                      </div>
                      <div className="text-[11px] font-mono tabular-nums text-slate-500">
                        MA120: {selectedCandidate.technicalSummary.latestMa120?.toFixed(2) ?? '-'}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500">MACD / RSI14 / ATR14</div>
                      <div className="mt-0.5 font-mono tabular-nums text-slate-900">
                        RSI {selectedCandidate.technicalSummary.latestRsi14?.toFixed(1) ?? '-'} · ATR{' '}
                        {selectedCandidate.technicalSummary.latestAtr14?.toFixed(2) ?? '-'}
                      </div>
                      <div className="text-[11px] font-mono tabular-nums text-slate-500">
                        DIF {selectedCandidate.technicalSummary.latestMacdDif?.toFixed(3) ?? '-'} / DEA{' '}
                        {selectedCandidate.technicalSummary.latestMacdDea?.toFixed(3) ?? '-'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right: Part 5 Buy Plan + Take-Profit / Stop-Loss Card */}
                <div className="p-5 bg-white border border-slate-200 rounded-lg flex flex-col justify-between space-y-4">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <h3 className="text-sm font-semibold text-slate-900">05. 买入计划与止盈止损方案</h3>
                      <span className="font-mono text-xs font-semibold text-slate-900">
                        {selectedCandidate.totalScore} 分
                      </span>
                    </div>

                    <div className="p-3 bg-slate-50 rounded-lg space-y-1.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">当前时点定性</span>
                        <span
                          className={`font-semibold ${
                            selectedCandidate.tradePlan.buyTimingVerdict === '当前进入理想买区'
                              ? 'text-red-600'
                              : 'text-amber-700'
                          }`}
                        >
                          {selectedCandidate.tradePlan.buyTimingVerdict}
                        </span>
                      </div>
                      <p className="text-slate-600 leading-relaxed">{selectedCandidate.tradePlan.waitCondition}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="p-2.5 border border-slate-200 rounded-lg">
                        <div className="text-slate-500">理想观察买区</div>
                        <div className="mt-1 text-sm font-bold font-mono tabular-nums text-blue-700">
                          {selectedCandidate.tradePlan.buyZoneLow} ~ {selectedCandidate.tradePlan.buyZoneHigh} 元
                        </div>
                      </div>
                      <div className="p-2.5 border border-slate-200 rounded-lg">
                        <div className="text-slate-500">严格止损线</div>
                        <div className="mt-1 text-sm font-bold font-mono tabular-nums text-emerald-600">
                          {selectedCandidate.tradePlan.stopLossPrice} 元 ({selectedCandidate.tradePlan.stopLossPctFromBuyMid}%)
                        </div>
                      </div>
                      <div className="p-2.5 border border-slate-200 rounded-lg">
                        <div className="text-slate-500">第一止盈 T1</div>
                        <div className="mt-1 text-sm font-bold font-mono tabular-nums text-red-600">
                          {selectedCandidate.tradePlan.takeProfit1} 元 (+{selectedCandidate.tradePlan.takeProfit1Pct}%)
                        </div>
                      </div>
                      <div className="p-2.5 border border-slate-200 rounded-lg">
                        <div className="text-slate-500">第二止盈 T2 / 盈亏比</div>
                        <div className="mt-1 text-sm font-bold font-mono tabular-nums text-red-600">
                          {selectedCandidate.tradePlan.takeProfit2} 元 · {selectedCandidate.tradePlan.riskRewardRatio}:1
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2 text-xs text-slate-600 leading-relaxed">
                      <div>
                        <span className="font-semibold text-slate-800">合理估值区间（悲观/中性/乐观）：</span>
                        <span className="font-mono tabular-nums">
                          {selectedCandidate.tradePlan.valuationRange.pessimistic ?? '-'} /{' '}
                          {selectedCandidate.tradePlan.valuationRange.neutral ?? '-'} /{' '}
                          {selectedCandidate.tradePlan.valuationRange.optimistic ?? '-'} 元
                        </span>
                      </div>
                      <div>
                        <span className="font-semibold text-slate-800">K线买点依据：</span>
                        {selectedCandidate.tradePlan.buyAnchorReason}
                      </div>
                      <div>
                        <span className="font-semibold text-slate-800">分批建仓思路：</span>
                        {selectedCandidate.tradePlan.batchBuyStrategy}
                      </div>
                      <div>
                        <span className="font-semibold text-slate-800">止损与失效条件：</span>
                        {selectedCandidate.tradePlan.invalidationCondition}
                      </div>
                      <div>
                        <span className="font-semibold text-slate-800">预期持有周期：</span>
                        {selectedCandidate.tradePlan.holdingHorizon}
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center gap-2">
                    <button
                      onClick={() => handleAddWatchlist(selectedCandidate)}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 whitespace-nowrap"
                    >
                      <Star className="w-3.5 h-3.5" />
                      加入自选池
                    </button>
                    <button
                      onClick={() => onSelectStock(selectedCandidate.symbol)}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 whitespace-nowrap"
                    >
                      个股深度工作台
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Part 3 & Part 4 & 8D Matrix */}
              <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-1 bg-slate-200/70 p-1 rounded-lg">
                    {[
                      { id: 'scores', label: '八维度100分评分明细' },
                      { id: 'deep11', label: '03. 单只股票11项深度分析' },
                      { id: 'value5', label: '04. 投资价值五问' },
                      { id: 'financials', label: '近5年财务趋势与同行对比' },
                    ].map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setDetailTab(t.id as any)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 transition-colors ${
                          detailTab === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                  <span className="text-xs text-slate-500">
                    当前标的总评：<strong className="font-mono text-slate-900">{selectedCandidate.totalScore} / 100</strong>（
                    {selectedCandidate.ratingLabel}）
                  </span>
                </div>

                <div className="p-5">
                  {detailTab === 'scores' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {selectedCandidate.dimensions.map((d: any) => {
                        const pct = d.maxScore > 0 ? (d.score / d.maxScore) * 100 : 0;
                        return (
                          <div key={d.key} className="p-4 border border-slate-200 rounded-lg space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="text-xs font-semibold text-slate-900">{d.label}</span>
                              <span className="font-mono tabular-nums text-xs font-bold text-slate-900">
                                {d.score} / {d.maxScore}
                              </span>
                            </div>
                            <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-blue-700 rounded-full"
                                style={{ width: `${Math.min(100, pct)}%` }}
                              />
                            </div>
                            <div className="text-xs font-medium text-slate-800">{d.summary}</div>
                            <div className="text-xs text-slate-600 leading-relaxed">{d.evidence}</div>
                            <div className="text-[11px] text-slate-400">
                              数据来源：{d.dataSource}
                              {d.missingNote ? ` · 口径提醒：${d.missingNote}` : ''}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {detailTab === 'deep11' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                      {[
                        { title: '1. 公司业务与商业模式', text: selectedCandidate.deepAnalysis11.companyBusiness },
                        { title: '2. 行业地位', text: selectedCandidate.deepAnalysis11.industryPosition },
                        { title: '3. 核心竞争力与护城河', text: selectedCandidate.deepAnalysis11.coreMoat },
                        { title: '4. 最近5年财务情况', text: selectedCandidate.deepAnalysis11.fiveYearFinancialSummary },
                        { title: '5. 盈利质量与现金流', text: selectedCandidate.deepAnalysis11.earningsQuality },
                        { title: '6. 成长逻辑（已实现 vs 情景推演）', text: selectedCandidate.deepAnalysis11.growthLogic },
                        { title: '7. 估值水平与历史分位', text: selectedCandidate.deepAnalysis11.valuationLevel },
                        { title: '8. 机构持仓与股东变化', text: selectedCandidate.deepAnalysis11.institutionalChange },
                        { title: '9. 技术趋势与买点结构', text: selectedCandidate.deepAnalysis11.technicalTrend },
                        { title: '10. 主要风险核查', text: selectedCandidate.deepAnalysis11.majorRisks },
                        { title: '11. 投资逻辑是否成立', text: selectedCandidate.deepAnalysis11.thesisValidity },
                      ].map((item) => (
                        <div key={item.title} className="p-4 border border-slate-200 rounded-lg space-y-1.5">
                          <div className="font-semibold text-slate-900">{item.title}</div>
                          <p className="text-slate-600 leading-relaxed">{item.text}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {detailTab === 'value5' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                      {[
                        { q: '当前估值是否合理？', a: selectedCandidate.valueJudgment5.isValuationReasonable },
                        { q: '未来3年成长空间如何？', a: selectedCandidate.valueJudgment5.threeYearGrowthSpace },
                        { q: '公司是否值得长期跟踪？', a: selectedCandidate.valueJudgment5.worthLongTermTracking },
                        { q: '当前时点是否适合买入？', a: selectedCandidate.valueJudgment5.suitableToBuyNow },
                        { q: '如果不适合或等待低吸，需要什么条件？', a: selectedCandidate.valueJudgment5.waitConditionsIfNot },
                      ].map((row) => (
                        <div key={row.q} className="p-4 border border-slate-200 rounded-lg space-y-1.5">
                          <div className="font-semibold text-slate-900">{row.q}</div>
                          <p className="text-slate-700 leading-relaxed">{row.a}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {detailTab === 'financials' && (
                    <div className="space-y-6">
                      <FinancialTrendChart
                        rows={selectedCandidate.annualFinancials || []}
                        title={`${selectedCandidate.name} 最近5年报营业收入、净利润与经营现金流`}
                      />

                      <div className="overflow-x-auto border border-slate-200 rounded-lg">
                        <table className="w-full text-xs">
                          <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                            <tr>
                              <th className="text-left px-3 py-2 font-medium">年报期</th>
                              <th className="text-right px-3 py-2 font-medium">营业收入</th>
                              <th className="text-right px-3 py-2 font-medium">营收同比</th>
                              <th className="text-right px-3 py-2 font-medium">归母净利</th>
                              <th className="text-right px-3 py-2 font-medium">净利同比</th>
                              <th className="text-right px-3 py-2 font-medium">ROE</th>
                              <th className="text-right px-3 py-2 font-medium">毛利率</th>
                              <th className="text-right px-3 py-2 font-medium">经营现金流</th>
                              <th className="text-right px-3 py-2 font-medium">负债率</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {(selectedCandidate.annualFinancials || []).map((f: any) => (
                              <tr key={f.reportDate} className="hover:bg-slate-50">
                                <td className="px-3 py-2 font-mono text-slate-900">{f.reportDate}</td>
                                <td className="px-3 py-2 text-right font-mono tabular-nums">{formatYuanYi(f.revenue)}</td>
                                <td className={`px-3 py-2 text-right font-mono tabular-nums ${priceColorClass(f.revenueYoy)}`}>
                                  {formatPct(f.revenueYoy)}
                                </td>
                                <td className="px-3 py-2 text-right font-mono tabular-nums">{formatYuanYi(f.netProfit)}</td>
                                <td className={`px-3 py-2 text-right font-mono tabular-nums ${priceColorClass(f.netProfitYoy)}`}>
                                  {formatPct(f.netProfitYoy)}
                                </td>
                                <td className="px-3 py-2 text-right font-mono tabular-nums">
                                  {f.roe !== null ? `${f.roe.toFixed(1)}%` : '缺失'}
                                </td>
                                <td className="px-3 py-2 text-right font-mono tabular-nums">
                                  {f.grossMargin !== null ? `${f.grossMargin.toFixed(1)}%` : '缺失'}
                                </td>
                                <td className="px-3 py-2 text-right font-mono tabular-nums">
                                  {formatYuanYi(f.operatingCashFlow)}
                                </td>
                                <td className="px-3 py-2 text-right font-mono tabular-nums">
                                  {f.debtToAssetRatio !== null ? `${f.debtToAssetRatio.toFixed(1)}%` : '缺失'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {(selectedCandidate.peers || []).length > 0 && (
                        <div className="overflow-x-auto border border-slate-200 rounded-lg">
                          <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-900">
                            同行业可比公司横向估值对比
                          </div>
                          <table className="w-full text-xs">
                            <thead className="text-slate-500 border-b border-slate-100">
                              <tr>
                                <th className="text-left px-3 py-2 font-medium">代码 / 名称</th>
                                <th className="text-right px-3 py-2 font-medium">最新价</th>
                                <th className="text-right px-3 py-2 font-medium">涨跌幅</th>
                                <th className="text-right px-3 py-2 font-medium">PE(TTM)</th>
                                <th className="text-right px-3 py-2 font-medium">PB</th>
                                <th className="text-right px-3 py-2 font-medium">总市值</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {selectedCandidate.peers.map((p: any) => (
                                <tr key={p.symbol} className="hover:bg-slate-50">
                                  <td className="px-3 py-2">
                                    <button
                                      onClick={() => onSelectStock(p.symbol)}
                                      className="text-blue-700 hover:underline font-medium"
                                    >
                                      <span className="font-mono mr-1.5">{p.symbol}</span>
                                      {p.name}
                                    </button>
                                  </td>
                                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                                    {p.price !== null ? p.price.toFixed(2) : '-'}
                                  </td>
                                  <td className={`px-3 py-2 text-right font-mono tabular-nums ${priceColorClass(p.changePct)}`}>
                                    {formatPct(p.changePct)}
                                  </td>
                                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                                    {p.peTtm !== null ? p.peTtm.toFixed(1) : '-'}
                                  </td>
                                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                                    {p.pb !== null ? p.pb.toFixed(2) : '-'}
                                  </td>
                                  <td className="px-3 py-2 text-right font-mono tabular-nums">
                                    {formatYuanYi(p.totalMarketCap)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Part 6: Final Conclusion & Eliminated Stocks Transparency */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="p-5 bg-white border border-slate-200 rounded-lg space-y-3">
              <h2 className="text-sm font-semibold text-slate-900 border-b border-slate-100 pb-2.5">
                06. 最终结论：最值得深入研究的 1-3 家核心标的
              </h2>
              <div className="space-y-3 text-xs">
                {(data.finalConclusion?.topFocusPicks || []).map((p: any) => (
                  <div key={p.symbol} className="p-3 bg-slate-50 rounded-lg space-y-1">
                    <div className="flex items-center justify-between">
                      <button
                        onClick={() => setSelectedSymbol(p.symbol)}
                        className="font-semibold text-blue-700 hover:underline"
                      >
                        第 {p.rank} 名 · {p.name} ({p.symbol})
                      </button>
                      <span className="font-mono font-bold text-slate-900">{p.totalScore} 分</span>
                    </div>
                    <p className="text-slate-600 leading-relaxed">{p.whyChosen}</p>
                  </div>
                ))}
                <div className="pt-1 text-slate-600 leading-relaxed">
                  <span className="font-semibold text-slate-800">次序说明：</span>
                  {data.finalConclusion?.whyOthersRankedLower}
                </div>
                <div className="text-slate-600 leading-relaxed">
                  <span className="font-semibold text-slate-800">执行纪律：</span>
                  {data.finalConclusion?.executionDisciplineNote}
                </div>
              </div>
            </div>

            <div className="p-5 bg-white border border-slate-200 rounded-lg space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
                <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-amber-600" />
                  深度复核淘汰与备选名单
                </h2>
                <span className="text-xs text-slate-500">不掩盖风险，透明记录淘汰原因</span>
              </div>
              {(data.eliminatedList || []).length === 0 ? (
                <div className="text-xs text-slate-500 py-4">本次深度复核池标的均通过基础风控检查。</div>
              ) : (
                <div className="space-y-2 text-xs">
                  {data.eliminatedList.map((e: any) => (
                    <div key={e.symbol} className="p-3 border border-slate-200 rounded-lg space-y-1">
                      <div className="flex items-center justify-between">
                        <button
                          onClick={() => onSelectStock(e.symbol)}
                          className="font-medium text-slate-900 hover:text-blue-700"
                        >
                          <span className="font-mono mr-1.5">{e.symbol}</span>
                          {e.name} · {e.industry}
                        </button>
                        <span className="font-mono text-slate-500">{e.totalScore} 分</span>
                      </div>
                      <div className="text-slate-600">{(e.reasons || []).join('；')}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Optional AI Deep Report View */}
          {aiReport && (
            <div className="p-5 bg-white border border-slate-200 rounded-lg space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <h2 className="text-sm font-semibold text-slate-900">
                  AI 投研专家完整六部分深度报告（基于实测筛股证据生成）
                </h2>
                <span className="text-xs text-slate-500 font-mono">
                  模型 {aiReport.modelUsed} · {aiReport.generatedAt.slice(0, 19).replace('T', ' ')}
                </span>
              </div>
              <pre className="whitespace-pre-wrap font-sans text-xs text-slate-700 leading-relaxed bg-slate-50 p-4 rounded-lg border border-slate-100 overflow-x-auto">
                {aiReport.reportMarkdown}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
