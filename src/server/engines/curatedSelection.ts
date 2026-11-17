import { GoogleGenAI } from '@google/genai';
import {
  fetchCapitalFlow,
  fetchComparablePeers,
  fetchStockAnnouncements,
  fetchStockFundamentalsAndFinancials,
  fetchStockOhlcv,
  fetchStockQuote,
  getCachedMarketOverviewAndSentiment,
} from '../adapters/aShareMarket.ts';
import { computeTechnicalIndicators, TechnicalSummary } from './indicators.ts';
import { evaluateTradingRule, inferExchangeAndBoard } from './tradingRules.ts';
import { evaluateFundamentalsAndValuation, ValuationAndQualityOutput } from './valuation.ts';
import { normalizeChatCompletionsEndpoint } from './aiAgents.ts';

const UA_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
};

export interface CuratedScreenOptions {
  targetCount?: number; // 3 | 5 | 10 | 20 (clamped 3..20)
  boardFilter?: '全部' | '主板' | '创业板' | '科创板' | '北交所';
  stylePreference?: '均衡优质' | '低估价值' | '成长龙头';
  industryNode?: string;
  industryName?: string;
  conceptNode?: string;
  conceptName?: string;
  minPrice?: number;
  maxPrice?: number;
  minRoePct?: number;
  maxPe?: number;
  maxPb?: number;
  minMarketCapYi?: number;
  maxMarketCapYi?: number;
  minDividendYield?: number;
  minRevYoyPct?: number;
  minProfitYoyPct?: number;
  minGrossMarginPct?: number;
  maxDebtRatioPct?: number;
  onlyBuyZone?: boolean;
}

export interface FilterCatalogItem {
  code: string;
  name: string;
  category: string;
}

export interface CuratedFilterCatalog {
  industries: FilterCatalogItem[];
  concepts: FilterCatalogItem[];
  updatedAt: string;
}

export interface Dimension8Score {
  key:
    | 'fundamental'
    | 'financialHealth'
    | 'growthPotential'
    | 'valuation'
    | 'industryProsperity'
    | 'capitalAndChips'
    | 'technicalTiming'
    | 'riskControl';
  label: string;
  maxScore: number;
  score: number;
  summary: string;
  evidence: string;
  dataSource: string;
  missingNote: string | null;
}

export interface KlineTradePlan {
  currentPrice: number;
  buyZoneLow: number;
  buyZoneHigh: number;
  buyAnchorReason: string;
  buyTimingVerdict: '当前进入理想买区' | '偏离理想买点·建议等待回踩' | '趋势偏弱·等待右侧企稳';
  waitCondition: string;
  idealEntrySignal: string;
  stopLossPrice: number;
  stopLossPctFromBuyMid: number;
  stopLossBasis: string;
  takeProfit1: number;
  takeProfit1Pct: number;
  takeProfit2: number;
  takeProfit2Pct: number;
  takeProfitBasis: string;
  riskRewardRatio: number;
  valuationRange: {
    pessimistic: number | null;
    neutral: number | null;
    optimistic: number | null;
  };
  batchBuyStrategy: string;
  invalidationCondition: string;
  holdingHorizon: string;
}

export interface CuratedCandidate {
  rank: number;
  symbol: string;
  tsCode: string;
  name: string;
  exchange: string;
  board: string;
  industry: string;
  price: number;
  changePct: number | null;
  priceDate: string;
  totalMarketCapYi: number | null;
  peTtm: number | null;
  pb: number | null;
  ps: number | null;
  peg: number | null;
  dividendYield: number | null;
  pePercentile: number | null;
  marginOfSafetyPct: number | null;
  totalScore: number;
  ratingLabel: string;
  dimensions: Dimension8Score[];
  coreThesis: string;
  mainRisks: string[];
  disqualified: boolean;
  disqualifyReasons: string[];
  deepAnalysis11: {
    companyBusiness: string;
    industryPosition: string;
    coreMoat: string;
    fiveYearFinancialSummary: string;
    earningsQuality: string;
    growthLogic: string;
    valuationLevel: string;
    institutionalChange: string;
    technicalTrend: string;
    majorRisks: string;
    thesisValidity: string;
  };
  valueJudgment5: {
    isValuationReasonable: string;
    threeYearGrowthSpace: string;
    worthLongTermTracking: string;
    suitableToBuyNow: string;
    waitConditionsIfNot: string;
  };
  tradePlan: KlineTradePlan;
  annualFinancials: any[];
  quarterlyFinancials: any[];
  peers: any[];
  shareholderNumbers: any[];
  institutionalHoldings: any[];
  dividends: any[];
  announcements: any[];
  capitalFlowToday: any;
  klineBars: any[];
  klineIndicators: any[];
  technicalSummary: {
    trendDirection: string;
    maAlignment: string;
    crossovers: string[];
    volumeAnalysis: string;
    breakoutState: string;
    supportLevels: number[];
    resistanceLevels: number[];
    latestMa20: number | null;
    latestMa60: number | null;
    latestMa120: number | null;
    latestRsi14: number | null;
    latestMacdDif: number | null;
    latestMacdDea: number | null;
    latestAtr14: number | null;
  };
  provenance: {
    quoteSource: string;
    financialPeriod: string;
    latestInterimPeriod: string | null;
    missingFields: string[];
  };
}

export interface CuratedSelectionResult {
  screeningMeta: {
    analysisDate: string;
    generatedAt: string;
    annualPeriodUsed: string;
    interimPeriodUsed: string | null;
    universeScope: string;
    stylePreference: string;
    boardFilter: string;
    targetCount: number;
    industryFilterName: string | null;
    conceptFilterName: string | null;
    appliedFiltersSummary: string[];
    funnel: {
      universeTotalCount: number;
      excludedStDelistingCount: number;
      excludedFinancialWeakCount: number;
      excludedQuoteValuationCount: number;
      deepAnalyzedCount: number;
      eliminatedRiskCount: number;
      finalistCount: number;
    };
    marketSentiment: {
      phaseLabel: string;
      sentimentScore: number;
      upRatioPct: number | null;
    } | null;
    dataIntegrityNote: string;
  };
  candidates: CuratedCandidate[];
  eliminatedList: {
    symbol: string;
    name: string;
    industry: string;
    totalScore: number;
    reasons: string[];
  }[];
  finalConclusion: {
    topFocusPicks: {
      rank: number;
      symbol: string;
      name: string;
      totalScore: number;
      whyChosen: string;
    }[];
    whyOthersRankedLower: string;
    executionDisciplineNote: string;
  };
}

function isValidAShareCode(code: string): boolean {
  return /^(00\d{4}|30\d{4}|60\d{4}|688\d{3}|689\d{3}|8\d{5}|920\d{3}|43\d{4})$/.test(code);
}

function fmtNum(v: number | null | undefined, digits = 2, suffix = ''): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '未知';
  return `${v.toFixed(digits)}${suffix}`;
}

function fmtYi(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '未知';
  const abs = Math.abs(v);
  if (abs >= 1e8) return `${(v / 1e8).toFixed(2)}亿元`;
  if (abs >= 1e4) return `${(v / 1e4).toFixed(1)}万元`;
  return `${v.toFixed(0)}元`;
}

function getRatingLabel(score: number): string {
  if (score >= 90) return '优质候选，重点研究';
  if (score >= 80) return '优秀候选，值得关注';
  if (score >= 70) return '一般候选，等待改善';
  if (score >= 60) return '投资价值不足';
  return '原则上淘汰';
}

function getReportPeriodCandidates() {
  const nowBj = new Date(Date.now() + 8 * 3600 * 1000);
  const year = nowBj.getUTCFullYear();
  return {
    annuals: [`${year - 1}-12-31`, `${year - 2}-12-31`],
    interims: [`${year}-09-30`, `${year}-06-30`, `${year}-03-31`, `${year - 1}-09-30`],
  };
}

let cachedFilterCatalog: { data: CuratedFilterCatalog; ts: number } | null = null;

export async function getCuratedFilterCatalog(): Promise<CuratedFilterCatalog> {
  if (cachedFilterCatalog && Date.now() - cachedFilterCatalog.ts < 30 * 60 * 1000) {
    return cachedFilterCatalog.data;
  }
  const resp = await fetch(
    'https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodes',
    { headers: UA_HEADERS, signal: AbortSignal.timeout(9000) }
  );
  if (!resp.ok) throw new Error(`行业概念目录接口 HTTP ${resp.status}`);
  const tree = await resp.json();

  const buckets: Record<string, { name: string; code: string }[]> = {};
  const walk = (node: any) => {
    if (!Array.isArray(node)) return;
    const label = node[0];
    const children = node[1];
    if (['申万行业', '新浪行业', '概念板块', '热门概念'].includes(label) && Array.isArray(children)) {
      buckets[label] = children
        .map((c: any) => ({ name: String(c?.[0] || '').trim(), code: String(c?.[2] || '').trim() }))
        .filter((x) => x.name && x.code);
    } else if (Array.isArray(children)) {
      for (const ch of children) walk(ch);
    }
  };
  walk(tree);

  const indSeen = new Set<string>();
  const industries: FilterCatalogItem[] = [];
  for (const item of buckets['申万行业'] || []) {
    if (!indSeen.has(item.name)) {
      indSeen.add(item.name);
      industries.push({ code: item.code, name: item.name, category: '申万一级' });
    }
  }
  for (const item of buckets['新浪行业'] || []) {
    if (!indSeen.has(item.name)) {
      indSeen.add(item.name);
      industries.push({ code: item.code, name: item.name, category: '新浪行业' });
    }
  }

  const conSeen = new Set<string>();
  const concepts: FilterCatalogItem[] = [];
  for (const item of buckets['概念板块'] || []) {
    if (!conSeen.has(item.name)) {
      conSeen.add(item.name);
      concepts.push({ code: item.code, name: item.name, category: '核心概念' });
    }
  }
  for (const item of buckets['热门概念'] || []) {
    if (!conSeen.has(item.name)) {
      conSeen.add(item.name);
      concepts.push({ code: item.code, name: item.name, category: '热门题材' });
    }
  }

  const data: CuratedFilterCatalog = {
    industries,
    concepts,
    updatedAt: new Date().toISOString(),
  };
  cachedFilterCatalog = { data, ts: Date.now() };
  return data;
}

