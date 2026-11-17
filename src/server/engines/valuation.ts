export interface FinancialPeriod {
  reportDate: string;
  reportType: string;
  revenue: number | null;
  revenueYoy: number | null;
  netProfit: number | null;
  netProfitYoy: number | null;
  deductedNetProfit: number | null;
  grossMargin: number | null;
  netMargin: number | null;
  roe: number | null;
  roic: number | null;
  eps: number | null;
  operatingCashFlow: number | null;
  debtToAssetRatio: number | null;
  accountsReceivable: number | null;
  inventory: number | null;
  goodwill: number | null;
  monetaryFunds?: number | null;
  totalAssets?: number | null;
  totalLiabilities?: number | null;
  currentRatio: number | null;
  cashFlowToNetProfit: number | null;
}

export interface ValuationScenario {
  label: '乐观情景' | '中性情景' | '悲观情景';
  targetPrice: number | null;
  upsidePct: number | null;
  assumptions: string;
  basis: string;
}

export interface ValuationAndQualityOutput {
  currentPrice: number | null;
  peTtm: number | null;
  pb: number | null;
  ps: number | null;
  psBasis: string | null;
  peg: number | null;
  enterpriseValueApprox: number | null;
  evEbitda: number | null;
  dividendYield: number | null;
  pePercentile: number | null;
  marginOfSafetyPct: number | null;
  scenarios: ValuationScenario[];
  anomalies: string[];
  qualityEvaluation: string;
  growthEvaluation: string;
  financialHealthEvaluation: string;
  valuationEvaluation: string;
  missingFields: string[];
}

