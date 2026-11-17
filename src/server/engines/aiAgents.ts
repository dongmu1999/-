import { GoogleGenAI } from '@google/genai';
import { db } from '../../db/index.ts';
import { modelVersions } from '../../db/schema.ts';
import { eq } from 'drizzle-orm';
import { EvaluatedTradingRule } from './tradingRules.ts';
import { TechnicalSummary } from './indicators.ts';
import { ValuationAndQualityOutput } from './valuation.ts';

export interface ScoreDimension {
  key: string;
  label: string;
  maxScore: number;
  score: number;
  reason: string;
  evidence: string;
  dataSource: string;
  updatedAt: string;
  missingInfo: string | null;
  uncertainty: string;
}

export interface DualTrackScores {
  modelVersion: string;
  longTerm: {
    total: number;
    grade: string;
    dimensions: ScoreDimension[];
  };
  shortTerm: {
    total: number;
    grade: string;
    dimensions: ScoreDimension[];
  };
}

export function gradeScore(score: number): string {
  if (score >= 90) return '极强';
  if (score >= 80) return '强';
  if (score >= 65) return '偏强';
  if (score >= 45) return '中性';
  if (score >= 30) return '偏弱';
  return '弱';
}

export async function seedDefaultModelVersion() {
  const defaultLong = {
    fundamental: 25,
    financial_quality: 20,
    industry: 15,
    valuation: 20,
    governance: 10,
    risk: 10,
  };
  const defaultShort = {
    sentiment: 20,
    theme: 20,
    capital: 20,
    technical: 20,
    strength: 10,
    risk: 10,
  };
  await db
    .insert(modelVersions)
    .values({
      versionCode: 'CSI-V3.0-BASE',
      modelName: 'A股双轨量化基准模型 V3.0',
      longTermWeights: defaultLong,
      shortTermWeights: defaultShort,
      description: '长期价值(基本面25/财务20/行业15/估值20/治理10/风控10)与短线交易(情绪20/题材20/资金20/技术20/强度10/风控10)独立评分权重',
      isActive: true,
    })
    .onConflictDoNothing({ target: modelVersions.versionCode });
}

function fmtYi(val: number | null | undefined): string {
  if (val === null || val === undefined || Number.isNaN(val)) return '无';
  const abs = Math.abs(val);
  if (abs >= 1e8) return `${(val / 1e8).toFixed(2)}亿`;
  if (abs >= 1e4) return `${(val / 1e4).toFixed(1)}万`;
  return val.toFixed(0);
}