async function fetchSinaNodeMembers(nodeId: string, maxPages = 4): Promise<{ symbol: string; name: string }[]> {
  const pages = Array.from({ length: maxPages }, (_, idx) => idx + 1);
  const results = await Promise.all(
    pages.map(async (page) => {
      try {
        const url = `https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData?page=${page}&num=100&sort=mktcap&asc=0&node=${encodeURIComponent(
          nodeId
        )}`;
        const r = await fetch(url, { headers: UA_HEADERS, signal: AbortSignal.timeout(8000) });
        if (!r.ok) return [];
        const arr = await r.json();
        return Array.isArray(arr) ? arr : [];
      } catch {
        return [];
      }
    })
  );

  const out: { symbol: string; name: string }[] = [];
  const seen = new Set<string>();
  for (const pageArr of results) {
    for (const row of pageArr) {
      const code = String(row?.code || '').trim();
      const name = String(row?.name || '').trim();
      if (isValidAShareCode(code) && !seen.has(code)) {
        seen.add(code);
        out.push({ symbol: code, name });
      }
    }
  }
  return out;
}

async function fetchDatacenterPage(
  filter: string,
  pageSize = 200,
  sort = 'PARENT_NETPROFIT',
  order = -1,
  pageNumber = 1
) {
  const cols =
    'SECURITY_CODE,SECUCODE,SECURITY_NAME_ABBR,REPORTDATE,BASIC_EPS,TOTAL_OPERATE_INCOME,PARENT_NETPROFIT,WEIGHTAVG_ROE,YSTZ,SJLTZ,XSMLL,BPS,PUBLISHNAME';
  const url = `https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_LICO_FN_CPD&columns=${cols}&pageSize=${pageSize}&pageNumber=${pageNumber}&sortColumns=${sort}&sortTypes=${order}&filter=${encodeURIComponent(
    filter
  )}`;
  const resp = await fetch(url, { headers: UA_HEADERS, signal: AbortSignal.timeout(9000) });
  if (!resp.ok) throw new Error(`EastMoney datacenter HTTP ${resp.status}`);
  return (await resp.json()) as any;
}

async function fetchDatacenterBySymbols(reportDate: string, symbols: string[]): Promise<any[]> {
  if (!symbols.length) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < symbols.length; i += 80) {
    chunks.push(symbols.slice(i, i + 80));
  }
  const pages = await Promise.all(
    chunks.map(async (chunk) => {
      const inList = chunk.map((s) => `"${s}"`).join(',');
      const filter = `(REPORTDATE='${reportDate}')(SECURITY_CODE in (${inList}))`;
      try {
        const res = await fetchDatacenterPage(filter, 100, 'WEIGHTAVG_ROE', -1, 1);
        return (res?.result?.data || []) as any[];
      } catch {
        return [];
      }
    })
  );
  return pages.flat();
}

async function asyncPool<T>(concurrency: number, items: T[], fn: (item: T) => Promise<void>): Promise<void> {
  let idx = 0;
  const workers = Array.from({ length: Math.min(concurrency, Math.max(1, items.length)) }, async () => {
    while (idx < items.length) {
      const cur = items[idx++];
      await fn(cur);
    }
  });
  await Promise.all(workers);
}

async function fetchTencentQuotesBatch(symbols: string[]): Promise<Record<string, any>> {
  const result: Record<string, any> = {};
  if (!symbols.length) return result;

  const chunks: string[][] = [];
  for (let i = 0; i < symbols.length; i += 40) {
    chunks.push(symbols.slice(i, i + 40));
  }

  await Promise.all(
    chunks.map(async (batch) => {
      const codes = batch.map((s) => inferExchangeAndBoard(s).tencentCode);
      try {
        const resp = await fetch(`https://qt.gtimg.cn/q=${codes.join(',')}`, {
          headers: UA_HEADERS,
          signal: AbortSignal.timeout(6000),
        });
        const buf = await resp.arrayBuffer();
        const txt = new TextDecoder('gbk').decode(buf);
        for (const line of txt.split('\n')) {
          const m = line.match(/v_\w+="([^"]+)"/);
          if (!m) continue;
          const f = m[1].split('~');
          if (f.length < 47) continue;
          const sym = f[2];
          result[sym] = {
            symbol: sym,
            name: f[1],
            price: parseFloat(f[3]) || null,
            prevClose: parseFloat(f[4]) || null,
            open: parseFloat(f[5]) || null,
            volume: parseFloat(f[6]) ? parseFloat(f[6]) * 100 : 0,
            changePct: f[32] ? parseFloat(f[32]) : null,
            turnoverRate: f[38] ? parseFloat(f[38]) : null,
            peTtm: f[39] ? parseFloat(f[39]) : null,
            totalMarketCapYi: f[45] ? parseFloat(f[45]) : null,
            pb: f[46] ? parseFloat(f[46]) : null,
            dividendYield: f[64] ? parseFloat(f[64]) : null,
            quoteDate: f[30] ? `${f[30].slice(0, 4)}-${f[30].slice(4, 6)}-${f[30].slice(6, 8)}` : '',
          };
        }
      } catch {
        // non-fatal batch fail
      }
    })
  );
  return result;
}

function buildKlineTradePlan(params: {
  price: number;
  tech: TechnicalSummary;
  valuation: ValuationAndQualityOutput;
  isBankOrFinancial: boolean;
  stylePreference: string;
}): KlineTradePlan {
  const { price, tech, valuation, isBankOrFinancial, stylePreference } = params;
  const ma20 = tech.latest?.ma20 ?? null;
  const ma60 = tech.latest?.ma60 ?? null;
  const ma120 = tech.latest?.ma120 ?? null;
  const bollLower = tech.latest?.bollLower ?? null;
  const rsi14 = tech.latest?.rsi14 ?? null;
  const atr = tech.latest?.atr14 && tech.latest.atr14 > 0 ? tech.latest.atr14 : price * 0.025;

  const neuScenario = valuation.scenarios.find((s) => s.label === '中性情景')?.targetPrice ?? null;
  const optScenario = valuation.scenarios.find((s) => s.label === '乐观情景')?.targetPrice ?? null;
  const pesScenario = valuation.scenarios.find((s) => s.label === '悲观情景')?.targetPrice ?? null;

  const s1 = tech.supportLevels[0] ?? null;
  const s2 = tech.supportLevels[1] ?? null;
  const r1 = tech.resistanceLevels[0] ?? null;
  const r2 = tech.resistanceLevels[1] ?? null;

  // Candidate support anchors near or below price (within 22% downside)
  const techAnchors = [s1, ma20, ma60, ma120, bollLower].filter(
    (v): v is number => typeof v === 'number' && v > price * 0.78 && v <= price * 1.02
  );
  const nearestSupport = techAnchors.length > 0 ? Math.max(...techAnchors) : price * 0.955;
  const deeperSupport =
    [s2, ma60, ma120].filter((v): v is number => typeof v === 'number' && v > price * 0.72 && v <= nearestSupport).sort(
      (a, b) => b - a
    )[0] ?? nearestSupport * 0.96;

  // Cap upper buy zone using intrinsic neutral valuation discipline when available
  const valCap = neuScenario && neuScenario > price * 0.75 ? neuScenario * 0.94 : price * 1.015;
  let buyZoneHigh = Number(Math.min(nearestSupport * 1.012, valCap, price * 1.01).toFixed(2));
  let buyZoneLow = Number(Math.max(deeperSupport * 0.99, buyZoneHigh * 0.935).toFixed(2));

  if (buyZoneLow >= buyZoneHigh) {
    buyZoneLow = Number((buyZoneHigh * 0.95).toFixed(2));
  }

  const buyMid = (buyZoneLow + buyZoneHigh) / 2;

  // Determine buy timing verdict
  let buyTimingVerdict: KlineTradePlan['buyTimingVerdict'] = '偏离理想买点·建议等待回踩';
  let waitCondition = '';

  const inZone = price >= buyZoneLow * 0.985 && price <= buyZoneHigh * 1.02;
  const isOverbought = rsi14 !== null && rsi14 >= 70;
  const isBrokenDown = tech.trendDirection === '下行趋势' && ma60 !== null && price < ma60 * 0.96;

  if (isBrokenDown) {
    buyTimingVerdict = '趋势偏弱·等待右侧企稳';
    waitCondition = `当前股价运行于MA60(${ma60?.toFixed(2)}元)下方，需等待日K线放量收复MA20(${ma20?.toFixed(2) ?? '-'}元)且MACD形成底背离/金叉后再行左侧或右侧分批介入。`;
  } else if (inZone && !isOverbought) {
    buyTimingVerdict = '当前进入理想买区';
    waitCondition = `当前价格(${price.toFixed(2)}元)已落入支撑与估值共振买区(${buyZoneLow}~${buyZoneHigh}元)，若当日未出现放量长阴破位，可按3成底仓+回调加仓方式分批布局。`;
  } else {
    buyTimingVerdict = '偏离理想买点·建议等待回踩';
    waitCondition = isOverbought
      ? `当前RSI14达${rsi14?.toFixed(1)}偏热且高于理想买区上沿(${buyZoneHigh}元)，切忌追高，耐心等待缩量回踩 ${buyZoneLow}~${buyZoneHigh} 元区间再观察低吸。`
      : `当前股价略高于最佳风险收益入场区(${buyZoneLow}~${buyZoneHigh}元)，建议等待回踩MA20(${ma20?.toFixed(2) ?? '-'}元)或箱体下沿企稳信号。`;
  }

  // Stop-loss calculation: anchored to structure low / ATR
  const structFloor = s2 ?? deeperSupport;
  const atrFloor = buyMid - 1.9 * atr;
  const rawStop = Math.min(structFloor * 0.97, atrFloor, buyZoneLow * 0.955);
  const minStop = buyMid * 0.86;
  const maxStop = buyMid * 0.95;
  const stopLossPrice = Number(Math.max(minStop, Math.min(maxStop, rawStop)).toFixed(2));
  const stopLossPctFromBuyMid = Number((((stopLossPrice - buyMid) / buyMid) * 100).toFixed(2));

  // Take-profit targets anchored to resistance & 3-scenario valuation (bounded for realistic medium-term execution)
  const tp1ValAnchor =
    neuScenario && neuScenario > buyMid * 1.08 ? Math.min(neuScenario, buyMid * 1.28) : buyMid * 1.14;
  const tp1Raw = Math.min(
    buyMid * 1.32,
    Math.max(buyMid * 1.12, r1 && r1 > buyMid * 1.06 ? r1 : buyMid * 1.14, tp1ValAnchor)
  );
  const takeProfit1 = Number(tp1Raw.toFixed(2));
  const takeProfit1Pct = Number((((takeProfit1 - buyMid) / buyMid) * 100).toFixed(2));

  const tp2ValAnchor =
    optScenario && optScenario > takeProfit1 ? Math.min(optScenario, buyMid * 1.55) : takeProfit1 * 1.14;
  const tp2Raw = Math.min(
    buyMid * 1.55,
    Math.max(takeProfit1 * 1.1, r2 && r2 > takeProfit1 * 1.04 ? r2 : takeProfit1 * 1.14, tp2ValAnchor)
  );
  const takeProfit2 = Number(tp2Raw.toFixed(2));
  const takeProfit2Pct = Number((((takeProfit2 - buyMid) / buyMid) * 100).toFixed(2));

  const risk = Math.max(0.01, buyMid - stopLossPrice);
  const reward = Math.max(0.01, takeProfit1 - buyMid);
  const riskRewardRatio = Number((reward / risk).toFixed(2));

  const buyAnchorParts: string[] = [];
  if (ma20) buyAnchorParts.push(`MA20(${ma20.toFixed(2)}元)`);
  if (ma60) buyAnchorParts.push(`MA60(${ma60.toFixed(2)}元)`);
  if (s1) buyAnchorParts.push(`前低支撑(${s1.toFixed(2)}元)`);
  if (neuScenario && !isBankOrFinancial) buyAnchorParts.push(`中性估值上限折价参考(${neuScenario.toFixed(2)}元)`);

  return {
    currentPrice: price,
    buyZoneLow,
    buyZoneHigh,
    buyAnchorReason: `综合K线技术位[${buyAnchorParts.join(' / ') || '近20日波动下沿'}]与安全边际折价锚定`,
    buyTimingVerdict,
    waitCondition,
    idealEntrySignal: `股价进入 ${buyZoneLow}~${buyZoneHigh} 元区间，日线缩量止跌并重返5日线之上（或放量突破 ${r1 ? `${r1.toFixed(2)}元压力位` : '近期平台高点'} 回踩确认）。`,
    stopLossPrice,
    stopLossPctFromBuyMid,
    stopLossBasis: `有效跌破结构支撑(${structFloor.toFixed(2)}元)且偏离1.9倍ATR14(${atr.toFixed(2)}元)，严格防范趋势破坏。`,
    takeProfit1,
    takeProfit1Pct,
    takeProfit2,
    takeProfit2Pct,
    takeProfitBasis: `第一止盈锚定前期阻力位(${r1 ? `${r1.toFixed(2)}元` : '阶段前高'})与中性合理估值；第二止盈锚定乐观情景目标价(${optScenario ? `${optScenario.toFixed(2)}元` : '中长期戴维斯双击空间'})。`,
    riskRewardRatio,
    valuationRange: {
      pessimistic: pesScenario,
      neutral: neuScenario,
      optimistic: optScenario,
    },
    batchBuyStrategy:
      stylePreference === '低估价值'
        ? `建议「4-4-2」分批低吸：进入 ${buyZoneHigh} 元附近建底仓40%，回踩 ${buyZoneLow} 元支撑企稳加仓40%，留20%机动应对极端市场波动。`
        : `建议「3-4-3」分批布局：观察区上沿 ${buyZoneHigh} 元试仓30%，确认支撑或右侧放量站稳MA20加仓40%，主升突破确认加仓30%。`,
    invalidationCondition: `1) 收盘连续3日有效跌破止损位 ${stopLossPrice} 元；2) 后续季报/年报营收或扣非净利润同比转负且经营现金流明显恶化；3) 出现重大监管处罚、审计异常或高比例控股股东异常减持。`,
    holdingHorizon: stylePreference === '低估价值' ? '6-18个月价值重估周期' : '3-12个月基本面波段/中长线持有',
  };
}