export function evaluateFundamentalsAndValuation(params: {
  price: number | null;
  peTtm: number | null;
  pb: number | null;
  totalMarketCap: number | null;
  dividendYield: number | null;
  financials: FinancialPeriod[];
  annualFinancials?: FinancialPeriod[];
  historicalCloses?: number[];
}): ValuationAndQualityOutput {
  const {
    price,
    peTtm,
    pb,
    totalMarketCap,
    dividendYield,
    financials,
    annualFinancials = [],
    historicalCloses,
  } = params;
  const missingFields: string[] = [];
  const anomalies: string[] = [];

  const latest = financials[0] || annualFinancials[0] || null;
  const annuals =
    annualFinancials.length > 0
      ? annualFinancials
      : financials.filter((f) => f.reportType === '年报' || f.reportDate.endsWith('-12-31'));
  const latestAnnual = annuals[0] || null;

  // PS calculation: prefer latest full annual revenue; otherwise annualize latest quarterly revenue
  let ps: number | null = null;
  let psBasis: string | null = null;
  if (totalMarketCap && latestAnnual?.revenue && latestAnnual.revenue > 0) {
    ps = Number((totalMarketCap / latestAnnual.revenue).toFixed(2));
    psBasis = `基于最近完整年报(${latestAnnual.reportDate})营收计算`;
  } else if (totalMarketCap && latest?.revenue && latest.revenue > 0) {
    const mmdd = latest.reportDate.slice(5);
    const mult = mmdd === '03-31' ? 4 : mmdd === '06-30' ? 2 : mmdd === '09-30' ? 4 / 3 : 1;
    ps = Number((totalMarketCap / (latest.revenue * mult)).toFixed(2));
    psBasis = `基于${latest.reportDate}营收年化推算`;
  } else {
    missingFields.push('PS（缺少营收或总市值）');
  }

  // PEG
  let peg: number | null = null;
  const growthRef =
    latest?.netProfitYoy !== null && latest?.netProfitYoy !== undefined
      ? latest.netProfitYoy
      : latestAnnual?.netProfitYoy ?? null;
  if (peTtm && peTtm > 0 && growthRef && growthRef > 0) {
    peg = Number((peTtm / growthRef).toFixed(2));
  } else if (peTtm !== null && growthRef !== null && growthRef <= 0) {
    missingFields.push(`PEG（最新净利同比 ${growthRef.toFixed(1)}% ≤ 0，PEG指标不适用）`);
  } else {
    missingFields.push('PEG（缺少PE或净利增速）');
  }

  // Approximate Enterprise Value when balance sheet is available
  let enterpriseValueApprox: number | null = null;
  const bsRef = latest?.totalLiabilities !== undefined && latest?.totalLiabilities !== null ? latest : latestAnnual;
  if (
    totalMarketCap &&
    bsRef?.totalLiabilities !== null &&
    bsRef?.totalLiabilities !== undefined &&
    bsRef?.monetaryFunds !== null &&
    bsRef?.monetaryFunds !== undefined
  ) {
    enterpriseValueApprox = Math.max(0, totalMarketCap + bsRef.totalLiabilities - bsRef.monetaryFunds);
  }
  const evEbitda: number | null = null;

  // Historical price percentile
  let pePercentile: number | null = null;
  if (price && historicalCloses && historicalCloses.length >= 60) {
    const sorted = [...historicalCloses].sort((a, b) => a - b);
    const belowCount = sorted.filter((c) => c <= price).length;
    pePercentile = Number(((belowCount / sorted.length) * 100).toFixed(1));
  } else {
    missingFields.push('价格历史分位（当前K线周期样本不足60根）');
  }

  // Financial Anomalies
  if (latest) {
    if (
      latest.netProfit !== null &&
      latest.netProfit > 0 &&
      latest.operatingCashFlow !== null &&
      latest.operatingCashFlow < latest.netProfit * 0.5
    ) {
      anomalies.push(
        `利润与现金流背离：经营性现金流仅占净利润 ${((latest.operatingCashFlow / latest.netProfit) * 100).toFixed(1)}%`
      );
    }
    if (latest.debtToAssetRatio !== null && latest.debtToAssetRatio > 70) {
      anomalies.push(`资产负债率偏高：${latest.debtToAssetRatio.toFixed(1)}%（>70%警戒线）`);
    }
    if (
      latest.revenueYoy !== null &&
      latest.netProfitYoy !== null &&
      latest.revenueYoy < 0 &&
      latest.netProfitYoy < -15
    ) {
      anomalies.push(
        `营收与利润双降：营收同比 ${latest.revenueYoy.toFixed(1)}%，净利润同比 ${latest.netProfitYoy.toFixed(1)}%`
      );
    }
    if (latest.deductedNetProfit !== null && latest.netProfit !== null && latest.netProfit > 0) {
      const ratio = latest.deductedNetProfit / latest.netProfit;
      if (ratio < 0.7) {
        anomalies.push(`扣非净利润占净利润比例偏低 (${(ratio * 100).toFixed(1)}%)，非经常性损益影响较大`);
      }
    }
    if (
      latest.accountsReceivable !== null &&
      latest.revenue !== null &&
      latest.revenue > 0 &&
      latest.accountsReceivable / latest.revenue > 0.45
    ) {
      anomalies.push(
        `应收账款占营收比偏高 (${((latest.accountsReceivable / latest.revenue) * 100).toFixed(1)}%)，需关注回款周期与坏账风险`
      );
    }
    if (
      latest.goodwill !== null &&
      latest.goodwill > 0 &&
      latest.totalAssets &&
      latest.totalLiabilities !== null &&
      latest.totalLiabilities !== undefined
    ) {
      const equity = latest.totalAssets - latest.totalLiabilities;
      if (equity > 0 && latest.goodwill / equity > 0.2) {
        anomalies.push(
          `商誉占归母/净资产比达到 ${((latest.goodwill / equity) * 100).toFixed(1)}%，存在商誉减值风险`
        );
      }
    }
  } else {
    missingFields.push('近期财务报表数据');
  }

  // Three-scenario valuation (PE blend when EPS > 0)
  const epsRef = latestAnnual?.eps ?? latest?.eps ?? null;
  const scenarios: ValuationScenario[] = [];
  let marginOfSafetyPct: number | null = null;

  if (price && epsRef && epsRef > 0) {
    const basePe = peTtm && peTtm > 0 ? Math.min(Math.max(peTtm, 10), 45) : 18;
    const g = growthRef !== null ? Math.min(Math.max(growthRef / 100, -0.1), 0.3) : 0.08;

    const optTarget = Number((epsRef * (1 + Math.max(g + 0.05, 0.12)) * (basePe * 1.15)).toFixed(2));
    const neuTarget = Number((epsRef * (1 + Math.max(g, 0.05)) * basePe).toFixed(2));
    const pesTarget = Number((epsRef * (1 + Math.min(g - 0.05, 0)) * (basePe * 0.8)).toFixed(2));

    marginOfSafetyPct = Number((((neuTarget - price) / neuTarget) * 100).toFixed(2));

    scenarios.push(
      {
        label: '乐观情景',
        targetPrice: optTarget,
        upsidePct: Number((((optTarget - price) / price) * 100).toFixed(2)),
        assumptions: `假设未来12个月EPS增长 ${(Math.max(g + 0.05, 0.12) * 100).toFixed(1)}%，估值倍数扩张至 ${(basePe * 1.15).toFixed(1)}x PE`,
        basis: `基准EPS=${epsRef.toFixed(3)}元 (${latestAnnual ? latestAnnual.reportDate + '年报' : latest?.reportDate})`,
      },
      {
        label: '中性情景',
        targetPrice: neuTarget,
        upsidePct: Number((((neuTarget - price) / price) * 100).toFixed(2)),
        assumptions: `假设未来12个月EPS增长 ${(Math.max(g, 0.05) * 100).toFixed(1)}%，维持合理估值倍数 ${basePe.toFixed(1)}x PE`,
        basis: `基准EPS=${epsRef.toFixed(3)}元，中性盈利延续测算`,
      },
      {
        label: '悲观情景',
        targetPrice: pesTarget,
        upsidePct: Number((((pesTarget - price) / price) * 100).toFixed(2)),
        assumptions: `假设盈利放缓至 ${(Math.min(g - 0.05, 0) * 100).toFixed(1)}%，估值回调至 ${(basePe * 0.8).toFixed(1)}x PE`,
        basis: `基准EPS=${epsRef.toFixed(3)}元，防范戴维斯双杀折价`,
      }
    );
  } else {
    scenarios.push(
      {
        label: '乐观情景',
        targetPrice: null,
        upsidePct: null,
        assumptions: '当前EPS为负或财务数据缺失，PE情景估值不适用',
        basis: '需改用PB/PS或待盈利转正后再评估',
      },
      {
        label: '中性情景',
        targetPrice: null,
        upsidePct: null,
        assumptions: '当前EPS为负或财务数据缺失，PE情景估值不适用',
        basis: '避免无盈利基础强行估算目标价',
      },
      {
        label: '悲观情景',
        targetPrice: null,
        upsidePct: null,
        assumptions: '当前EPS为负或财务数据缺失，PE情景估值不适用',
        basis: '建议关注净资产安全边际与现金流底线',
      }
    );
  }

  const roe = latest?.roe ?? latestAnnual?.roe ?? null;
  const gm = latest?.grossMargin ?? latestAnnual?.grossMargin ?? null;
  const qualityEvaluation =
    roe !== null && roe >= 15 && (gm === null || gm >= 25)
      ? `盈利质量优良（ROE ${roe.toFixed(1)}%${gm !== null ? `，毛利率 ${gm.toFixed(1)}%` : ''}）`
      : roe !== null
      ? `盈利能力一般（ROE ${roe.toFixed(1)}%${gm !== null ? `，毛利率 ${gm.toFixed(1)}%` : ''}）`
      : '缺少ROE/毛利率数据，无法完整评估商业质量';

  const growthEvaluation =
    latest?.revenueYoy !== null && latest?.netProfitYoy !== null
      ? `最新报告期(${latest.reportDate})营收同比 ${latest.revenueYoy.toFixed(1)}%，净利润同比 ${latest.netProfitYoy.toFixed(1)}%`
      : '缺少最新同比增速数据';

  const financialHealthEvaluation =
    anomalies.length === 0
      ? '资产负债表、应收存货与经营性现金流匹配度良好，未见显著红旗异常'
      : `检测到 ${anomalies.length} 项财务预警信号，需重点核查财报附注`;

  const valuationEvaluation =
    peTtm !== null
      ? `当前PE(TTM) ${peTtm.toFixed(2)}x${pb !== null ? `，PB ${pb.toFixed(2)}x` : ''}${
          ps !== null ? `，PS ${ps.toFixed(2)}x` : ''
        }${dividendYield !== null ? `，股息率 ${dividendYield.toFixed(2)}%` : ''}${
          marginOfSafetyPct !== null ? `，中性情景安全边际 ${marginOfSafetyPct.toFixed(1)}%` : ''
        }`
      : '当前估值倍数缺失或为负';

  return {
    currentPrice: price,
    peTtm,
    pb,
    ps,
    psBasis,
    peg,
    enterpriseValueApprox,
    evEbitda,
    dividendYield,
    pePercentile,
    marginOfSafetyPct,
    scenarios,
    anomalies,
    qualityEvaluation,
    growthEvaluation,
    financialHealthEvaluation,
    valuationEvaluation,
    missingFields,
  };
}