export function computeDualTrackScores(params: {
  quote: any;
  tech: TechnicalSummary;
  valuation: ValuationAndQualityOutput;
  financials: any[];
  annualFinancials?: any[];
  profile?: any;
  peers?: any[];
  shareholderNumbers?: any[];
  institutionalHoldings?: any[];
  dividends?: any[];
  stockDragonTiger?: any[];
  announcements: any[];
  marketSentimentScore?: number | null;
  marketSentimentPhase?: string | null;
  marketBreadth?: any;
  industryBoard?: any;
  capitalFlowToday?: any;
  capitalFlowSeries?: any[];
  modelVersionCode?: string;
}): DualTrackScores {
  const {
    quote,
    tech,
    valuation,
    financials,
    annualFinancials = [],
    profile,
    peers = [],
    shareholderNumbers = [],
    institutionalHoldings = [],
    dividends = [],
    stockDragonTiger = [],
    announcements,
    marketSentimentScore,
    marketSentimentPhase,
    marketBreadth,
    industryBoard,
    capitalFlowToday,
    capitalFlowSeries,
  } = params;
  const nowStr = new Date().toISOString();
  const latestFin = financials[0] || annualFinancials[0] || null;
  const latestAnnual = annualFinancials[0] || null;
  const latestInd = tech.latest;

  const roeRef = latestFin?.roe ?? latestAnnual?.roe ?? null;
  const gmRef = latestFin?.grossMargin ?? latestAnnual?.grossMargin ?? null;
  const revYoyRef = latestFin?.revenueYoy ?? latestAnnual?.revenueYoy ?? null;
  const npYoyRef = latestFin?.netProfitYoy ?? latestAnnual?.netProfitYoy ?? null;

  // --- A. 长期投资评分 (100分) ---
  // 1. 公司基本面 (25)
  let fundScore = 12;
  if (roeRef !== null) {
    if (roeRef >= 18) fundScore += 7;
    else if (roeRef >= 10) fundScore += 4;
    else if (roeRef < 3) fundScore -= 4;
  }
  if (gmRef !== null) {
    if (gmRef >= 35) fundScore += 4;
    else if (gmRef >= 20) fundScore += 2;
  }
  if (revYoyRef !== null && revYoyRef > 15) fundScore += 2;
  fundScore = Math.max(2, Math.min(25, fundScore));

  // 2. 财务质量 (20)
  let finQualScore = 14 - valuation.anomalies.length * 3;
  const debtRatio = latestFin?.debtToAssetRatio ?? latestAnnual?.debtToAssetRatio ?? null;
  const cfToNp = latestFin?.cashFlowToNetProfit ?? latestAnnual?.cashFlowToNetProfit ?? null;
  const opCash = latestFin?.operatingCashFlow ?? latestAnnual?.operatingCashFlow ?? null;
  const mFunds = latestFin?.monetaryFunds ?? latestAnnual?.monetaryFunds ?? null;
  const recv = latestFin?.accountsReceivable ?? latestAnnual?.accountsReceivable ?? null;
  const inv = latestFin?.inventory ?? latestAnnual?.inventory ?? null;
  const gw = latestFin?.goodwill ?? latestAnnual?.goodwill ?? 0;

  if (debtRatio !== null && debtRatio < 45) finQualScore += 3;
  if (cfToNp !== null && cfToNp >= 1) finQualScore += 2;
  finQualScore = Math.max(2, Math.min(20, finQualScore));

  // 3. 行业前景 (15)
  const peerPes = peers.map((p) => p.peTtm).filter((v): v is number => typeof v === 'number' && v > 0 && v < 300);
  const peerAvgPe = peerPes.length ? Number((peerPes.reduce((a, b) => a + b, 0) / peerPes.length).toFixed(1)) : null;
  let indScore = quote.industry ? 10 : 7;
  if (industryBoard && typeof industryBoard.changePct === 'number') {
    if (industryBoard.changePct > 1.5) indScore += 2;
    else if (industryBoard.changePct < -1.5) indScore -= 1;
  }
  if (profile?.businessComposition?.length) indScore += 1;
  indScore = Math.max(3, Math.min(15, indScore));

  // 4. 估值水平 (20)
  let valScore = 10;
  if (valuation.marginOfSafetyPct !== null) {
    if (valuation.marginOfSafetyPct >= 20) valScore += 7;
    else if (valuation.marginOfSafetyPct >= 5) valScore += 4;
    else if (valuation.marginOfSafetyPct < -15) valScore -= 4;
  }
  if (valuation.pePercentile !== null && valuation.pePercentile < 30) valScore += 3;
  if (valuation.dividendYield !== null && valuation.dividendYield >= 3) valScore += 2;
  valScore = Math.max(2, Math.min(20, valScore));

  // 5. 管理与治理 (10)
  const negAnn = announcements.filter((a) => a.sentimentLabel === '利空').length;
  const posAnn = announcements.filter((a) => a.sentimentLabel === '利好').length;
  const latestOrg = institutionalHoldings[0] || null;
  const latestHolder = shareholderNumbers[0] || null;
  let govScore = 6 + posAnn - negAnn * 2;
  if (dividends.length > 0) govScore += 1;
  if (latestOrg && typeof latestOrg.totalSharesRatioPct === 'number' && latestOrg.totalSharesRatioPct >= 20) govScore += 1;
  if (latestHolder && typeof latestHolder.changeRatioPct === 'number' && latestHolder.changeRatioPct < -2) govScore += 1;
  govScore = Math.max(2, Math.min(10, govScore));

  // 6. 风险水平 (10)
  let ltRiskScore = 8;
  if (quote.isSt || quote.isDelisting) ltRiskScore -= 5;
  if (valuation.anomalies.length > 0) ltRiskScore -= 2;
  ltRiskScore = Math.max(1, Math.min(10, ltRiskScore));

  const mainBizShort = profile?.mainBusiness
    ? String(profile.mainBusiness).slice(0, 48) + (String(profile.mainBusiness).length > 48 ? '...' : '')
    : null;

  const fmtNum = (v: number | null | undefined, digits = 2) =>
    v !== null && v !== undefined && !Number.isNaN(v) ? v.toFixed(digits) : '无';

  const longTermDims: ScoreDimension[] = [
    {
      key: 'fundamental',
      label: '公司基本面',
      maxScore: 25,
      score: fundScore,
      reason: valuation.qualityEvaluation,
      evidence: `${mainBizShort ? `主营：${mainBizShort}；` : ''}ROE=${fmtNum(roeRef)}%，毛利率=${fmtNum(gmRef)}%，营收同比=${fmtNum(revYoyRef)}%，净利同比=${fmtNum(npYoyRef)}%`,
      dataSource: '东方财富F10 (主营构成 + 财报)',
      updatedAt: nowStr,
      missingInfo: latestFin ? null : '未获取到最新财务报告期数据',
      uncertainty: '单期财务指标受行业周期与收入确认节奏影响',
    },
    {
      key: 'financial_quality',
      label: '财务质量',
      maxScore: 20,
      score: finQualScore,
      reason: valuation.financialHealthEvaluation,
      evidence: `负债率=${debtRatio !== null ? `${debtRatio.toFixed(1)}%` : '无'}，经营现金流=${fmtYi(opCash)}（净利比${fmtNum(cfToNp)}x），货币资金=${fmtYi(mFunds)}，应收=${fmtYi(recv)}，存货=${fmtYi(inv)}，商誉=${fmtYi(gw)}`,
      dataSource: '东方财富F10 (资产负债表/现金流量表)',
      updatedAt: nowStr,
      missingInfo:
        debtRatio === null && opCash === null ? '缺少资产负债表与现金流量表数据' : null,
      uncertainty: '季报未经会计师事务所审计，细分科目附注以年报为准',
    },
    {
      key: 'industry',
      label: '行业前景',
      maxScore: 15,
      score: indScore,
      reason: quote.industry
        ? `所属行业「${quote.industry}」${industryBoard ? `今日板块 ${industryBoard.changePct >= 0 ? '+' : ''}${industryBoard.changePct}%` : ''}${peerAvgPe ? `，可比公司均值PE ${peerAvgPe}x` : ''}`
        : '暂未匹配行业分类，按中性给分',
      evidence: `行业=${quote.industry || '未知'}，可比同行=${peers.length}家${peerAvgPe ? `(平均PE ${peerAvgPe}x)` : ''}${profile?.businessComposition?.length ? `，主营业务拆解=${profile.businessComposition.length}项` : ''}`,
      dataSource: '东方财富行业板块与同行可比数据',
      updatedAt: nowStr,
      missingInfo: quote.industry ? null : '所属行业分类暂缺',
      uncertainty: '产业政策演变与技术路线迭代存在长期不确定性',
    },
    {
      key: 'valuation',
      label: '估值水平',
      maxScore: 20,
      score: valScore,
      reason: valuation.valuationEvaluation,
      evidence: `PE(TTM)=${valuation.peTtm ?? '-'}，PB=${valuation.pb ?? '-'}，PS=${valuation.ps ?? '-'}，PEG=${valuation.peg ?? '不适用'}，股息率=${valuation.dividendYield !== null ? `${valuation.dividendYield.toFixed(2)}%` : '-'}，安全边际=${valuation.marginOfSafetyPct !== null ? `${valuation.marginOfSafetyPct}%` : '-'}，价格分位=${valuation.pePercentile !== null ? `${valuation.pePercentile}%` : '-'}`,
      dataSource: '腾讯/东财行情 + 三情景估值引擎',
      updatedAt: nowStr,
      missingInfo: valuation.peTtm === null && valuation.pb === null ? '缺少核心估值倍数' : null,
      uncertainty: '三情景目标价对未来EPS增速假设与市场风险溢价敏感',
    },
    {
      key: 'governance',
      label: '管理与治理',
      maxScore: 10,
      score: govScore,
      reason: `近20日公告利好${posAnn}条/利空${negAnn}条，分红记录${dividends.length}次${latestOrg ? `，机构持股${Number(latestOrg.totalSharesRatioPct || 0).toFixed(1)}%` : ''}`,
      evidence: `公告样本=${announcements.length}条，分红=${dividends.length}次，机构家数=${latestOrg?.orgCount ?? '-'}，股东户数=${latestHolder?.holderNum ? Number(latestHolder.holderNum).toLocaleString() : '-'}户`,
      dataSource: '巨潮资讯网(CNINFO) + 东财股东/分红数据',
      updatedAt: nowStr,
      missingInfo:
        announcements.length === 0 && dividends.length === 0 && shareholderNumbers.length === 0
          ? '近期公告与股东结构数据为空'
          : null,
      uncertainty: '治理成效与关联交易公允性需持续跟踪公司公告',
    },
    {
      key: 'risk',
      label: '长期风险控制',
      maxScore: 10,
      score: ltRiskScore,
      reason: quote.isSt ? 'ST/*ST风险警示标的，扣减风控分' : valuation.anomalies.length ? `存在${valuation.anomalies.length}项财报预警信号` : '非ST正常交易状态，财务红旗风险可控',
      evidence: `ST=${quote.isSt ? '是' : '否'}，停牌=${quote.isSuspended ? '是' : '否'}，52周区间=${quote.low52w ?? '-'}~${quote.high52w ?? '-'}元，财务异常=${valuation.anomalies.length}条`,
      dataSource: '交易所状态标识 + 财务体检引擎',
      updatedAt: nowStr,
      missingInfo: null,
      uncertainty: '宏观系统性冲击与突发政策事件难以提前量化',
    },
  ];

  // --- B. 短线交易评分 (100分) ---
  // 1. 市场情绪 (20)
  const hasMarketSent = marketSentimentScore !== undefined && marketSentimentScore !== null;
  const sentVal = hasMarketSent ? Number(marketSentimentScore) : 50;
  const stSentScore = Math.max(4, Math.min(20, Math.round((sentVal / 100) * 20)));

  // 2. 题材热度 (20)
  let stThemeScore = 10;
  if (quote.changePct !== null) {
    if (quote.changePct > 5) stThemeScore += 5;
    else if (quote.changePct > 2) stThemeScore += 3;
    else if (quote.changePct < -4) stThemeScore -= 3;
  }
  if (industryBoard && typeof industryBoard.changePct === 'number') {
    if (industryBoard.changePct > 1.5) stThemeScore += 2;
    else if (industryBoard.changePct < -1.5) stThemeScore -= 2;
  }
  if (stockDragonTiger.length > 0) stThemeScore += 2;
  stThemeScore = Math.max(3, Math.min(20, stThemeScore));

  // 3. 资金与成交 (20)
  const latestCap = capitalFlowToday || (capitalFlowSeries?.length ? capitalFlowSeries[capitalFlowSeries.length - 1] : null);
  let stCapScore = 10;
  if (quote.volumeRatio && quote.volumeRatio >= 1.5) stCapScore += 3;
  if (quote.turnoverRate && quote.turnoverRate >= 3 && quote.turnoverRate <= 18) stCapScore += 3;
  if (latestCap && typeof latestCap.mainNetInflowEst === 'number') {
    if (latestCap.mainNetInflowEst > 0) stCapScore += 3;
    else if (latestCap.mainNetInflowEst < 0) stCapScore -= 2;
  }
  stCapScore = Math.max(3, Math.min(20, stCapScore));

  // 4. 技术趋势 (20)
  let stTechScore = 10;
  if (tech.trendDirection === '上行趋势') stTechScore += 5;
  else if (tech.trendDirection === '下行趋势') stTechScore -= 4;
  if (tech.crossovers.some((c) => c.includes('金叉'))) stTechScore += 3;
  if (tech.crossovers.some((c) => c.includes('死叉'))) stTechScore -= 3;
  stTechScore = Math.max(2, Math.min(20, stTechScore));

  // 5. 个股强度 (10)
  const stStrScore =
    quote.changePct !== null ? Math.max(2, Math.min(10, Math.round(5 + quote.changePct * 0.4))) : 5;

  // 6. 短线风控 (10)
  let stRiskScore = 8;
  if (latestInd?.rsi14 && latestInd.rsi14 > 78) stRiskScore -= 3;
  if (quote.isSuspended) stRiskScore -= 6;
  if (quote.changePct && quote.changePct > 9) stRiskScore -= 2;
  stRiskScore = Math.max(1, Math.min(10, stRiskScore));

  const shortTermDims: ScoreDimension[] = [
    {
      key: 'sentiment',
      label: '市场情绪',
      maxScore: 20,
      score: stSentScore,
      reason: hasMarketSent
        ? `全市场量化情绪 ${sentVal.toFixed(1)}/100（${marketSentimentPhase || '实时阶段'}）${
            marketBreadth ? `，上涨家数占比 ${marketBreadth.upRatioPct}%` : ''
          }`
        : '全市场情绪暂按中性50分参考',
      evidence: hasMarketSent
        ? `情绪分=${sentVal}，阶段=${marketSentimentPhase || '-'}，涨停=${marketBreadth?.limitUpCount ?? '-'}家，封板率=${marketBreadth?.sealRatePct ?? '-'}%`
        : '全市场广度快照暂未加载',
      dataSource: '全市场涨跌与连板监控',
      updatedAt: nowStr,
      missingInfo: hasMarketSent ? null : '全市场情绪接口暂不可用',
      uncertainty: '盘中情绪切换迅速，高潮次日需防分歧',
    },
    {
      key: 'theme',
      label: '题材热度',
      maxScore: 20,
      score: stThemeScore,
      reason: `${quote.industry || '所属行业'}${
        industryBoard ? `今日板块 ${industryBoard.changePct >= 0 ? '+' : ''}${industryBoard.changePct}%` : ''
      }${stockDragonTiger.length ? `，近期龙虎榜上榜${stockDragonTiger.length}次` : ''}`,
      evidence: `行业=${quote.industry || '未知'}，个股涨跌=${quote.changePct ?? 0}%${
        industryBoard?.leaderName ? `，板块领涨=${industryBoard.leaderName}(${industryBoard.leaderChangePct}%)` : ''
      }，近期龙虎榜=${stockDragonTiger.length}条`,
      dataSource: '东财行业板块 + 龙虎榜数据中心',
      updatedAt: nowStr,
      missingInfo: quote.industry ? null : '缺少所属行业/题材归属',
      uncertainty: '短线题材退潮期跟风股流动性衰减极快',
    },
    {
      key: 'capital',
      label: '资金与成交',
      maxScore: 20,
      score: stCapScore,
      reason: `${tech.volumeAnalysis}${
        latestCap ? `，最新主力估算净${latestCap.mainNetInflowEst >= 0 ? '流入' : '流出'} ${fmtYi(Math.abs(latestCap.mainNetInflowEst))}` : ''
      }`,
      evidence: `换手=${quote.turnoverRate ?? '-'}%，量比=${quote.volumeRatio ?? '-'}x，主力估算净流=${fmtYi(latestCap?.mainNetInflowEst)}${
        capitalFlowToday?.mainNetRatioPct !== null && capitalFlowToday?.mainNetRatioPct !== undefined
          ? `(占比${capitalFlowToday.mainNetRatioPct}%)`
          : ''
      }`,
      dataSource: '腾讯成交 + 东财第三方估算资金口径',
      updatedAt: nowStr,
      missingInfo: latestCap ? null : '估算资金流接口暂未返回当日数据',
      uncertainty: '大单资金为逐笔成交估算口径，放量亦可能是资金分歧对倒',
    },
    {
      key: 'technical',
      label: '技术趋势',
      maxScore: 20,
      score: stTechScore,
      reason: `${tech.trendDirection} · ${tech.maAlignment}`,
      evidence: `RSI14=${latestInd?.rsi14 ?? '-'}，MACD柱=${latestInd?.macdHist?.toFixed(3) ?? '-'}，KDJ-J=${latestInd?.kdjJ ?? '-'}，状态=${tech.breakoutState}`,
      dataSource: '系统技术指标计算引擎',
      updatedAt: nowStr,
      missingInfo: latestInd ? null : 'K线数据不足以计算完整技术指标',
      uncertainty: '震荡市均线与MACD信号易反复出现假突破',
    },
    {
      key: 'strength',
      label: '个股强度',
      maxScore: 10,
      score: stStrScore,
      reason: `当日涨幅 ${quote.changePct ?? 0}%，成交额 ${fmtYi(quote.amount)}`,
      evidence: `现价=${quote.price ?? '-'}元，52周低点回升=${
        quote.price && quote.low52w ? (((quote.price - quote.low52w) / quote.low52w) * 100).toFixed(1) + '%' : '-'
      }`,
      dataSource: '腾讯/东财实时行情快照',
      updatedAt: nowStr,
      missingInfo: null,
      uncertainty: '单日涨跌强弱不能直接外推为多日连续趋势',
    },
    {
      key: 'risk',
      label: '短线风控',
      maxScore: 10,
      score: stRiskScore,
      reason: latestInd?.rsi14 && latestInd.rsi14 > 75 ? 'RSI处于超买区，提示追高回撤风险' : '短线拥挤度与波动率处于可控区间',
      evidence: `RSI14=${latestInd?.rsi14 ?? '-'}，ATR14=${latestInd?.atr14?.toFixed(2) ?? '-'}元，支撑=${tech.supportLevels[0] ?? '-'} / 压力=${tech.resistanceLevels[0] ?? '-'}`,
      dataSource: '系统波动率风控计算',
      updatedAt: nowStr,
      missingInfo: null,
      uncertainty: '需防范隔夜利空跳空低开及T+1制度当日无法止损风险',
    },
  ];

  const longTotal = Number(longTermDims.reduce((s, d) => s + d.score, 0).toFixed(1));
  const shortTotal = Number(shortTermDims.reduce((s, d) => s + d.score, 0).toFixed(1));

  return {
    modelVersion: params.modelVersionCode || 'CSI-V3.0-BASE',
    longTerm: {
      total: longTotal,
      grade: gradeScore(longTotal),
      dimensions: longTermDims,
    },
    shortTerm: {
      total: shortTotal,
      grade: gradeScore(shortTotal),
      dimensions: shortTermDims,
    },
  };
}