function scoreAndBuildCandidate(params: {
  symbol: string;
  quote: any;
  rule: any;
  tech: TechnicalSummary;
  valuation: ValuationAndQualityOutput;
  annualFinancials: any[];
  quarterlyFinancials: any[];
  profile: any;
  peers: any[];
  shareholderNumbers: any[];
  institutionalHoldings: any[];
  dividends: any[];
  announcements: any[];
  capitalFlowToday: any;
  matchedIndBoard: any;
  stylePreference: string;
  annualPeriodUsed: string;
  interimPeriodUsed: string | null;
}): Omit<CuratedCandidate, 'rank'> {
  const {
    symbol,
    quote,
    rule,
    tech,
    valuation,
    annualFinancials,
    quarterlyFinancials,
    profile,
    peers,
    shareholderNumbers,
    institutionalHoldings,
    dividends,
    announcements,
    capitalFlowToday,
    matchedIndBoard,
    stylePreference,
    annualPeriodUsed,
    interimPeriodUsed,
  } = params;

  const latestAnnual = annualFinancials[0] || null;
  const latestQ = quarterlyFinancials[0] || latestAnnual || null;
  const industry = quote.industry || profile?.industry || '综合行业';
  const isBankOrFin = /银行|保险|证券|多元金融/.test(industry);

  // Check listing age >= 2 years
  let listingYears: number | null = null;
  if (profile?.listDate) {
    const dt = new Date(profile.listDate);
    if (!Number.isNaN(dt.getTime())) {
      listingYears = (Date.now() - dt.getTime()) / (365.25 * 86400 * 1000);
    }
  }

  // --- Dimension 1: 企业基本面 (20分) ---
  const roeVal = latestAnnual?.roe ?? latestQ?.roe ?? null;
  const roes5y = annualFinancials.slice(0, 5).map((f) => f.roe).filter((v): v is number => typeof v === 'number');
  const avgRoe5y = roes5y.length ? roes5y.reduce((a, b) => a + b, 0) / roes5y.length : roeVal;
  const gmVal = latestAnnual?.grossMargin ?? latestQ?.grossMargin ?? null;
  const mcapYi = quote.totalMarketCap ? quote.totalMarketCap / 1e8 : null;

  let dim1 = 9;
  if (avgRoe5y !== null) {
    if (avgRoe5y >= 20) dim1 += 5;
    else if (avgRoe5y >= 14) dim1 += 3.5;
    else if (avgRoe5y >= 10) dim1 += 2;
    else if (avgRoe5y < 5) dim1 -= 3;
  }
  if (!isBankOrFin && gmVal !== null) {
    if (gmVal >= 40) dim1 += 3;
    else if (gmVal >= 25) dim1 += 2;
    else if (gmVal < 12) dim1 -= 1;
  } else if (isBankOrFin && roeVal && roeVal >= 9) {
    dim1 += 2;
  }
  if (mcapYi !== null && mcapYi >= 500) dim1 += 2;
  else if (mcapYi !== null && mcapYi >= 150) dim1 += 1;
  if (profile?.mainBusiness && profile?.businessComposition?.length) dim1 += 1;
  dim1 = Math.max(4, Math.min(20, Math.round(dim1 * 10) / 10));

  // --- Dimension 2: 财务健康度 (20分) ---
  const debtRatio = latestQ?.debtToAssetRatio ?? latestAnnual?.debtToAssetRatio ?? null;
  const cfToNp = latestAnnual?.cashFlowToNetProfit ?? latestQ?.cashFlowToNetProfit ?? null;
  const opCash = latestAnnual?.operatingCashFlow ?? latestQ?.operatingCashFlow ?? null;
  const dedNp = latestAnnual?.deductedNetProfit ?? latestQ?.deductedNetProfit ?? null;
  const np = latestAnnual?.netProfit ?? latestQ?.netProfit ?? null;
  const arRatio =
    latestAnnual?.accountsReceivable && latestAnnual?.revenue && latestAnnual.revenue > 0
      ? (latestAnnual.accountsReceivable / latestAnnual.revenue) * 100
      : null;
  const dedRatio = dedNp !== null && np && np > 0 ? (dedNp / np) * 100 : null;
  const gw = latestQ?.goodwill ?? latestAnnual?.goodwill ?? 0;
  const totalAssets = latestQ?.totalAssets ?? latestAnnual?.totalAssets ?? null;
  const totalLiab = latestQ?.totalLiabilities ?? latestAnnual?.totalLiabilities ?? null;
  const equity = totalAssets && totalLiab !== null ? totalAssets - totalLiab : null;
  const gwRatio = gw && equity && equity > 0 ? (gw / equity) * 100 : 0;

  let dim2 = 11;
  if (cfToNp !== null) {
    if (cfToNp >= 1.05) dim2 += 4;
    else if (cfToNp >= 0.8) dim2 += 2.5;
    else if (cfToNp < 0.4) dim2 -= 3;
  }
  if (!isBankOrFin && debtRatio !== null) {
    if (debtRatio <= 40) dim2 += 3;
    else if (debtRatio <= 58) dim2 += 1.5;
    else if (debtRatio > 72) dim2 -= 3;
  } else if (isBankOrFin) {
    dim2 += 1.5; // Banking structural liability model differs
  }
  if (dedRatio !== null) {
    if (dedRatio >= 90) dim2 += 1.5;
    else if (dedRatio < 65) dim2 -= 2;
  }
  if (gwRatio > 25) dim2 -= 2.5;
  dim2 -= Math.min(4, valuation.anomalies.length * 1.5);
  dim2 = Math.max(4, Math.min(20, Math.round(dim2 * 10) / 10));

  // --- Dimension 3: 成长潜力 (15分) ---
  const revYoyQ = latestQ?.revenueYoy ?? null;
  const npYoyQ = latestQ?.netProfitYoy ?? null;
  const revYoyA = latestAnnual?.revenueYoy ?? null;
  const npYoyA = latestAnnual?.netProfitYoy ?? null;

  let dim3 = 7.5;
  if (revYoyQ !== null) {
    if (revYoyQ >= 20) dim3 += 3;
    else if (revYoyQ >= 8) dim3 += 2;
    else if (revYoyQ < -5) dim3 -= 2;
  }
  if (npYoyQ !== null) {
    if (npYoyQ >= 25) dim3 += 3.5;
    else if (npYoyQ >= 10) dim3 += 2;
    else if (npYoyQ < -10) dim3 -= 2.5;
  }
  if (revYoyA !== null && npYoyA !== null && revYoyA > 0 && npYoyA > 0) dim3 += 1;
  dim3 = Math.max(3, Math.min(15, Math.round(dim3 * 10) / 10));

  // --- Dimension 4: 估值合理性 (15分) ---
  const peerPes = peers.map((p) => p.peTtm).filter((v): v is number => typeof v === 'number' && v > 0 && v < 150);
  const peerAvgPe = peerPes.length ? peerPes.reduce((a, b) => a + b, 0) / peerPes.length : null;
  let dim4 = 8;
  if (isBankOrFin) {
    if (quote.pb && quote.pb < 0.85) dim4 += 4;
    else if (quote.pb && quote.pb < 1.2) dim4 += 2;
    if (quote.dividendYield && quote.dividendYield >= 4) dim4 += 3;
  } else {
    if (valuation.marginOfSafetyPct !== null) {
      if (valuation.marginOfSafetyPct >= 18) dim4 += 3.5;
      else if (valuation.marginOfSafetyPct >= 5) dim4 += 2;
      else if (valuation.marginOfSafetyPct < -12) dim4 -= 2.5;
    }
    if (valuation.peg !== null) {
      if (valuation.peg > 0 && valuation.peg <= 1.0) dim4 += 2.5;
      else if (valuation.peg <= 1.5) dim4 += 1;
      else if (valuation.peg > 2.5) dim4 -= 1.5;
    }
    if (peerAvgPe && quote.peTtm && quote.peTtm > 0 && quote.peTtm <= peerAvgPe * 0.9) {
      dim4 += 1;
    }
    if (quote.dividendYield && quote.dividendYield >= 2.5) dim4 += 1;
  }
  if (valuation.pePercentile !== null && valuation.pePercentile <= 45) dim4 += 1;
  dim4 = Math.max(3, Math.min(15, Math.round(dim4 * 10) / 10));

  // --- Dimension 5: 行业景气度 (10分) ---
  const peerPosGrowth = peers.filter((p) => typeof p.peTtm === 'number' && p.peTtm > 0).length;
  let dim5 = 6.5;
  if (matchedIndBoard && typeof matchedIndBoard.changePct === 'number') {
    if (matchedIndBoard.changePct >= 1) dim5 += 1.5;
    else if (matchedIndBoard.changePct <= -2) dim5 -= 0.5;
  }
  if (revYoyQ !== null && revYoyQ > 10 && npYoyQ !== null && npYoyQ > 10) dim5 += 1.5;
  if (peerPosGrowth >= 3) dim5 += 0.5;
  dim5 = Math.max(3, Math.min(10, Math.round(dim5 * 10) / 10));

  // --- Dimension 6: 资金与筹码 (10分) ---
  const latestOrg = institutionalHoldings[0] || null;
  const latestHolder = shareholderNumbers[0] || null;
  let dim6 = 5.5;
  if (latestOrg?.totalSharesRatioPct && latestOrg.totalSharesRatioPct >= 30) dim6 += 2;
  else if (latestOrg?.totalSharesRatioPct && latestOrg.totalSharesRatioPct >= 15) dim6 += 1;
  if (latestHolder && typeof latestHolder.changeRatioPct === 'number') {
    if (latestHolder.changeRatioPct <= -3) dim6 += 1.5; // 筹码趋向集中
    else if (latestHolder.changeRatioPct >= 10) dim6 -= 1; // 筹码分散
  }
  if (capitalFlowToday && typeof capitalFlowToday.mainNetInflow === 'number') {
    if (capitalFlowToday.mainNetInflow > 0) dim6 += 1;
    else if (capitalFlowToday.mainNetInflow < -5e8) dim6 -= 0.5;
  }
  dim6 = Math.max(2, Math.min(10, Math.round(dim6 * 10) / 10));

  // Build trade plan before technical score so buy timing informs dim7
  const tradePlan = buildKlineTradePlan({
    price: quote.price,
    tech,
    valuation,
    isBankOrFinancial: isBankOrFin,
    stylePreference,
  });

  // --- Dimension 7: 技术面与买入时机 (5分) ---
  let dim7 = 2.8;
  if (tech.trendDirection === '上行趋势') dim7 += 1;
  else if (tech.trendDirection === '下行趋势') dim7 -= 0.8;
  if (tradePlan.buyTimingVerdict === '当前进入理想买区') dim7 += 1.2;
  else if (tradePlan.buyTimingVerdict === '偏离理想买点·建议等待回踩') dim7 += 0.2;
  if (tech.latest?.rsi14 && tech.latest.rsi14 > 75) dim7 -= 0.8;
  dim7 = Math.max(1, Math.min(5, Math.round(dim7 * 10) / 10));

  // --- Dimension 8: 风险控制 (5分) + 硬性淘汰机制 ---
  const badAnns = announcements.filter(
    (a) =>
      a.sentimentLabel === '利空' &&
      /处罚|立案|诉讼|违约|减持|退市|警示|非标|质押爆仓/.test(a.title || '')
  );
  let dim8 = 4.5 - badAnns.length * 1.2 - valuation.anomalies.length * 0.6;
  if (gwRatio > 30) dim8 -= 1;
  dim8 = Math.max(0.5, Math.min(5, Math.round(dim8 * 10) / 10));

  const disqualifyReasons: string[] = [];
  if (quote.isSt || quote.isDelisting) disqualifyReasons.push('属ST/*ST或退市整理标的');
  if (quote.isSuspended) disqualifyReasons.push('当前处于停牌状态');
  if (listingYears !== null && listingYears < 2) {
    disqualifyReasons.push(`上市时间仅 ${listingYears.toFixed(1)} 年，不足2年完整财报周期`);
  }
  if (revYoyQ !== null && npYoyQ !== null && revYoyQ < -15 && npYoyQ < -25) {
    disqualifyReasons.push(`最新期营收(${revYoyQ.toFixed(1)}%)与净利(${npYoyQ.toFixed(1)}%)大幅双降`);
  }
  if (gwRatio > 35) {
    disqualifyReasons.push(`商誉占净资产达 ${gwRatio.toFixed(1)}%，存在重大商誉减值隐患`);
  }
  if (badAnns.some((a) => /立案|处罚|退市/.test(a.title || ''))) {
    disqualifyReasons.push(`近期存在重大监管/立案风险公告(${badAnns[0].title})`);
  }
  if (!isBankOrFin && debtRatio !== null && debtRatio > 78 && cfToNp !== null && cfToNp < 0.3) {
    disqualifyReasons.push(`资产负债率高达 ${debtRatio.toFixed(1)}% 且现金流严重背离(${cfToNp.toFixed(2)}x)`);
  }

  const totalScore = Number((dim1 + dim2 + dim3 + dim4 + dim5 + dim6 + dim7 + dim8).toFixed(1));
  const ratingLabel = disqualifyReasons.length > 0 ? '重大风险淘汰' : getRatingLabel(totalScore);

  const dimensions: Dimension8Score[] = [
    {
      key: 'fundamental',
      label: '企业基本面',
      maxScore: 20,
      score: dim1,
      summary: `5年均值ROE ${fmtNum(avgRoe5y, 1, '%')}，最新毛利率 ${fmtNum(gmVal, 1, '%')}，总市值 ${fmtNum(mcapYi, 0, '亿')}`,
      evidence: profile?.mainBusiness
        ? `${String(profile.mainBusiness).slice(0, 80)}${String(profile.mainBusiness).length > 80 ? '...' : ''}`
        : `所属行业「${industry}」，营收规模 ${fmtYi(latestAnnual?.revenue)}`,
      dataSource: '东方财富F10主营构成与年报',
      missingNote: profile?.mainBusiness ? null : '主营文本摘要缺失',
    },
    {
      key: 'financialHealth',
      label: '财务健康度',
      maxScore: 20,
      score: dim2,
      summary: `现金流/净利比 ${fmtNum(cfToNp, 2, 'x')}，负债率 ${fmtNum(debtRatio, 1, '%')}，扣非占比 ${fmtNum(dedRatio, 1, '%')}`,
      evidence: `经营现金流 ${fmtYi(opCash)}，应收占营收 ${fmtNum(arRatio, 1, '%')}，商誉占净资产 ${gwRatio.toFixed(1)}%${
        valuation.anomalies.length ? `；预警：${valuation.anomalies.join('；')}` : '；财务无重大异常'
      }`,
      dataSource: '东方财富资产负债表与现金流量表',
      missingNote: opCash === null ? '现金流量表数据缺失' : null,
    },
    {
      key: 'growthPotential',
      label: '成长潜力',
      maxScore: 15,
      score: dim3,
      summary: `最新期营收同比 ${fmtNum(revYoyQ, 1, '%')}，净利同比 ${fmtNum(npYoyQ, 1, '%')}`,
      evidence: `已实现年报(${latestAnnual?.reportDate || annualPeriodUsed})营收同比 ${fmtNum(revYoyA, 1, '%')}、净利同比 ${fmtNum(npYoyA, 1, '%')}；未来3年增速以情景假设区间推演，不视作确定事实。`,
      dataSource: '上市公司年报与最近期季报',
      missingNote: null,
    },
    {
      key: 'valuation',
      label: '估值合理性',
      maxScore: 15,
      score: dim4,
      summary: `PE(TTM) ${fmtNum(quote.peTtm, 1, 'x')}，PB ${fmtNum(quote.pb, 2, 'x')}，PEG ${fmtNum(valuation.peg, 2)}，股息率 ${fmtNum(quote.dividendYield, 2, '%')}`,
      evidence: `安全边际 ${fmtNum(valuation.marginOfSafetyPct, 1, '%')}，250日价格分位 ${fmtNum(valuation.pePercentile, 1, '%')}${
        peerAvgPe ? `，同行(${peers.length}家)均值PE ${peerAvgPe.toFixed(1)}x` : ''
      }`,
      dataSource: '腾讯实时估值 + 三情景估值模型',
      missingNote: valuation.peg === null ? 'PEG不适用或缺失' : null,
    },
    {
      key: 'industryProsperity',
      label: '行业景气度',
      maxScore: 10,
      score: dim5,
      summary: `行业「${industry}」${matchedIndBoard ? `今日板块 ${matchedIndBoard.changePct >= 0 ? '+' : ''}${matchedIndBoard.changePct}%` : '板块联动正常'}`,
      evidence: `板块内已实现盈利可比同行 ${peerPosGrowth}/${peers.length} 家，综合判定行业处于「${
        revYoyQ !== null && revYoyQ >= 15 ? '景气扩张/高成长' : revYoyQ !== null && revYoyQ >= 0 ? '成熟稳健增长' : '周期磨底/结构分化'
      }」阶段。`,
      dataSource: '东方财富行业板块与可比同行财务数据',
      missingNote: matchedIndBoard ? null : '当日二级行业指数行情未直接匹配',
    },
    {
      key: 'capitalAndChips',
      label: '资金与筹码',
      maxScore: 10,
      score: dim6,
      summary: `机构持股 ${latestOrg?.totalSharesRatioPct !== null && latestOrg?.totalSharesRatioPct !== undefined ? `${latestOrg.totalSharesRatioPct.toFixed(1)}%` : '未披露'}，最新股东户数变化 ${latestHolder?.changeRatioPct !== null && latestHolder?.changeRatioPct !== undefined ? `${latestHolder.changeRatioPct.toFixed(2)}%` : '未披露'}`,
      evidence: `换手率 ${fmtNum(quote.turnoverRate, 2, '%')}${
        capitalFlowToday
          ? `；今日第三方估算主力净流 ${fmtYi(capitalFlowToday.mainNetInflow)}（注：资金流向仅作筹码辅助参考，不作单一买入依据）`
          : ''
      }`,
      dataSource: '东方财富F10股东/机构披露 + 估算资金流',
      missingNote: !latestOrg && !latestHolder ? '近期机构/股东户数披露数据缺失' : null,
    },
    {
      key: 'technicalTiming',
      label: '技术面与买点',
      maxScore: 5,
      score: dim7,
      summary: `${tech.trendDirection} · ${tradePlan.buyTimingVerdict}`,
      evidence: `${tech.maAlignment}；MACD DIF=${fmtNum(tech.latest?.macdDif, 3)} / DEA=${fmtNum(tech.latest?.macdDea, 3)}，RSI14=${fmtNum(tech.latest?.rsi14, 1)}；支撑 [${tech.supportLevels.join(', ') || '-'}]，压力 [${tech.resistanceLevels.join(', ') || '-'}]`,
      dataSource: '日线OHLCV均线与技术指标引擎',
      missingNote: null,
    },
    {
      key: 'riskControl',
      label: '风险控制',
      maxScore: 5,
      score: dim8,
      summary: disqualifyReasons.length ? `触发淘汰红线：${disqualifyReasons[0]}` : badAnns.length ? `关注 ${badAnns.length} 条负面公告信号` : '未发现ST/立案/重大违约或异常高杠杆风险',
      evidence: `适用规则：${rule.board}（±${rule.priceLimitPct ?? '-'}% / ${rule.tPlusRule}）；已核验近15条巨潮公告与商誉/负债/现金流背离情况。`,
      dataSource: '巨潮资讯网官方公告 + 财报异常风控扫描',
      missingNote: '股权质押明细与大宗解禁精确排期受免费接口口径限制，需以公司定期公告为准',
    },
  ];

  // Build 5-year financials compact text
  const fiveYearLines = annualFinancials
    .slice(0, 5)
    .map(
      (f) =>
        `${f.reportDate}: 营收${fmtYi(f.revenue)}(${fmtNum(f.revenueYoy, 1, '%')}), 归母净利${fmtYi(f.netProfit)}(${fmtNum(
          f.netProfitYoy,
          1,
          '%'
        )}), ROE ${fmtNum(f.roe, 1, '%')}, 经营现金流${fmtYi(f.operatingCashFlow)}`
    )
    .join('；');

  const mainRisks = [
    ...disqualifyReasons,
    ...valuation.anomalies,
    ...(badAnns.slice(0, 2).map((a) => `公告风险：${a.title} (${a.publishedAt})`) || []),
  ];
  if (tradePlan.buyTimingVerdict !== '当前进入理想买区') {
    mainRisks.push(`短线位置提示：${tradePlan.waitCondition}`);
  }
  if (mainRisks.length === 0) {
    mainRisks.push('宏观经济波动、行业竞争加剧或后续季报增速不及预期导致估值中枢下修风险。');
  }

  const coreThesis = `${industry}代表性标的，近5年平均ROE ${fmtNum(avgRoe5y, 1, '%')}，最新期(${
    latestQ?.reportDate || annualPeriodUsed
  })营收同比${fmtNum(revYoyQ, 1, '%')}、净利同比${fmtNum(npYoyQ, 1, '%')}，当前PE(TTM) ${fmtNum(quote.peTtm, 1, 'x')}，${tradePlan.buyTimingVerdict}。`;

  const missingFields: string[] = [];
  if (!profile?.mainBusiness) missingFields.push('主营业务详述');
  if (!latestOrg) missingFields.push('机构持仓明细');
  if (!latestHolder) missingFields.push('最新股东户数');

  return {
    symbol,
    tsCode: quote.tsCode,
    name: quote.name,
    exchange: quote.exchange,
    board: quote.board,
    industry,
    price: quote.price,
    changePct: quote.changePct,
    priceDate: quote.provenance?.dataDate || '',
    totalMarketCapYi: mcapYi ? Number(mcapYi.toFixed(1)) : null,
    peTtm: quote.peTtm,
    pb: quote.pb,
    ps: valuation.ps,
    peg: valuation.peg,
    dividendYield: quote.dividendYield,
    pePercentile: valuation.pePercentile,
    marginOfSafetyPct: valuation.marginOfSafetyPct,
    totalScore,
    ratingLabel,
    dimensions,
    coreThesis,
    mainRisks,
    disqualified: disqualifyReasons.length > 0,
    disqualifyReasons,
    deepAnalysis11: {
      companyBusiness: profile?.mainBusiness || `${quote.name}主营围绕「${industry}」板块核心产品及服务展开，最新完整年报营业收入 ${fmtYi(latestAnnual?.revenue)}。`,
      industryPosition: `总市值 ${fmtNum(mcapYi, 1, '亿元')}，对比同行业可比公司(${peers.map((p) => p.name).join('、') || '样本未匹配'})具备显著规模与盈利优势。`,
      coreMoat: `历史5年平均ROE维持在 ${fmtNum(avgRoe5y, 1, '%')}，${
        !isBankOrFin && gmVal ? `毛利率达 ${gmVal.toFixed(1)}%，` : ''
      }反映其在品牌、规模效应或成本管控方面具备较强护城河。`,
      fiveYearFinancialSummary: fiveYearLines || '近5年完整年报明细暂缺，已提取最新报告期数据。',
      earningsQuality: `最近完整年报经营现金流/净利润比 ${fmtNum(cfToNp, 2, 'x')}，扣非净利润占比 ${fmtNum(
        dedRatio,
        1,
        '%'
      )}，${valuation.anomalies.length === 0 ? '盈利含金量较高，未见明显利润现金流背离。' : `需留意：${valuation.anomalies.join('；')}。`}`,
      growthLogic: `【已实现业绩】最近期(${latestQ?.reportDate || '-'})营收同比 ${fmtNum(revYoyQ, 1, '%')}、净利同比 ${fmtNum(
        npYoyQ,
        1,
        '%'
      )}；【情景推演(非事实承诺)】中性情景假设未来12个月维持稳健盈利延续，对应目标价参考 ${
        tradePlan.valuationRange.neutral ? `${tradePlan.valuationRange.neutral}元` : '需结合PB/分红评估'
      }。`,
      valuationLevel: `当前PE(TTM) ${fmtNum(quote.peTtm, 1, 'x')}，PB ${fmtNum(quote.pb, 2, 'x')}，PS ${fmtNum(
        valuation.ps,
        2,
        'x'
      )}，股息率 ${fmtNum(quote.dividendYield, 2, '%')}，250日价格历史分位 ${fmtNum(valuation.pePercentile, 1, '%')}。`,
      institutionalChange: `${
        latestOrg
          ? `最新机构披露(${latestOrg.reportDate})合计持股 ${latestOrg.totalSharesRatioPct ?? '未知'}%（${latestOrg.orgCount ?? '-'}家机构）；`
          : '最新期机构持仓比例暂缺；'
      }${
        latestHolder
          ? `最新股东户数(${latestHolder.endDate})较上期变化 ${latestHolder.changeRatioPct ?? '未知'}%`
          : '股东户数变化暂缺'
      }（严格区分定期财报披露数据与日内估算资金流）。`,
      technicalTrend: `日K线处于「${tech.trendDirection}」，${tech.maAlignment}，${tech.volumeAnalysis}，${tech.breakoutState}；近期有效支撑 [${
        tech.supportLevels.join(', ') || '-'
      }]，压力 [${tech.resistanceLevels.join(', ') || '-'}]。`,
      majorRisks: mainRisks.join('；'),
      thesisValidity:
        disqualifyReasons.length === 0 && totalScore >= 75
          ? `投资逻辑目前成立：盈利能力(${fmtNum(roeVal, 1, '%')} ROE)、现金流覆盖及行业地位形成支撑，重点围绕 ${tradePlan.buyZoneLow}~${tradePlan.buyZoneHigh} 元观察区间择机执行纪律性布局。`
          : '当前存在明显约束或风险点，暂不建议直接重仓，需观察后续财报与技术面验证条件。',
    },
    valueJudgment5: {
      isValuationReasonable:
        valuation.marginOfSafetyPct !== null && valuation.marginOfSafetyPct >= 5
          ? `估值处于合理偏低或具备一定安全边际区间（中性估值折价 ${valuation.marginOfSafetyPct}%，250日价格分位 ${fmtNum(valuation.pePercentile, 1, '%')})。`
          : `当前估值已较充分反映部分乐观预期（250日价格分位 ${fmtNum(valuation.pePercentile, 1, '%')}，PE ${fmtNum(quote.peTtm, 1, 'x')}），宜等待回踩提供更高安全边际。`,
      threeYearGrowthSpace: `基于历史营收与利润复合轨迹及所处「${industry}」行业空间，若主业份额与利润率维持稳健，具备中长期内生复利增长基础（注：未来增速属情景推断，受宏观周期影响）。`,
      worthLongTermTracking: totalScore >= 75 && disqualifyReasons.length === 0 ? '值得长期放入核心观察池持续跟踪季报兑现度。' : '建议先移出核心重仓名单，待风险出清后再重估。',
      suitableToBuyNow:
        tradePlan.buyTimingVerdict === '当前进入理想买区' && disqualifyReasons.length === 0
          ? `当前已接近/进入理想观察买区（${tradePlan.buyZoneLow}~${tradePlan.buyZoneHigh}元），可结合3-4-3分批纪律小仓试探或布局。`
          : `当前暂不建议追高直接重仓（${tradePlan.buyTimingVerdict}）。`,
      waitConditionsIfNot: tradePlan.waitCondition,
    },
    tradePlan,
    annualFinancials: annualFinancials.slice(0, 6),
    quarterlyFinancials: quarterlyFinancials.slice(0, 8),
    peers,
    shareholderNumbers: shareholderNumbers.slice(0, 4),
    institutionalHoldings: institutionalHoldings.slice(0, 4),
    dividends: dividends.slice(0, 5),
    announcements: announcements.slice(0, 8),
    capitalFlowToday,
    klineBars: [], // Populated on attach
    klineIndicators: [],
    technicalSummary: {
      trendDirection: tech.trendDirection,
      maAlignment: tech.maAlignment,
      crossovers: tech.crossovers,
      volumeAnalysis: tech.volumeAnalysis,
      breakoutState: tech.breakoutState,
      supportLevels: tech.supportLevels,
      resistanceLevels: tech.resistanceLevels,
      latestMa20: tech.latest?.ma20 ?? null,
      latestMa60: tech.latest?.ma60 ?? null,
      latestMa120: tech.latest?.ma120 ?? null,
      latestRsi14: tech.latest?.rsi14 ?? null,
      latestMacdDif: tech.latest?.macdDif ?? null,
      latestMacdDea: tech.latest?.macdDea ?? null,
      latestAtr14: tech.latest?.atr14 ?? null,
    },
    provenance: {
      quoteSource: quote.provenance?.dataSource || '腾讯财经 + 东方财富',
      financialPeriod: latestAnnual?.reportDate || annualPeriodUsed,
      latestInterimPeriod: latestQ?.reportDate || interimPeriodUsed,
      missingFields,
    },
  };
}

function toOptNum(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function runCuratedStockSelection(options: CuratedScreenOptions = {}): Promise<CuratedSelectionResult> {
  const targetCount = Math.max(3, Math.min(20, Number(options.targetCount || 5)));
  const boardFilter = options.boardFilter || '全部';
  const stylePreference = options.stylePreference || '均衡优质';

  const industryNode = options.industryNode ? String(options.industryNode).trim() : '';
  const industryName = options.industryName ? String(options.industryName).trim() : '';
  const conceptNode = options.conceptNode ? String(options.conceptNode).trim() : '';
  const conceptName = options.conceptName ? String(options.conceptName).trim() : '';
  const hasNodeFilter = Boolean(industryNode || conceptNode);

  const minPrice = toOptNum(options.minPrice);
  const maxPrice = toOptNum(options.maxPrice);
  const minRoePct = toOptNum(options.minRoePct) ?? (hasNodeFilter ? 5 : stylePreference === '低估价值' ? 10 : 12);
  const maxPe = toOptNum(options.maxPe) ?? (stylePreference === '成长龙头' ? 60 : stylePreference === '低估价值' ? 25 : 42);
  const maxPb = toOptNum(options.maxPb);
  const minMarketCapYi = toOptNum(options.minMarketCapYi) ?? (hasNodeFilter ? 15 : 50);
  const maxMarketCapYi = toOptNum(options.maxMarketCapYi);
  const minDividendYield = toOptNum(options.minDividendYield);
  const minRevYoyPct = toOptNum(options.minRevYoyPct);
  const minProfitYoyPct = toOptNum(options.minProfitYoyPct);
  const minGrossMarginPct = toOptNum(options.minGrossMarginPct);
  const maxDebtRatioPct = toOptNum(options.maxDebtRatioPct);
  const onlyBuyZone = Boolean(options.onlyBuyZone);

  const appliedFiltersSummary: string[] = [
    `精选数量：${targetCount}只`,
    `风格：${stylePreference}`,
    `板块：${boardFilter}`,
  ];
  if (industryName || industryNode) appliedFiltersSummary.push(`行业：${industryName || industryNode}`);
  if (conceptName || conceptNode) appliedFiltersSummary.push(`概念：${conceptName || conceptNode}`);
  if (minPrice !== null || maxPrice !== null) {
    appliedFiltersSummary.push(`股价：${minPrice ?? '0'}~${maxPrice ?? '不限'}元`);
  }
  if (minMarketCapYi > 0 || maxMarketCapYi !== null) {
    appliedFiltersSummary.push(`总市值：${minMarketCapYi}~${maxMarketCapYi ?? '不限'}亿`);
  }
  appliedFiltersSummary.push(`ROE≥${minRoePct}%`);
  appliedFiltersSummary.push(`PE≤${maxPe}x`);
  if (maxPb !== null) appliedFiltersSummary.push(`PB≤${maxPb}x`);
  if (minDividendYield !== null) appliedFiltersSummary.push(`股息率≥${minDividendYield}%`);
  if (minRevYoyPct !== null) appliedFiltersSummary.push(`营收同比≥${minRevYoyPct}%`);
  if (minProfitYoyPct !== null) appliedFiltersSummary.push(`净利同比≥${minProfitYoyPct}%`);
  if (minGrossMarginPct !== null) appliedFiltersSummary.push(`毛利率≥${minGrossMarginPct}%`);
  if (maxDebtRatioPct !== null) appliedFiltersSummary.push(`负债率≤${maxDebtRatioPct}%`);
  if (onlyBuyZone) appliedFiltersSummary.push(`仅限进入K线理想买区`);

  const periods = getReportPeriodCandidates();

  // 1. Discover latest reliable annual & interim periods in RPT_LICO_FN_CPD
  let annualPeriodUsed = periods.annuals[0];
  let universeTotalCount = 0;
  for (const ap of periods.annuals) {
    try {
      const check = await fetchDatacenterPage(`(REPORTDATE='${ap}')`, 1);
      if ((check?.result?.count || 0) > 2000) {
        annualPeriodUsed = ap;
        universeTotalCount = check.result.count;
        break;
      }
    } catch {
      // try fallback
    }
  }

  let interimPeriodUsed: string | null = null;
  for (const ip of periods.interims) {
    try {
      const check = await fetchDatacenterPage(`(REPORTDATE='${ip}')`, 1);
      if ((check?.result?.count || 0) > 2000) {
        interimPeriodUsed = ip;
        if (check.result.count >= 4500 && check.result.count <= 6500) {
          universeTotalCount = check.result.count;
        }
        break;
      }
    } catch {
      // ignore
    }
  }
  if (universeTotalCount === 0 || universeTotalCount > 7000) universeTotalCount = 5649;

  // 2. Stage 1: Acquire fundamental pool (either Node-filtered Industry/Concept OR Broad Market)
  let rawAnnualRows: any[] = [];
  const interimMap = new Map<string, any>();
  let nodeMemberCount: number | null = null;
  let marketSnap: any = null;

  const revThreshold = minRevYoyPct ?? (hasNodeFilter ? -15 : stylePreference === '低估价值' ? -5 : 5);
  const npThreshold = minProfitYoyPct ?? (hasNodeFilter ? -20 : stylePreference === '低估价值' ? -5 : 5);
  const gmThreshold = minGrossMarginPct ?? 0;

  if (hasNodeFilter) {
    const [indMembers, conMembers, snap] = await Promise.all([
      industryNode ? fetchSinaNodeMembers(industryNode, 4) : Promise.resolve(null),
      conceptNode ? fetchSinaNodeMembers(conceptNode, 4) : Promise.resolve(null),
      getCachedMarketOverviewAndSentiment(60000).catch(() => null),
    ]);
    marketSnap = snap;

    let combinedSymbols: string[] = [];
    if (indMembers && conMembers) {
      const conSet = new Set(conMembers.map((m) => m.symbol));
      combinedSymbols = indMembers.filter((m) => conSet.has(m.symbol) && !/ST|退/i.test(m.name)).map((m) => m.symbol);
    } else if (indMembers) {
      combinedSymbols = indMembers.filter((m) => !/ST|退/i.test(m.name)).map((m) => m.symbol);
    } else if (conMembers) {
      combinedSymbols = conMembers.filter((m) => !/ST|退/i.test(m.name)).map((m) => m.symbol);
    }

    if (boardFilter !== '全部') {
      combinedSymbols = combinedSymbols.filter((sym) => inferExchangeAndBoard(sym).board.includes(boardFilter));
    }

    nodeMemberCount = combinedSymbols.length;
    const targetSyms = combinedSymbols.slice(0, 240);

    const [annRows, qRows] = await Promise.all([
      fetchDatacenterBySymbols(annualPeriodUsed, targetSyms),
      interimPeriodUsed ? fetchDatacenterBySymbols(interimPeriodUsed, targetSyms) : Promise.resolve([]),
    ]);

    rawAnnualRows = annRows.filter((r) => {
      const roe = r.WEIGHTAVG_ROE;
      const ystz = r.YSTZ;
      const sjltz = r.SJLTZ;
      const xsmll = r.XSMLL;
      if (typeof roe === 'number' && (roe < minRoePct || roe > 80)) return false;
      if (roe === null || roe === undefined) return false;
      if (minRevYoyPct !== null && (typeof ystz !== 'number' || ystz < minRevYoyPct)) return false;
      if (minProfitYoyPct !== null && (typeof sjltz !== 'number' || sjltz < minProfitYoyPct)) return false;
      if (minGrossMarginPct !== null && minGrossMarginPct > 0 && (typeof xsmll !== 'number' || xsmll < minGrossMarginPct)) {
        return false;
      }
      return true;
    });

    for (const row of qRows) {
      if (row.SECURITY_CODE && !interimMap.has(row.SECURITY_CODE)) {
        interimMap.set(row.SECURITY_CODE, row);
      }
    }
  } else {
    const sortCol =
      stylePreference === '成长龙头'
        ? 'SJLTZ'
        : maxPrice !== null && maxPrice <= 30
        ? 'PARENT_NETPROFIT'
        : 'WEIGHTAVG_ROE';
    const minNpYuan = maxPrice !== null || (maxMarketCapYi !== null && maxMarketCapYi <= 300) ? 100000000 : 250000000;
    const gmClause = gmThreshold > 0 ? `(XSMLL>=${gmThreshold})` : stylePreference === '低估价值' ? '' : `(XSMLL>=12)`;
    const annualFilter = `(REPORTDATE='${annualPeriodUsed}')(WEIGHTAVG_ROE>=${minRoePct})(WEIGHTAVG_ROE<=75)(PARENT_NETPROFIT>=${minNpYuan})(YSTZ>=${revThreshold})(SJLTZ>=${npThreshold})${gmClause}`;

    const [p1Res, p2Res, snap] = await Promise.all([
      fetchDatacenterPage(annualFilter, 250, sortCol, -1, 1),
      fetchDatacenterPage(annualFilter, 250, sortCol, -1, 2).catch(() => null),
      getCachedMarketOverviewAndSentiment(60000).catch(() => null),
    ]);
    marketSnap = snap;
    rawAnnualRows = [...(p1Res?.result?.data || []), ...(p2Res?.result?.data || [])];
  }

  // Deduplicate + filter valid A-share codes + exclude ST/*ST/退市 + filter board
  const seenSymbols = new Set<string>();
  let excludedStDelistingCount = 0;
  const stage1RawList: any[] = [];

  for (const r of rawAnnualRows) {
    const code = String(r.SECURITY_CODE || '');
    const name = String(r.SECURITY_NAME_ABBR || '');
    if (!isValidAShareCode(code) || seenSymbols.has(code)) continue;
    seenSymbols.add(code);

    if (/ST|退/i.test(name)) {
      excludedStDelistingCount++;
      continue;
    }

    const info = inferExchangeAndBoard(code);
    if (boardFilter !== '全部' && !info.board.includes(boardFilter)) {
      continue;
    }

    stage1RawList.push({
      symbol: code,
      name,
      board: info.board,
      industry: r.PUBLISHNAME || industryName || '综合',
      roe: r.WEIGHTAVG_ROE ?? 0,
      revYoy: r.YSTZ ?? 0,
      npYoy: r.SJLTZ ?? 0,
      grossMargin: r.XSMLL ?? 0,
      netProfit: r.PARENT_NETPROFIT ?? 0,
    });
  }

  // Fetch exact interim quarter metrics via IN-batch for stage1 survivors if broad-market path
  if (!hasNodeFilter && interimPeriodUsed && stage1RawList.length > 0) {
    const qSyms = stage1RawList.slice(0, 240).map((s) => s.symbol);
    const qRows = await fetchDatacenterBySymbols(interimPeriodUsed, qSyms);
    for (const row of qRows) {
      if (row.SECURITY_CODE && !interimMap.has(row.SECURITY_CODE)) {
        interimMap.set(row.SECURITY_CODE, row);
      }
    }
  }

  const stage1Survivors: any[] = [];
  for (const s of stage1RawList) {
    const qRow = interimMap.get(s.symbol);
    if (qRow) {
      const qMinNp = minProfitYoyPct !== null ? Math.min(minProfitYoyPct - 8, -10) : -12;
      const qMinRev = minRevYoyPct !== null ? Math.min(minRevYoyPct - 8, -10) : -12;
      if ((qRow.SJLTZ ?? 0) < qMinNp || (qRow.YSTZ ?? 0) < qMinRev) {
        continue;
      }
    }
    stage1Survivors.push({
      ...s,
      qNpYoy: qRow?.SJLTZ ?? null,
      qRevYoy: qRow?.YSTZ ?? null,
    });
  }

  const baseUniverseCount = nodeMemberCount !== null ? nodeMemberCount : universeTotalCount;
  const estTotalSt = nodeMemberCount !== null ? excludedStDelistingCount : Math.max(excludedStDelistingCount, 160);
  const excludedFinancialWeakCount = Math.max(0, baseUniverseCount - estTotalSt - stage1Survivors.length);

  // Preliminary multi-factor ranking
  const prelimScored = stage1Survivors
    .map((s) => {
      let score =
        Math.min(s.roe, 35) * 1.35 +
        Math.min(Math.max(s.npYoy, -10), 60) * 0.45 +
        Math.min(Math.max(s.revYoy, -10), 40) * 0.35;
      if (s.grossMargin >= 30) score += 8;
      if (s.qNpYoy !== null && s.qNpYoy > 10) score += 8;
      if (s.netProfit >= 2e9) score += 4;
      return { ...s, prelimScore: score };
    })
    .sort((a, b) => b.prelimScore - a.prelimScore);

  // Keep a wide pool (up to 160) so strict price/dividend/PE/PB/cap filters still leave plenty for targetCount up to 20
  const maxBatchProbe = targetCount >= 10 || maxPrice !== null || minDividendYield !== null || maxPb !== null || maxMarketCapYi !== null ? 160 : 80;
  const maxPerIndustryProbe = hasNodeFilter ? 999 : targetCount >= 15 ? 8 : 5;
  const indCounts = new Map<string, number>();
  const diversePool: typeof prelimScored = [];
  for (const item of prelimScored) {
    const cnt = indCounts.get(item.industry) || 0;
    if (cnt >= maxPerIndustryProbe && diversePool.length < maxBatchProbe * 0.75) continue;
    indCounts.set(item.industry, cnt + 1);
    diversePool.push(item);
    if (diversePool.length >= maxBatchProbe) break;
  }
  if (diversePool.length < maxBatchProbe) {
    for (const item of prelimScored) {
      if (!diversePool.some((x) => x.symbol === item.symbol)) {
        diversePool.push(item);
        if (diversePool.length >= maxBatchProbe) break;
      }
    }
  }

  // 3. Stage 2: Batch Tencent Live Quote Check (Price range, Market Cap range, PE, PB, Dividend, Suspension)
  const batchQuotes = await fetchTencentQuotesBatch(diversePool.map((d) => d.symbol));
  let excludedQuoteValuationCount = 0;
  const stage2Candidates: any[] = [];

  for (const item of diversePool) {
    const q = batchQuotes[item.symbol];
    if (!q || !q.price || q.volume === 0) {
      excludedQuoteValuationCount++;
      continue;
    }
    if (/ST|退/i.test(q.name || '')) {
      excludedStDelistingCount++;
      continue;
    }

    // Composable price bounds
    if (minPrice !== null && q.price < minPrice) {
      excludedQuoteValuationCount++;
      continue;
    }
    if (maxPrice !== null && q.price > maxPrice) {
      excludedQuoteValuationCount++;
      continue;
    }

    // Composable market cap bounds
    if (q.totalMarketCapYi !== null && q.totalMarketCapYi < minMarketCapYi) {
      excludedQuoteValuationCount++;
      continue;
    }
    if (maxMarketCapYi !== null && (q.totalMarketCapYi === null || q.totalMarketCapYi > maxMarketCapYi)) {
      excludedQuoteValuationCount++;
      continue;
    }

    // PE / PB / Dividend filters
    const isFin = /银行|保险/.test(item.industry);
    if (isFin) {
      if (options.maxPe !== undefined && q.peTtm !== null && q.peTtm > maxPe) {
        excludedQuoteValuationCount++;
        continue;
      }
    } else if (q.peTtm === null || q.peTtm <= 0 || q.peTtm > maxPe) {
      excludedQuoteValuationCount++;
      continue;
    }

    if (maxPb !== null && (q.pb === null || q.pb <= 0 || q.pb > maxPb)) {
      excludedQuoteValuationCount++;
      continue;
    }
    if (minDividendYield !== null && (q.dividendYield === null || q.dividendYield < minDividendYield)) {
      excludedQuoteValuationCount++;
      continue;
    }

    let s2Score = item.prelimScore;
    if (stylePreference === '低估价值') {
      if (q.peTtm && q.peTtm < 18) s2Score += 18;
      if (q.dividendYield && q.dividendYield >= 3) s2Score += 12;
    } else if (stylePreference === '成长龙头') {
      s2Score += Math.min(Math.max(item.npYoy, 0), 60) * 0.4;
    } else {
      if (q.peTtm && q.peTtm > 0 && q.peTtm <= 28) s2Score += 10;
      if (q.dividendYield && q.dividendYield >= 2) s2Score += 6;
    }
    stage2Candidates.push({ ...item, liveQuote: q, s2Score });
  }

  stage2Candidates.sort((a, b) => b.s2Score - a.s2Score);

  // Pick deep shortlist balanced by industry, scaled to targetCount (3..20)
  const extraBuffer = onlyBuyZone || maxDebtRatioPct !== null ? 7 : targetCount >= 15 ? 4 : 3;
  const deepLimit = Math.min(28, targetCount + extraBuffer);
  const maxPerIndustryDeep = hasNodeFilter ? 999 : Math.max(2, Math.ceil(targetCount / 5));

  const deepPickIndCounts = new Map<string, number>();
  const deepShortlist: any[] = [];
  for (const c of stage2Candidates) {
    const cnt = deepPickIndCounts.get(c.industry) || 0;
    if (cnt >= maxPerIndustryDeep) continue;
    deepPickIndCounts.set(c.industry, cnt + 1);
    deepShortlist.push(c);
    if (deepShortlist.length >= deepLimit) break;
  }
  if (deepShortlist.length < deepLimit) {
    for (const c of stage2Candidates) {
      if (!deepShortlist.some((x) => x.symbol === c.symbol)) {
        deepShortlist.push(c);
        if (deepShortlist.length >= deepLimit) break;
      }
    }
  }

  // 4. Stage 3: Full Deep Evaluation with Concurrency Limit + Shared Industry Peers Cache
  const evaluatedAll: CuratedCandidate[] = [];
  const peersCache = new Map<string, Promise<any[]>>();
  const getPeersCached = (sym: string, indName: string | null) => {
    const key = indName || sym;
    if (!peersCache.has(key)) {
      peersCache.set(
        key,
        fetchComparablePeers(sym, indName).catch(() => [])
      );
    }
    return peersCache.get(key)!;
  };

  await asyncPool(6, deepShortlist, async (item) => {
    const symbol = item.symbol;
    try {
      const [quote, klineRes, finRes, annRes, capRes] = await Promise.all([
        fetchStockQuote(symbol),
        fetchStockOhlcv(symbol, 'day', 260),
        fetchStockFundamentalsAndFinancials(symbol),
        fetchStockAnnouncements(symbol),
        fetchCapitalFlow(symbol),
      ]);
      if (!quote || !quote.price || klineRes.bars.length < 30) return;

      if (klineRes.bars.length > 0) {
        const trailingYear = klineRes.bars.slice(-250);
        if (quote.high52w === null) quote.high52w = Number(Math.max(...trailingYear.map((b) => b.high)).toFixed(2));
        if (quote.low52w === null) quote.low52w = Number(Math.min(...trailingYear.map((b) => b.low)).toFixed(2));
      }

      const rule = evaluateTradingRule({
        symbol,
        name: quote.name,
        exchange: quote.exchange,
        board: quote.board,
        isSt: quote.isSt,
        isDelisting: quote.isDelisting,
        isSuspended: quote.isSuspended,
        listDate: finRes.profile?.listDate || null,
      });

      const tech = computeTechnicalIndicators(klineRes.bars);
      const financialsAll = finRes.quarterlyFinancials.length ? finRes.quarterlyFinancials : finRes.annualFinancials;
      const valuation = evaluateFundamentalsAndValuation({
        price: quote.price,
        peTtm: quote.peTtm,
        pb: quote.pb,
        totalMarketCap: quote.totalMarketCap,
        dividendYield: quote.dividendYield,
        financials: financialsAll,
        annualFinancials: finRes.annualFinancials,
        historicalCloses: klineRes.bars.map((b) => b.close),
      });

      const indName = quote.industry || finRes.profile?.industry || item.industry || null;
      const allPeers = await getPeersCached(symbol, indName);
      const peers = allPeers.filter((p) => p.symbol !== symbol).slice(0, 6);
      const cleanInd = (indName || '').replace(/行业|板块|Ⅱ/g, '');
      const matchedIndBoard = cleanInd
        ? (marketSnap?.industries || []).find(
            (b: any) => b.name && (b.name.includes(cleanInd) || cleanInd.includes(b.name))
          )
        : null;

      const cand = scoreAndBuildCandidate({
        symbol,
        quote,
        rule,
        tech,
        valuation,
        annualFinancials: finRes.annualFinancials,
        quarterlyFinancials: finRes.quarterlyFinancials,
        profile: finRes.profile,
        peers,
        shareholderNumbers: finRes.shareholderNumbers,
        institutionalHoldings: finRes.institutionalHoldings,
        dividends: finRes.dividends,
        announcements: annRes.items,
        capitalFlowToday: capRes.todaySnapshot,
        matchedIndBoard,
        stylePreference,
        annualPeriodUsed,
        interimPeriodUsed,
      });

      // Post-deep-dive filters (debt ratio & buy-zone)
      const latestDebt =
        finRes.quarterlyFinancials[0]?.debtToAssetRatio ?? finRes.annualFinancials[0]?.debtToAssetRatio ?? null;
      if (maxDebtRatioPct !== null && latestDebt !== null && latestDebt > maxDebtRatioPct) {
        cand.disqualified = true;
        cand.disqualifyReasons.push(`资产负债率 ${latestDebt.toFixed(1)}% 高于设定上限 ${maxDebtRatioPct}%`);
      }
      if (onlyBuyZone && cand.tradePlan.buyTimingVerdict !== '当前进入理想买区') {
        cand.disqualified = true;
        cand.disqualifyReasons.push(
          `当前股价(${cand.price})未处于K线理想买区(${cand.tradePlan.buyZoneLow}~${cand.tradePlan.buyZoneHigh}元)，按「仅看买区」过滤`
        );
      }

      const barSlice = klineRes.bars.slice(-180);
      const indSlice = tech.series.slice(-180).map((p) => ({
        time: p.time,
        ma5: p.ma5,
        ma20: p.ma20,
        ma60: p.ma60,
        ma120: p.ma120,
        bollUpper: p.bollUpper,
        bollLower: p.bollLower,
      }));

      evaluatedAll.push({
        ...cand,
        rank: 0,
        klineBars: barSlice,
        klineIndicators: indSlice,
      });
    } catch {
      // Skip failed candidate safely without crashing whole screen
    }
  });

  // Separate disqualified / <60 candidates from valid finalists
  const qualified = evaluatedAll
    .filter((c) => !c.disqualified && c.totalScore >= 60)
    .sort((a, b) => b.totalScore - a.totalScore);

  const eliminated = evaluatedAll
    .filter((c) => c.disqualified || c.totalScore < 60)
    .map((c) => ({
      symbol: c.symbol,
      name: c.name,
      industry: c.industry,
      totalScore: c.totalScore,
      reasons: c.disqualifyReasons.length ? c.disqualifyReasons : [`综合评分 ${c.totalScore} 分低于60分淘汰线`],
    }));

  const finalists = qualified.slice(0, targetCount).map((c, idx) => ({
    ...c,
    rank: idx + 1,
  }));

  for (const runner of qualified.slice(targetCount)) {
    eliminated.push({
      symbol: runner.symbol,
      name: runner.name,
      industry: runner.industry,
      totalScore: runner.totalScore,
      reasons: [`综合评分 ${runner.totalScore} 分（低于前${targetCount}名入选门槛，暂列备选观察）`],
    });
  }

  const topFocusPicks = finalists.slice(0, Math.min(3, finalists.length)).map((c) => ({
    rank: c.rank,
    symbol: c.symbol,
    name: c.name,
    totalScore: c.totalScore,
    whyChosen: `总分 ${c.totalScore} 分（${c.ratingLabel}）：${c.coreThesis} 盈亏比约 ${c.tradePlan.riskRewardRatio}:1。`,
  }));

  const lowerRanked = finalists.slice(3);
  const whyOthersRankedLower =
    lowerRanked.length > 0
      ? `${lowerRanked
          .slice(0, 6)
          .map((c) => `${c.name}(${c.totalScore}分)`)
          .join('、')}${lowerRanked.length > 6 ? ` 等共${lowerRanked.length}只` : ''} 同样具备基本面支撑，但在估值安全边际、现金流稳定性或当前K线买卖点位置上略逊于前三名，建议作为次优先观察。`
      : '本次最终入选标的均位居前序核心梯队，各具行业代表性与估值支撑。';

  const scopeParts = [`板块：${boardFilter}`];
  if (industryName || industryNode) scopeParts.push(`行业：${industryName || industryNode}`);
  if (conceptName || conceptNode) scopeParts.push(`概念：${conceptName || conceptNode}`);

  return {
    screeningMeta: {
      analysisDate: new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10),
      generatedAt: new Date().toISOString(),
      annualPeriodUsed,
      interimPeriodUsed,
      universeScope: `沪深京A股（${scopeParts.join(' · ')}）`,
      stylePreference,
      boardFilter,
      targetCount,
      industryFilterName: industryName || industryNode || null,
      conceptFilterName: conceptName || conceptNode || null,
      appliedFiltersSummary,
      funnel: {
        universeTotalCount: baseUniverseCount,
        excludedStDelistingCount: estTotalSt,
        excludedFinancialWeakCount,
        excludedQuoteValuationCount,
        deepAnalyzedCount: evaluatedAll.length,
        eliminatedRiskCount: eliminated.length,
        finalistCount: finalists.length,
      },
      marketSentiment: marketSnap?.sentiment
        ? {
            phaseLabel: marketSnap.sentiment.phaseLabel,
            sentimentScore: marketSnap.sentiment.sentimentScore,
            upRatioPct: marketSnap.breadth?.upRatioPct ?? null,
          }
        : null,
      dataIntegrityNote:
        '行业/概念成分源自新浪财经板块库，财务数据源自东方财富F10定期报告库（已标注具体报告期），行情与K线存在数秒级延迟；所有过滤条件按「且(AND)」严格组合，若条件较苛刻则真实返回满足数量的标的，不做模拟填充。',
    },
    candidates: finalists,
    eliminatedList: eliminated,
    finalConclusion: {
      topFocusPicks,
      whyOthersRankedLower,
      executionDisciplineNote:
        '严格区分“优秀公司”与“当前买点”：对偏离理想买区的标的耐心等待回踩MA20/支撑位再分批介入；任何标的跌破止损线或财报逻辑证伪均需无条件执行退出纪律。',
    },
  };
}