export function buildRiskAwareTradingPlan(params: {
  symbol: string;
  stockName: string;
  price: number;
  tech: TechnicalSummary;
  rule: EvaluatedTradingRule;
  scores: DualTrackScores;
  tradingStyle: string;
  riskSettings: {
    totalCapital: number;
    maxSingleLossPct: number;
    maxPositionPerStockPct: number;
  };
}) {
  const { symbol, stockName, price, tech, rule, scores, tradingStyle, riskSettings } = params;
  const isLongStyle = ['中线', '长线'].includes(tradingStyle);
  const relevantScore = isLongStyle ? scores.longTerm.total : scores.shortTerm.total;

  let stance: '买入关注' | '持有' | '减仓' | '卖出' | '观望' = '观望';
  if (relevantScore >= 75) stance = '买入关注';
  else if (relevantScore >= 60) stance = '持有';
  else if (relevantScore < 40) stance = '减仓';

  const atr = tech.latest?.atr14 || price * 0.03;
  const nearestSupport = tech.supportLevels[0] || Number((price - atr * 1.5).toFixed(2));
  const stopLossPrice = Number(
    Math.min(price * 0.96, Math.max(price * 0.85, nearestSupport * 0.985)).toFixed(2)
  );
  const stopDistance = Math.max(0.01, price - stopLossPrice);

  // Position sizing MUST be governed by risk budget & stop-loss distance
  const maxRiskYuan = riskSettings.totalCapital * (riskSettings.maxSingleLossPct / 100);
  const rawSharesByRisk = Math.floor(maxRiskYuan / stopDistance);
  const maxPositionYuan = riskSettings.totalCapital * (riskSettings.maxPositionPerStockPct / 100);
  const rawSharesByCap = Math.floor(maxPositionYuan / price);
  const step = rule.qtyStep;
  const targetShares = Math.max(
    0,
    Math.floor(Math.min(rawSharesByRisk, rawSharesByCap) / step) * step
  );
  const actualPositionPct = Number(
    (((targetShares * price) / riskSettings.totalCapital) * 100).toFixed(2)
  );
  const maxLossYuan = Number((targetShares * stopDistance).toFixed(2));

  const r1 = tech.resistanceLevels[0] || Number((price + stopDistance * 1.8).toFixed(2));
  const r2 = tech.resistanceLevels[1] || Number((price + stopDistance * 3.0).toFixed(2));
  const riskRewardRatio = Number(((r1 - price) / stopDistance).toFixed(2));

  const horizonMap: Record<string, string> = {
    超短线: '1-2个交易日（T+1隔日观察）',
    短线: '3-5个交易日',
    波段: '1-4周',
    中线: '1-3个月',
    长线: '6个月以上基本面持有',
  };

  return {
    symbol,
    stockName,
    tradingStyle,
    stance,
    entryLow: Number((price * 0.985).toFixed(2)),
    entryHigh: Number((price * 1.005).toFixed(2)),
    breakoutCondition:
      tech.resistanceLevels[0]
        ? `放量站稳压力位 ${tech.resistanceLevels[0]} 元上方且分时不跌破均价线`
        : '放量突破近期震荡箱体上沿并收阳确认',
    stopLossPrice,
    takeProfitTargets: [r1, r2],
    riskRewardRatio,
    suggestedPositionPct: actualPositionPct,
    suggestedShares: targetShares,
    maxLossYuan,
    holdingHorizon: horizonMap[tradingStyle] || '1-2周',
    invalidationCondition: `有效跌破止损位 ${stopLossPrice} 元，或出现重大利空公告/基本面恶化`,
    applicableRuleSummary: `${rule.board} · ${rule.priceLimitPct !== null ? `±${rule.priceLimitPct}%涨跌幅` : '新股无涨跌幅期'} · ${rule.tPlusRule} · 最小申报${rule.minOrderQty}股/${rule.qtyStep}股递增`,
  };
}

export interface AiRoleOutput {
  roleName: string;
  collectedDataRefs: string[];
  computedMetrics: string[];
  analystView: string;
  aiInference: string;
  futureOutlook: string;
  missingData: string[];
}

export interface MultiRoleAiResearchResult {
  llmModelUsed: string;
  roleOutputs: AiRoleOutput[];
  chiefConclusion: {
    longTermThesis: string;
    shortTermThesis: string;
    conflictsIdentified: string[];
    evidenceStrength: string;
    finalStance: string;
    keyRisks: string[];
    uncertainties: string[];
  };
}

export function normalizeChatCompletionsEndpoint(baseUrl?: string | null): string {
  const raw = (baseUrl || 'https://api.deepseek.com').trim().replace(/\/+$/, '');
  if (raw.endsWith('/chat/completions')) return raw;
  return `${raw}/chat/completions`;
}

function extractJsonObject(raw: string): any {
  const withoutThink = raw.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const unfenced = withoutThink
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();
  try {
    return JSON.parse(unfenced);
  } catch {
    const match = unfenced.match(/\{[\s\S]*\}/);
    if (match) {
      return JSON.parse(match[0]);
    }
    throw new Error('模型返回结果未能解析为合法JSON结构');
  }
}

export async function testAiModelConnection(userModelConfig: {
  providerType: string;
  baseUrl?: string | null;
  modelName?: string | null;
  apiKeyPlain?: string | null;
}): Promise<{ ok: boolean; provider: string; model: string; latencyMs: number; replyPreview: string }> {
  const t0 = Date.now();
  const isCustom =
    userModelConfig.providerType === 'openai_compatible' || userModelConfig.providerType === 'deepseek';

  if (isCustom) {
    if (!userModelConfig.apiKeyPlain) {
      throw new Error('未检测到您的 API Key，请先输入或保存 API Key。');
    }
    const model = userModelConfig.modelName || 'deepseek-chat';
    const endpoint = normalizeChatCompletionsEndpoint(userModelConfig.baseUrl);
    const isReasoner = model.toLowerCase().includes('reasoner');
    const bodyPayload: Record<string, any> = {
      model,
      max_tokens: 64,
      messages: [
        { role: 'user', content: '请仅回复四个字：连接成功' },
      ],
    };
    if (!isReasoner) {
      bodyPayload.temperature = 0;
    }

    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userModelConfig.apiKeyPlain}`,
      },
      body: JSON.stringify(bodyPayload),
      signal: AbortSignal.timeout(20000),
    });

    if (!resp.ok) {
      const errTxt = await resp.text();
      throw new Error(`接口测试失败 (HTTP ${resp.status}): ${errTxt.slice(0, 240)}`);
    }
    const data: any = await resp.json();
    const reply = String(data?.choices?.[0]?.message?.content || 'OK').trim();
    return {
      ok: true,
      provider: userModelConfig.providerType,
      model,
      latencyMs: Date.now() - t0,
      replyPreview: reply.slice(0, 80),
    };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('服务端未配置默认 GEMINI_API_KEY，请切换为 DeepSeek 并填入您的个人 API Key。');
  }
  const model = userModelConfig.modelName || 'gemini-4-hydrogen';
  const ai = new GoogleGenAI({ apiKey });
  const response = await ai.models.generateContent({
    model,
    contents: '请仅回复：连接成功',
  });
  return {
    ok: true,
    provider: 'gemini',
    model,
    latencyMs: Date.now() - t0,
    replyPreview: String(response.text || 'OK').slice(0, 80),
  };
}

export async function runMultiRoleAiResearch(params: {
  quote: any;
  tech: TechnicalSummary;
  valuation: ValuationAndQualityOutput;
  financials: any[];
  annualFinancials?: any[];
  profile?: any;
  shareholderNumbers?: any[];
  institutionalHoldings?: any[];
  dividends?: any[];
  capitalFlowToday?: any;
  announcements: any[];
  rule: EvaluatedTradingRule;
  scores: DualTrackScores;
  userModelConfig?: {
    providerType: string;
    baseUrl?: string | null;
    modelName?: string | null;
    apiKeyPlain?: string | null;
    temperature?: number | null;
  };
}): Promise<MultiRoleAiResearchResult> {
  const {
    quote,
    tech,
    valuation,
    financials,
    annualFinancials = [],
    profile,
    shareholderNumbers = [],
    institutionalHoldings = [],
    dividends = [],
    capitalFlowToday,
    announcements,
    rule,
    scores,
    userModelConfig,
  } = params;

  const evidencePayload = {
    stock: {
      symbol: quote.symbol,
      name: quote.name,
      board: quote.board,
      industry: quote.industry,
      mainBusiness: profile?.mainBusiness || null,
      businessComposition: (profile?.businessComposition || []).slice(0, 6),
      price: quote.price,
      changePct: quote.changePct,
      turnoverRate: quote.turnoverRate,
      volumeRatio: quote.volumeRatio,
      peTtm: quote.peTtm,
      pb: quote.pb,
      ps: valuation.ps,
      peg: valuation.peg,
      dividendYield: quote.dividendYield,
      high52w: quote.high52w,
      low52w: quote.low52w,
      totalMarketCapYi: quote.totalMarketCap ? Number((quote.totalMarketCap / 1e8).toFixed(2)) : null,
      dataStatus: quote.provenance.dataStatus,
      dataDate: quote.provenance.dataDate,
    },
    tradingRule: {
      board: rule.board,
      priceLimitPct: rule.priceLimitPct,
      tPlusRule: rule.tPlusRule,
      shortSellingNote: rule.shortSellingNote,
    },
    technicals: {
      trendDirection: tech.trendDirection,
      maAlignment: tech.maAlignment,
      latest: tech.latest,
      crossovers: tech.crossovers,
      breakoutState: tech.breakoutState,
      supportLevels: tech.supportLevels,
      resistanceLevels: tech.resistanceLevels,
    },
    valuationAndFinancials: {
      latestPeriod: financials[0] || null,
      latestAnnual: annualFinancials[0] || null,
      anomalies: valuation.anomalies,
      scenarios: valuation.scenarios,
      marginOfSafetyPct: valuation.marginOfSafetyPct,
      missingFields: valuation.missingFields,
    },
    holdersAndCapital: {
      shareholderNumbers: shareholderNumbers.slice(0, 3),
      institutionalHoldings: institutionalHoldings.slice(0, 3),
      recentDividends: dividends.slice(0, 3),
      capitalFlowTodayEst: capitalFlowToday || null,
    },
    recentAnnouncements: announcements.slice(0, 6).map((a) => ({
      date: a.publishedAt,
      title: a.title,
      sentiment: a.sentimentLabel,
    })),
    quantScores: {
      longTermTotal: scores.longTerm.total,
      longTermGrade: scores.longTerm.grade,
      shortTermTotal: scores.shortTerm.total,
      shortTermGrade: scores.shortTerm.grade,
    },
  };

  const systemInstruction = `你是China Stock Intelligence V3.0系统的多角色A股投研团队。
严格遵守事实与证据红线：
1. 严禁编造任何未提供的实时价格、主力资金流向、未披露财报或公告。缺少的字段必须写入 missingData。
2. 必须严格区分五类信息：真实采集数据(collectedDataRefs)、系统计算结果(computedMetrics)、分析师观点(analystView)、AI推断(aiInference)、未来预测(futureOutlook)。
3. 长期投资结论与短线交易结论必须分开独立评估。
4. 默认A股普通标的以做多/持有/观望为主，不得假定所有股票可融券做空。
5. 必须仅返回纯JSON格式对象（不要附带任何Markdown代码块说明文字），结构如下：
{
  "roleOutputs": [
    {
      "roleName": "基本面研究员 | 技术分析师 | 行业研究员 | 资金分析师 | 市场情绪分析师 | 宏观经济分析师 | 估值分析师 | 风险控制分析师 | 首席投资研究员（共9个独立对象）",
      "collectedDataRefs": ["引用的真实采集数据"],
      "computedMetrics": ["引用的系统计算指标"],
      "analystView": "基于事实的专业判断",
      "aiInference": "明确标注为AI逻辑推断的内容",
      "futureOutlook": "情景推演与概率边界（不作保证）",
      "missingData": ["明确缺失的数据项"]
    }
  ],
  "chiefConclusion": {
    "longTermThesis": "长期价值投资核心结论",
    "shortTermThesis": "短线/波段交易核心结论",
    "conflictsIdentified": ["各角色之间的分析分歧点"],
    "evidenceStrength": "当前证据强弱评价（强/中/弱及原因）",
    "finalStance": "综合立场（如：长期观察+短线观望）",
    "keyRisks": ["核心风险点"],
    "uncertainties": ["主要不确定性"]
  }
}`;

  const prompt = `请基于以下真实采集并经系统量化计算的A股标的档案，完成9位独立AI投研角色的深度研究分析（roleOutputs数组必须恰好包含：基本面研究员、技术分析师、行业研究员、资金分析师、市场情绪分析师、宏观经济分析师、估值分析师、风险控制分析师、首席投资研究员），并由首席投资研究员汇总冲突与最终结论：\n${JSON.stringify(
    evidencePayload,
    null,
    2
  )}`;

  let rawText = '';
  let usedModel = 'gemini-4-hydrogen';
  const useCustomCompatible =
    (userModelConfig?.providerType === 'openai_compatible' || userModelConfig?.providerType === 'deepseek') &&
    Boolean(userModelConfig.apiKeyPlain);

  if (useCustomCompatible && userModelConfig?.apiKeyPlain) {
    usedModel = userModelConfig.modelName || 'deepseek-chat';
    const endpoint = normalizeChatCompletionsEndpoint(userModelConfig.baseUrl);
    const isReasoner = usedModel.toLowerCase().includes('reasoner');

    const reqBody: Record<string, any> = {
      model: usedModel,
      messages: [
        { role: 'system', content: systemInstruction },
        { role: 'user', content: prompt },
      ],
    };
    if (!isReasoner) {
      reqBody.temperature = userModelConfig.temperature ?? 0.2;
      reqBody.response_format = { type: 'json_object' };
    }

    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${userModelConfig.apiKeyPlain}`,
      },
      body: JSON.stringify(reqBody),
      signal: AbortSignal.timeout(90000),
    });
    if (!resp.ok) {
      const errTxt = await resp.text();
      throw new Error(`AI接口调用失败 (HTTP ${resp.status}): ${errTxt.slice(0, 260)}`);
    }
    const data: any = await resp.json();
    rawText = data?.choices?.[0]?.message?.content || '';
  } else {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('未检测到服务端 GEMINI_API_KEY，请在页面上方设置您的 DeepSeek API Key 后重试。');
    }
    usedModel = userModelConfig?.modelName && userModelConfig.providerType === 'gemini'
      ? userModelConfig.modelName
      : 'gemini-4-hydrogen';
    const ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
    const response = await ai.models.generateContent({
      model: usedModel,
      contents: prompt,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
      },
    });
    rawText = response.text || '';
  }

  const parsed = extractJsonObject(rawText);
  return {
    llmModelUsed: usedModel,
    roleOutputs: Array.isArray(parsed.roleOutputs) ? parsed.roleOutputs : [],
    chiefConclusion: parsed.chiefConclusion || {
      longTermThesis: 'AI返回格式缺少首席长线总结',
      shortTermThesis: 'AI返回格式缺少首席短线总结',
      conflictsIdentified: [],
      evidenceStrength: '中',
      finalStance: '观望',
      keyRisks: [],
      uncertainties: [],
    },
  };
}