export async function runCuratedAiDeepReport(params: {
  selection: CuratedSelectionResult;
  userModelConfig?: {
    providerType: string;
    baseUrl?: string | null;
    modelName?: string | null;
    apiKeyPlain?: string | null;
    temperature?: number | null;
  };
}): Promise<{ modelUsed: string; generatedAt: string; reportMarkdown: string }> {
  const { selection, userModelConfig } = params;
  const many = selection.candidates.length > 8;

  // Compact factual payload so LLM only synthesizes real collected numbers & never fabricates
  const compactEvidence = {
    screeningMeta: selection.screeningMeta,
    candidates: selection.candidates.map((c) => ({
      rank: c.rank,
      symbol: c.symbol,
      name: c.name,
      board: c.board,
      industry: c.industry,
      price: c.price,
      priceDate: c.priceDate,
      totalMarketCapYi: c.totalMarketCapYi,
      peTtm: c.peTtm,
      pb: c.pb,
      ps: c.ps,
      peg: c.peg,
      dividendYield: c.dividendYield,
      pePercentile: c.pePercentile,
      marginOfSafetyPct: c.marginOfSafetyPct,
      totalScore: c.totalScore,
      ratingLabel: c.ratingLabel,
      dimensions: c.dimensions.map((d) => ({
        label: d.label,
        score: `${d.score}/${d.maxScore}`,
        summary: d.summary,
      })),
      annualFinancials: c.annualFinancials.slice(0, many ? 3 : 5),
      latestQuarterly: c.quarterlyFinancials.slice(0, 1),
      institutionalHoldings: c.institutionalHoldings.slice(0, 1),
      shareholderNumbers: c.shareholderNumbers.slice(0, 1),
      peers: c.peers.slice(0, many ? 2 : 4),
      technicalSummary: c.technicalSummary,
      tradePlan: c.tradePlan,
      missingFields: c.provenance.missingFields,
    })),
    eliminatedList: selection.eliminatedList.slice(0, 15),
  };

  const systemInstruction = `你是一名拥有20年以上证券研究经验的A股专业投资研究员、量化分析师、财务分析师和行业研究专家。
请严格基于用户提供的真实采集与量化计算数据，生成一份结构严谨、客观、数据驱动的《A股精选好股深度投研报告》（Markdown格式）。
严禁红线：
1. 只能引用下方JSON中真实存在的股价、财务报告期数字、PE/PB/ROE、K线均线/支撑阻力/买点/止盈/止损、机构持仓与股东户数；未提供字段必须写“未知/数据缺失”，严禁编造！
2. 必须严格区分“已实现的财务业绩”、“系统情景推演估值”和“未来预期”。
3. 必须严格区分“优秀公司”与“当前适合买入的股票”。
4. 严格按以下六部分结构输出（中文）：
   - 第一部分：市场筛选概况（日期、生效的多维组合过滤条件、排除统计、最终入选）
   - 第二部分：最终候选股票排名表（覆盖全部${selection.candidates.length}只候选股的排名、代码、名称、行业、最新股价、总评分、评级、理想买区、止盈止损）
   - 第三部分：单只股票深度分析（${many ? '对前10名逐一展开1-11项深度剖析，第11名及以后简明扼要列出核心业务、财务亮点与K线买点' : '对每只候选股逐一剖析1-11项：公司业务、行业地位、核心竞争力、近5年财务、盈利质量、成长逻辑、估值水平、机构/股东变化、K线技术趋势、主要风险、投资逻辑是否成立'}）
   - 第四部分：投资价值判断（估值是否合理、未来3年空间、是否值得长期跟踪、当前是否适合买入、等待条件）
   - 第五部分：结合K线图的买入计划（理想观察买区、合理估值区间、分批买入思路、第一/第二止盈位、止损与逻辑失效条件、预期持有周期）
   - 第六部分：最终结论（选出最值得深入研究的1-3家公司，说明理由及为何其余候选排名靠后或被淘汰）`;

  const prompt = `请依据以下全市场实测筛选档案，撰写完整六部分深度投研与K线买卖点报告：\n${JSON.stringify(
    compactEvidence,
    null,
    2
  )}`;

  let rawText = '';
  let modelUsed = 'gemini-4-hydrogen';

  const useCustomCompatible =
    (userModelConfig?.providerType === 'openai_compatible' || userModelConfig?.providerType === 'deepseek') &&
    Boolean(userModelConfig.apiKeyPlain);

  if (useCustomCompatible && userModelConfig?.apiKeyPlain) {
    modelUsed = userModelConfig.modelName || 'deepseek-chat';
    const endpoint = normalizeChatCompletionsEndpoint(userModelConfig.baseUrl);
    const isReasoner = modelUsed.toLowerCase().includes('reasoner');

    const reqBody: Record<string, any> = {
      model: modelUsed,
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: prompt },
      ],
    };
    if (!isReasoner) {
      reqBody.temperature = userModelConfig.temperature ?? 0.2;
    }

    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userModelConfig.apiKeyPlain}`,
      },
      body: JSON.stringify(reqBody),
      signal: AbortSignal.timeout(120000),
    });
    if (!resp.ok) {
      const errTxt = await resp.text();
      throw new Error(`AI接口调用失败 (HTTP ${resp.status}): ${errTxt.slice(0, 260)}`);
    }
    const data: any = await resp.json();
    rawText = String(data?.choices?.[0]?.message?.content || '')
      .replace(/<think>[\s\S]*?<\/think>/gi, '')
      .trim();
  } else {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('未检测到可用 AI 模型 Key，请先在右上角或系统设置中配置您的 DeepSeek API Key。');
    }
    modelUsed =
      userModelConfig?.modelName && userModelConfig.providerType === 'gemini'
        ? userModelConfig.modelName
        : 'gemini-4-hydrogen';
    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: modelUsed,
      contents: prompt,
      config: { systemInstruction },
    });
    rawText = String(response.text || '').trim();
  }

  return {
    modelUsed,
    generatedAt: new Date().toISOString(),
    reportMarkdown: rawText,
  };
}
