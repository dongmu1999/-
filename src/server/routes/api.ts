import { Router } from 'express';
import { db } from '../../db/index.ts';
import {
  aiAnalysis,
  aiPredictions,
  aiScores,
  alertEvents,
  alertRules,
  analysisReports,
  auditLogs,
  backtestResults,
  dataQualityLogs,
  dataSources,
  modelVersions,
  stockScreens,
  tradingPlans,
  tradingRules,
  userWatchlists,
  users,
} from '../../db/schema.ts';
import { and, desc, eq } from 'drizzle-orm';
import { AuthRequest, requireAuth } from '../../middleware/auth.ts';
import { decryptApiKey, encryptApiKey } from '../crypto.ts';
import {
  fetchCapitalFlow,
  fetchComparablePeers,
  fetchDragonTigerList,
  fetchMacroIndicators,
  fetchMarketOverviewAndSentiment,
  fetchStockAnnouncements,
  fetchStockFundamentalsAndFinancials,
  fetchStockOhlcv,
  fetchStockQuote,
  getCachedMarketOverviewAndSentiment,
  searchAStocks,
  seedDataSourcesRegistry,
} from '../adapters/aShareMarket.ts';
import { computeTechnicalIndicators } from '../engines/indicators.ts';
import { evaluateFundamentalsAndValuation } from '../engines/valuation.ts';
import { evaluateTradingRule, seedDefaultTradingRules } from '../engines/tradingRules.ts';
import {
  buildRiskAwareTradingPlan,
  computeDualTrackScores,
  runMultiRoleAiResearch,
  seedDefaultModelVersion,
  testAiModelConnection,
} from '../engines/aiAgents.ts';
import { BacktestStrategyType, runAShareBacktest } from '../engines/backtest.ts';
import {
  CuratedSelectionResult,
  getCuratedFilterCatalog,
  runCuratedAiDeepReport,
  runCuratedStockSelection,
} from '../engines/curatedSelection.ts';

export const apiRouter = Router();

let seedPromise: Promise<void> | null = null;
async function ensureSeeded() {
  if (!seedPromise) {
    seedPromise = (async () => {
      await seedDefaultTradingRules();
      await seedDataSourcesRegistry();
      await seedDefaultModelVersion();
    })().catch((err) => {
      seedPromise = null;
      throw err;
    });
  }
  return seedPromise;
}

// Health check
apiRouter.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'China Stock Intelligence V3.0', timestamp: new Date().toISOString() });
});

// ==================== PUBLIC LIVE MARKET ADAPTERS (NO DB ACCESS) ====================

apiRouter.get('/market/overview', async (_req, res) => {
  try {
    const data = await fetchMarketOverviewAndSentiment();
    res.json(data);
  } catch (err: any) {
    res.status(502).json({ error: `行情总览接口暂不可用: ${err.message}` });
  }
});

apiRouter.get('/market/dragon-tiger', async (_req, res) => {
  try {
    const data = await fetchDragonTigerList();
    res.json(data);
  } catch (err: any) {
    res.status(502).json({ error: `龙虎榜数据获取失败: ${err.message}` });
  }
});

apiRouter.get('/market/macro', async (_req, res) => {
  try {
    const items = await fetchMacroIndicators();
    res.json({ items, collectedAt: new Date().toISOString() });
  } catch (err: any) {
    res.status(502).json({ error: `宏观数据获取失败: ${err.message}` });
  }
});

apiRouter.get('/stocks/search', async (req, res) => {
  try {
    const q = String(req.query.q || '');
    const board = req.query.board ? String(req.query.board) : undefined;
    const data = await searchAStocks(q, board);
    res.json(data);
  } catch (err: any) {
    res.status(502).json({ error: `股票检索失败: ${err.message}` });
  }
});

// ==================== CURATED QUALITY STOCKS SCREENER & AI REPORT ====================

apiRouter.get('/curated/filters', async (_req, res) => {
  try {
    const catalog = await getCuratedFilterCatalog();
    res.json(catalog);
  } catch (err: any) {
    res.status(502).json({ error: `行业与概念目录获取失败: ${err.message}` });
  }
});

apiRouter.post('/curated/screen', async (req, res) => {
  try {
    const b = req.body || {};
    const optNum = (v: unknown) =>
      v !== undefined && v !== null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : undefined;

    const result = await runCuratedStockSelection({
      targetCount: optNum(b.targetCount) ?? 5,
      boardFilter: b.boardFilter || '全部',
      stylePreference: b.stylePreference || '均衡优质',
      industryNode: b.industryNode ? String(b.industryNode) : undefined,
      industryName: b.industryName ? String(b.industryName) : undefined,
      conceptNode: b.conceptNode ? String(b.conceptNode) : undefined,
      conceptName: b.conceptName ? String(b.conceptName) : undefined,
      minPrice: optNum(b.minPrice),
      maxPrice: optNum(b.maxPrice),
      minRoePct: optNum(b.minRoePct),
      maxPe: optNum(b.maxPe),
      maxPb: optNum(b.maxPb),
      minMarketCapYi: optNum(b.minMarketCapYi),
      maxMarketCapYi: optNum(b.maxMarketCapYi),
      minDividendYield: optNum(b.minDividendYield),
      minRevYoyPct: optNum(b.minRevYoyPct),
      minProfitYoyPct: optNum(b.minProfitYoyPct),
      minGrossMarginPct: optNum(b.minGrossMarginPct),
      maxDebtRatioPct: optNum(b.maxDebtRatioPct),
      onlyBuyZone: Boolean(b.onlyBuyZone),
    });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: `全市场精选筛选执行失败: ${err.message}` });
  }
});

apiRouter.post('/curated/ai-report', requireAuth, async (req: AuthRequest, res) => {
  try {
    const selection = req.body?.selection as CuratedSelectionResult | undefined;
    if (!selection || !Array.isArray(selection.candidates) || selection.candidates.length === 0) {
      return res.status(400).json({ error: '请先执行全市场精选筛选，获取真实候选股数据后再调用AI深度报告。' });
    }
    const userRows = await db.select().from(users).where(eq(users.id, req.dbUserId!)).limit(1);
    const u = userRows[0];
    let apiKeyPlain: string | null = null;
    if (u?.aiApiKeyEncrypted) {
      try {
        apiKeyPlain = decryptApiKey(u.aiApiKeyEncrypted);
      } catch {
        apiKeyPlain = null;
      }
    }

    const report = await runCuratedAiDeepReport({
      selection,
      userModelConfig: {
        providerType: u?.aiProviderType || 'gemini',
        baseUrl: u?.aiBaseUrl,
        modelName: u?.aiModelName,
        apiKeyPlain,
        temperature: u?.aiTemperature,
      },
    });

    res.json(report);
  } catch (err: any) {
    res.status(500).json({ error: `AI专家研报生成失败: ${err.message}` });
  }
});

apiRouter.get('/stocks/:symbol/research', async (req, res) => {
  try {
    const symbol = String(req.params.symbol || '').replace(/[^0-9]/g, '').slice(0, 6);
    if (!/^\d{6}$/.test(symbol)) {
      return res.status(400).json({ error: '请输入有效的6位A股代码（如 600519、000001、300750、688981、830799）' });
    }
    const timeframe = (String(req.query.timeframe || 'day') as any) || 'day';

    const [quote, klineRes, dayKlineRes, finRes, annRes, capRes, marketSnap] = await Promise.all([
      fetchStockQuote(symbol),
      fetchStockOhlcv(symbol, timeframe, 260),
      timeframe === 'day' ? Promise.resolve(null) : fetchStockOhlcv(symbol, 'day', 260),
      fetchStockFundamentalsAndFinancials(symbol),
      fetchStockAnnouncements(symbol),
      fetchCapitalFlow(symbol),
      getCachedMarketOverviewAndSentiment().catch(() => null),
    ]);

    if (!quote) {
      return res.status(404).json({ error: `未找到代码 ${symbol} 的有效A股行情数据` });
    }

    const dailyBars = timeframe === 'day' ? klineRes.bars : dayKlineRes?.bars || [];
    if (dailyBars.length > 0) {
      const trailingYear = dailyBars.slice(-250);
      if (quote.high52w === null) {
        quote.high52w = Number(Math.max(...trailingYear.map((b) => b.high)).toFixed(2));
      }
      if (quote.low52w === null) {
        quote.low52w = Number(Math.min(...trailingYear.map((b) => b.low)).toFixed(2));
      }
      if (quote.provenance?.missingFields) {
        quote.provenance.missingFields = quote.provenance.missingFields.filter(
          (m: string) => m !== '52周高点' && m !== '52周低点'
        );
      }
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

    const technicals = computeTechnicalIndicators(klineRes.bars);
    const financialsAll = finRes.quarterlyFinancials.length
      ? finRes.quarterlyFinancials
      : finRes.annualFinancials;

    const valuation = evaluateFundamentalsAndValuation({
      price: quote.price,
      peTtm: quote.peTtm,
      pb: quote.pb,
      totalMarketCap: quote.totalMarketCap,
      dividendYield: quote.dividendYield,
      financials: financialsAll,
      annualFinancials: finRes.annualFinancials,
      historicalCloses: dailyBars.length ? dailyBars.map((b) => b.close) : klineRes.bars.map((b) => b.close),
    });

    const industryName = quote.industry || finRes.profile?.industry || null;
    const peers = await fetchComparablePeers(symbol, industryName);
    const cleanInd = (industryName || '').replace(/行业|板块/g, '');
    const matchedIndBoard = cleanInd
      ? (marketSnap?.industries || []).find(
          (b: any) => b.name && (b.name.includes(cleanInd) || cleanInd.includes(b.name))
        )
      : null;

    const scores = computeDualTrackScores({
      quote,
      tech: technicals,
      valuation,
      financials: financialsAll,
      annualFinancials: finRes.annualFinancials,
      profile: finRes.profile,
      peers,
      shareholderNumbers: finRes.shareholderNumbers,
      institutionalHoldings: finRes.institutionalHoldings,
      dividends: finRes.dividends,
      stockDragonTiger: finRes.stockDragonTiger,
      announcements: annRes.items,
      marketSentimentScore: marketSnap?.sentiment?.sentimentScore ?? null,
      marketSentimentPhase: marketSnap?.sentiment?.phaseLabel ?? null,
      marketBreadth: marketSnap?.breadth ?? null,
      industryBoard: matchedIndBoard,
      capitalFlowToday: capRes.todaySnapshot,
      capitalFlowSeries: capRes.series,
    });

    res.json({
      quote,
      tradingRule: {
        ...rule,
        limitUpPriceValue: quote.prevClose ? rule.limitUpPrice(quote.prevClose) : null,
        limitDownPriceValue: quote.prevClose ? rule.limitDownPrice(quote.prevClose) : null,
      },
      ohlcv: klineRes.bars,
      ohlcvProvenance: klineRes.provenance,
      technicals,
      profile: finRes.profile,
      annualFinancials: finRes.annualFinancials,
      quarterlyFinancials: finRes.quarterlyFinancials,
      shareholderNumbers: finRes.shareholderNumbers,
      institutionalHoldings: finRes.institutionalHoldings,
      dividends: finRes.dividends,
      stockDragonTiger: finRes.stockDragonTiger,
      marketContext: marketSnap
        ? {
            sentiment: marketSnap.sentiment,
            industryBoard: matchedIndBoard,
          }
        : null,
      financialProvenance: finRes.provenance,
      valuation,
      announcements: annRes.items,
      announcementsProvenance: annRes.provenance,
      capitalFlow: capRes,
      peers,
      scores,
    });
  } catch (err: any) {
    res.status(500).json({ error: `个股深度研究数据获取异常: ${err.message}` });
  }
});

// ==================== AUTHENTICATED PERSONAL WORKSPACE & DB ROUTES ====================

apiRouter.get('/user/settings', requireAuth, async (req: AuthRequest, res) => {
  try {
    await ensureSeeded();
    const rows = await db.select().from(users).where(eq(users.id, req.dbUserId!)).limit(1);
    const u = rows[0];
    if (!u) return res.status(404).json({ error: '用户记录不存在' });
    res.json({
      uid: u.uid,
      email: u.email,
      displayName: u.displayName,
      aiProviderType: u.aiProviderType,
      aiBaseUrl: u.aiBaseUrl,
      aiModelName: u.aiModelName,
      aiApiKeyConfigured: Boolean(u.aiApiKeyEncrypted),
      aiApiKeyLast4: u.aiApiKeyLast4,
      aiTemperature: u.aiTemperature,
      totalCapital: u.totalCapital,
      maxSingleLossPct: u.maxSingleLossPct,
      maxPositionPerStockPct: u.maxPositionPerStockPct,
      maxTotalExposurePct: u.maxTotalExposurePct,
      maxDrawdownLimitPct: u.maxDrawdownLimitPct,
      dailyLossLimitPct: u.dailyLossLimitPct,
      defaultTradingStyle: u.defaultTradingStyle,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.put('/user/settings', requireAuth, async (req: AuthRequest, res) => {
  try {
    const body = req.body || {};
    const updateData: Record<string, any> = { updatedAt: new Date() };
    if (body.aiProviderType) updateData.aiProviderType = String(body.aiProviderType);
    if (body.aiBaseUrl !== undefined) updateData.aiBaseUrl = body.aiBaseUrl ? String(body.aiBaseUrl) : null;
    if (body.aiModelName !== undefined) updateData.aiModelName = body.aiModelName ? String(body.aiModelName) : 'gemini-4-hydrogen';
    if (typeof body.aiTemperature === 'number') updateData.aiTemperature = body.aiTemperature;
    if (body.aiApiKeyPlain && String(body.aiApiKeyPlain).trim().length > 4) {
      const { encrypted, last4 } = encryptApiKey(String(body.aiApiKeyPlain).trim());
      updateData.aiApiKeyEncrypted = encrypted;
      updateData.aiApiKeyLast4 = last4;
    }
    if (body.clearCustomApiKey) {
      updateData.aiApiKeyEncrypted = null;
      updateData.aiApiKeyLast4 = null;
    }
    if (typeof body.totalCapital === 'number') updateData.totalCapital = Math.max(10000, body.totalCapital);
    if (typeof body.maxSingleLossPct === 'number') updateData.maxSingleLossPct = Math.min(20, Math.max(0.2, body.maxSingleLossPct));
    if (typeof body.maxPositionPerStockPct === 'number') updateData.maxPositionPerStockPct = Math.min(100, Math.max(1, body.maxPositionPerStockPct));
    if (typeof body.maxTotalExposurePct === 'number') updateData.maxTotalExposurePct = Math.min(100, Math.max(0, body.maxTotalExposurePct));
    if (typeof body.maxDrawdownLimitPct === 'number') updateData.maxDrawdownLimitPct = Math.min(50, Math.max(1, body.maxDrawdownLimitPct));
    if (typeof body.dailyLossLimitPct === 'number') updateData.dailyLossLimitPct = Math.min(20, Math.max(0.5, body.dailyLossLimitPct));
    if (body.defaultTradingStyle) updateData.defaultTradingStyle = String(body.defaultTradingStyle);

    await db.update(users).set(updateData).where(eq(users.id, req.dbUserId!));
    await db.insert(auditLogs).values({
      userId: req.dbUserId!,
      action: 'UPDATE_USER_SETTINGS',
      target: 'users',
      details: { updatedFields: Object.keys(updateData).filter((k) => k !== 'aiApiKeyEncrypted') },
    });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/user/test-ai', requireAuth, async (req: AuthRequest, res) => {
  try {
    const body = req.body || {};
    const rows = await db.select().from(users).where(eq(users.id, req.dbUserId!)).limit(1);
    const u = rows[0];

    const providerType = String(body.aiProviderType || u?.aiProviderType || 'gemini');
    const baseUrl = body.aiBaseUrl !== undefined ? body.aiBaseUrl : u?.aiBaseUrl;
    const modelName = body.aiModelName !== undefined ? body.aiModelName : u?.aiModelName;
    let apiKeyPlain: string | null =
      body.aiApiKeyPlain && String(body.aiApiKeyPlain).trim().length > 4
        ? String(body.aiApiKeyPlain).trim()
        : null;

    if (!apiKeyPlain && u?.aiApiKeyEncrypted) {
      try {
        apiKeyPlain = decryptApiKey(u.aiApiKeyEncrypted);
      } catch {
        apiKeyPlain = null;
      }
    }

    const result = await testAiModelConnection({
      providerType,
      baseUrl,
      modelName,
      apiKeyPlain,
    });
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

// Watchlists
apiRouter.get('/watchlists', requireAuth, async (req: AuthRequest, res) => {
  try {
    const rows = await db
      .select()
      .from(userWatchlists)
      .where(eq(userWatchlists.userId, req.dbUserId!))
      .orderBy(desc(userWatchlists.createdAt));

    // Enrich with live quotes
    const enriched = await Promise.all(
      rows.map(async (w) => {
        try {
          const q = await fetchStockQuote(w.symbol);
          return { ...w, quote: q };
        } catch {
          return { ...w, quote: null };
        }
      })
    );
    res.json({ items: enriched });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/watchlists', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { symbol, stockName, groupName, notes, targetBuyPrice, stopLossPrice } = req.body || {};
    const clean = String(symbol || '').replace(/[^0-9]/g, '').slice(0, 6);
    if (!/^\d{6}$/.test(clean)) return res.status(400).json({ error: '无效的股票代码' });

    const [row] = await db
      .insert(userWatchlists)
      .values({
        userId: req.dbUserId!,
        symbol: clean,
        stockName: String(stockName || clean),
        groupName: String(groupName || '核心观察池'),
        notes: notes ? String(notes) : null,
        targetBuyPrice: typeof targetBuyPrice === 'number' ? targetBuyPrice : null,
        stopLossPrice: typeof stopLossPrice === 'number' ? stopLossPrice : null,
      })
      .onConflictDoUpdate({
        target: [userWatchlists.userId, userWatchlists.symbol],
        set: {
          groupName: String(groupName || '核心观察池'),
          notes: notes ? String(notes) : null,
          targetBuyPrice: typeof targetBuyPrice === 'number' ? targetBuyPrice : null,
          stopLossPrice: typeof stopLossPrice === 'number' ? stopLossPrice : null,
        },
      })
      .returning();

    res.json({ item: row });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.delete('/watchlists/:symbol', requireAuth, async (req: AuthRequest, res) => {
  try {
    const clean = String(req.params.symbol || '').replace(/[^0-9]/g, '').slice(0, 6);
    await db
      .delete(userWatchlists)
      .where(and(eq(userWatchlists.userId, req.dbUserId!), eq(userWatchlists.symbol, clean)));
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// AI Multi-Role Research & Auto-Save Prediction + Report + Trading Plan
apiRouter.post('/stocks/:symbol/ai-research', requireAuth, async (req: AuthRequest, res) => {
  try {
    await ensureSeeded();
    const symbol = String(req.params.symbol || '').replace(/[^0-9]/g, '').slice(0, 6);
    if (!/^\d{6}$/.test(symbol)) return res.status(400).json({ error: '无效的6位A股代码' });

    const tradingStyle = String(req.body?.tradingStyle || '波段');
    const userRows = await db.select().from(users).where(eq(users.id, req.dbUserId!)).limit(1);
    const u = userRows[0];

    let apiKeyPlain: string | null = null;
    if (u?.aiApiKeyEncrypted) {
      try {
        apiKeyPlain = decryptApiKey(u.aiApiKeyEncrypted);
      } catch {
        apiKeyPlain = null;
      }
    }

    const [quote, klineRes, finRes, annRes, capRes, marketSnap] = await Promise.all([
      fetchStockQuote(symbol),
      fetchStockOhlcv(symbol, 'day', 260),
      fetchStockFundamentalsAndFinancials(symbol),
      fetchStockAnnouncements(symbol),
      fetchCapitalFlow(symbol),
      getCachedMarketOverviewAndSentiment().catch(() => null),
    ]);

    if (!quote || !quote.price) {
      return res.status(404).json({ error: `无法获取 ${symbol} 的实时行情，终止AI研判以防止基于空数据编造` });
    }

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
    const financialsAll = finRes.quarterlyFinancials.length
      ? finRes.quarterlyFinancials
      : finRes.annualFinancials;
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

    const activeModels = await db
      .select()
      .from(modelVersions)
      .where(eq(modelVersions.isActive, true))
      .limit(1);
    const modelVerCode = activeModels[0]?.versionCode || 'CSI-V3.0-BASE';

    const industryName = quote.industry || finRes.profile?.industry || null;
    const peers = await fetchComparablePeers(symbol, industryName);
    const cleanInd = (industryName || '').replace(/行业|板块/g, '');
    const matchedIndBoard = cleanInd
      ? (marketSnap?.industries || []).find(
          (b: any) => b.name && (b.name.includes(cleanInd) || cleanInd.includes(b.name))
        )
      : null;

    const scores = computeDualTrackScores({
      quote,
      tech,
      valuation,
      financials: financialsAll,
      annualFinancials: finRes.annualFinancials,
      profile: finRes.profile,
      peers,
      shareholderNumbers: finRes.shareholderNumbers,
      institutionalHoldings: finRes.institutionalHoldings,
      dividends: finRes.dividends,
      stockDragonTiger: finRes.stockDragonTiger,
      announcements: annRes.items,
      marketSentimentScore: marketSnap?.sentiment?.sentimentScore ?? null,
      marketSentimentPhase: marketSnap?.sentiment?.phaseLabel ?? null,
      marketBreadth: marketSnap?.breadth ?? null,
      industryBoard: matchedIndBoard,
      capitalFlowToday: capRes.todaySnapshot,
      capitalFlowSeries: capRes.series,
      modelVersionCode: modelVerCode,
    });

    const plan = buildRiskAwareTradingPlan({
      symbol,
      stockName: quote.name,
      price: quote.price,
      tech,
      rule,
      scores,
      tradingStyle,
      riskSettings: {
        totalCapital: u?.totalCapital || 500000,
        maxSingleLossPct: u?.maxSingleLossPct || 2,
        maxPositionPerStockPct: u?.maxPositionPerStockPct || 20,
      },
    });

    const aiRes = await runMultiRoleAiResearch({
      quote,
      tech,
      valuation,
      financials: financialsAll,
      annualFinancials: finRes.annualFinancials,
      profile: finRes.profile,
      shareholderNumbers: finRes.shareholderNumbers,
      institutionalHoldings: finRes.institutionalHoldings,
      dividends: finRes.dividends,
      capitalFlowToday: capRes.todaySnapshot,
      announcements: annRes.items,
      rule,
      scores,
      userModelConfig: {
        providerType: u?.aiProviderType || 'gemini',
        baseUrl: u?.aiBaseUrl,
        modelName: u?.aiModelName,
        apiKeyPlain,
        temperature: u?.aiTemperature,
      },
    });

    // Persist AI Analysis, Scores, Prediction, Trading Plan, and Report
    const [savedAnalysis] = await db
      .insert(aiAnalysis)
      .values({
        userId: req.dbUserId!,
        symbol,
        modelVersion: modelVerCode,
        llmModelUsed: aiRes.llmModelUsed,
        roleOutputs: aiRes.roleOutputs,
        chiefConclusion: aiRes.chiefConclusion,
        conflictsIdentified: aiRes.chiefConclusion.conflictsIdentified,
        missingDataWarnings: valuation.missingFields,
      })
      .returning();

    await db.insert(aiScores).values({
      userId: req.dbUserId!,
      symbol,
      modelVersion: modelVerCode,
      longTermTotal: scores.longTerm.total,
      longTermGrade: scores.longTerm.grade,
      longTermBreakdown: scores.longTerm.dimensions,
      shortTermTotal: scores.shortTerm.total,
      shortTermGrade: scores.shortTerm.grade,
      shortTermBreakdown: scores.shortTerm.dimensions,
      dataSource: quote.provenance.dataSource,
    });

    const [savedPlan] = await db
      .insert(tradingPlans)
      .values({
        userId: req.dbUserId!,
        ...plan,
        userConfirmed: false,
      })
      .returning();

    const [savedPrediction] = await db
      .insert(aiPredictions)
      .values({
        userId: req.dbUserId!,
        symbol,
        stockName: quote.name,
        predictDate: quote.provenance.dataDate,
        basePrice: quote.price,
        longTermScore: scores.longTerm.total,
        shortTermScore: scores.shortTerm.total,
        stance: plan.stance,
        horizon: plan.holdingHorizon,
        targetPrice: plan.takeProfitTargets[0] ?? null,
        stopLossPrice: plan.stopLossPrice,
        evidenceSummary: `${aiRes.chiefConclusion.finalStance} | ${aiRes.chiefConclusion.evidenceStrength}`,
        modelVersion: modelVerCode,
        outcomeStatus: '跟踪中',
      })
      .returning();

    const reportMd = `# ${quote.name} (${symbol}) 智能投研与交易决策报告\n\n` +
      `- 生成时间：${new Date().toISOString()}\n- 模型版本：${modelVerCode} (${aiRes.llmModelUsed})\n- 数据来源：${quote.provenance.dataSource}（数据状态：${quote.provenance.dataStatus}）\n\n` +
      `## 一、双轨综合评分\n- 长期价值评分：**${scores.longTerm.total} / 100 (${scores.longTerm.grade})**\n- 短线交易评分：**${scores.shortTerm.total} / 100 (${scores.shortTerm.grade})**\n\n` +
      `## 二、首席研究员结论\n- 长期逻辑：${aiRes.chiefConclusion.longTermThesis}\n- 短线逻辑：${aiRes.chiefConclusion.shortTermThesis}\n- 观点分歧：${(aiRes.chiefConclusion.conflictsIdentified || []).join('；') || '无'}\n- 核心风险：${(aiRes.chiefConclusion.keyRisks || []).join('；')}\n\n` +
      `## 三、风控约束交易计划 (${plan.tradingStyle})\n- 当前立场：${plan.stance}\n- 建议入场区间：${plan.entryLow} ~ ${plan.entryHigh} 元\n- 止损价：${plan.stopLossPrice} 元\n- 分批止盈：${plan.takeProfitTargets.join(' / ')} 元\n- 风险预算仓位：${plan.suggestedShares} 股 (${plan.suggestedPositionPct}%)，最大单笔预计亏损：${plan.maxLossYuan} 元\n- 适用A股规则：${plan.applicableRuleSummary}\n\n` +
      `## 四、多角色研究明细\n` +
      aiRes.roleOutputs
        .map(
          (r) =>
            `### ${r.roleName}\n- **真实数据**：${r.collectedDataRefs.join('；')}\n- **系统计算**：${r.computedMetrics.join('；')}\n- **专业观点**：${r.analystView}\n- **AI推断**：${r.aiInference}\n- **未来推演**：${r.futureOutlook}\n- **缺失数据**：${r.missingData.join('；') || '无'}\n`
        )
        .join('\n');

    const [savedReport] = await db
      .insert(analysisReports)
      .values({
        userId: req.dbUserId!,
        symbol,
        stockName: quote.name,
        title: `${quote.name}(${symbol}) 深度研究报告 - ${quote.provenance.dataDate}`,
        reportMarkdown: reportMd,
        reportJson: { quote, scores, plan, aiRes, valuation, rule },
        modelVersion: modelVerCode,
      })
      .returning();

    await db.insert(auditLogs).values({
      userId: req.dbUserId!,
      action: 'RUN_MULTI_ROLE_AI_RESEARCH',
      target: symbol,
      details: { model: aiRes.llmModelUsed, longScore: scores.longTerm.total, shortScore: scores.shortTerm.total },
    });

    res.json({
      analysis: savedAnalysis,
      scores,
      plan: savedPlan,
      prediction: savedPrediction,
      report: savedReport,
      aiRes,
    });
  } catch (err: any) {
    res.status(500).json({ error: `AI多角色研究执行失败: ${err.message}` });
  }
});

// History & Reports & Confirm Trading Plan
apiRouter.get('/research/history', requireAuth, async (req: AuthRequest, res) => {
  try {
    const [reports, plans, analyses] = await Promise.all([
      db.select().from(analysisReports).where(eq(analysisReports.userId, req.dbUserId!)).orderBy(desc(analysisReports.createdAt)).limit(30),
      db.select().from(tradingPlans).where(eq(tradingPlans.userId, req.dbUserId!)).orderBy(desc(tradingPlans.createdAt)).limit(30),
      db.select().from(aiAnalysis).where(eq(aiAnalysis.userId, req.dbUserId!)).orderBy(desc(aiAnalysis.createdAt)).limit(20),
    ]);
    res.json({ reports, plans, analyses });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/trading-plans/:id/confirm', requireAuth, async (req: AuthRequest, res) => {
  try {
    const id = Number(req.params.id);
    await db
      .update(tradingPlans)
      .set({ userConfirmed: true })
      .where(and(eq(tradingPlans.id, id), eq(tradingPlans.userId, req.dbUserId!)));
    await db.insert(auditLogs).values({
      userId: req.dbUserId!,
      action: 'CONFIRM_TRADING_PLAN',
      target: String(id),
      details: { note: '用户手动确认研究交易计划（非自动下单）' },
    });
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Screener Execution (Real market scan + user filter rules)
apiRouter.post('/screener/run', requireAuth, async (req: AuthRequest, res) => {
  try {
    const cond = req.body?.conditions || {};
    const searchRes = await searchAStocks('', cond.board || '全部');
    const items = (searchRes.items || []).filter((s: any) => {
      if (cond.excludeSt && s.isSt) return false;
      if (typeof cond.minChangePct === 'number' && (s.changePct === null || s.changePct < cond.minChangePct)) return false;
      if (typeof cond.maxChangePct === 'number' && (s.changePct === null || s.changePct > cond.maxChangePct)) return false;
      if (typeof cond.minTurnover === 'number' && (s.turnoverRate === null || s.turnoverRate < cond.minTurnover)) return false;
      if (typeof cond.maxPe === 'number' && (s.peTtm === null || s.peTtm <= 0 || s.peTtm > cond.maxPe)) return false;
      if (typeof cond.maxPb === 'number' && (s.pb === null || s.pb <= 0 || s.pb > cond.maxPb)) return false;
      if (typeof cond.minMarketCapYi === 'number' && (s.totalMarketCap === null || s.totalMarketCap / 1e8 < cond.minMarketCapYi)) return false;
      return true;
    });

    if (req.body?.savePresetName) {
      await db.insert(stockScreens).values({
        userId: req.dbUserId!,
        name: String(req.body.savePresetName),
        conditionsJson: cond,
        lastRunCount: items.length,
        lastRunAt: new Date(),
      });
    }
    res.json({ items, totalScanned: searchRes.items.length, provenance: searchRes.provenance });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.get('/screener/presets', requireAuth, async (req: AuthRequest, res) => {
  try {
    const items = await db
      .select()
      .from(stockScreens)
      .where(eq(stockScreens.userId, req.dbUserId!))
      .orderBy(desc(stockScreens.createdAt));
    res.json({ items });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Backtest Execution & History
apiRouter.post('/backtests/run', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { symbol, strategyType, periodLabel, initialCapital, stopLossPct, takeProfitPct, slippageBps } = req.body || {};
    const clean = String(symbol || '').replace(/[^0-9]/g, '').slice(0, 6);
    if (!/^\d{6}$/.test(clean)) return res.status(400).json({ error: '无效的6位A股代码' });

    const [quote, klineRes] = await Promise.all([
      fetchStockQuote(clean),
      fetchStockOhlcv(clean, 'day', 1250),
    ]);
    if (!klineRes.bars || klineRes.bars.length < 40) {
      return res.status(400).json({ error: `股票 ${clean} 可获取历史日K线不足40根，无法完成有效回测` });
    }

    const result = runAShareBacktest(klineRes.bars, {
      symbol: clean,
      stockName: quote?.name || clean,
      strategyType: (strategyType || 'MA_CROSS') as BacktestStrategyType,
      periodLabel: (periodLabel || '1Y') as any,
      initialCapital: Number(initialCapital || 500000),
      stopLossPct: Number(stopLossPct || 8),
      takeProfitPct: Number(takeProfitPct || 20),
      slippageBps: Number(slippageBps || 10),
    });

    const [saved] = await db
      .insert(backtestResults)
      .values({
        userId: req.dbUserId!,
        symbol: clean,
        strategyType: String(strategyType || 'MA_CROSS'),
        periodLabel: String(periodLabel || '1Y'),
        paramsJson: { initialCapital, stopLossPct, takeProfitPct, slippageBps },
        totalReturnPct: result.totalReturnPct,
        annualReturnPct: result.annualReturnPct,
        benchmarkReturnPct: result.benchmarkReturnPct,
        winRatePct: result.winRatePct,
        profitLossRatio: result.profitLossRatio,
        maxDrawdownPct: result.maxDrawdownPct,
        sharpeRatio: result.sharpeRatio,
        tradeCount: result.tradeCount,
        avgHoldingDays: result.avgHoldingDays,
        maxSingleLossPct: result.maxSingleLossPct,
        equityCurve: result.equityCurve,
        tradesLog: result.tradesLog,
        complianceChecks: result.complianceChecks,
      })
      .returning();

    res.json({ backtest: saved, stockName: quote?.name || clean });
  } catch (err: any) {
    res.status(500).json({ error: `回测执行失败: ${err.message}` });
  }
});

apiRouter.get('/backtests', requireAuth, async (req: AuthRequest, res) => {
  try {
    const items = await db
      .select()
      .from(backtestResults)
      .where(eq(backtestResults.userId, req.dbUserId!))
      .orderBy(desc(backtestResults.createdAt))
      .limit(20);
    res.json({ items });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Predictions Tracking & Auto-Review
apiRouter.get('/predictions', requireAuth, async (req: AuthRequest, res) => {
  try {
    const items = await db
      .select()
      .from(aiPredictions)
      .where(eq(aiPredictions.userId, req.dbUserId!))
      .orderBy(desc(aiPredictions.predictTime))
      .limit(50);
    res.json({ items });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/predictions/track', requireAuth, async (req: AuthRequest, res) => {
  try {
    const preds = await db
      .select()
      .from(aiPredictions)
      .where(eq(aiPredictions.userId, req.dbUserId!))
      .orderBy(desc(aiPredictions.predictTime))
      .limit(30);

    let updatedCount = 0;
    for (const p of preds) {
      const kline = await fetchStockOhlcv(p.symbol, 'day', 120);
      const bars = kline.bars;
      const baseIdx = bars.findIndex((b) => b.time >= p.predictDate);
      if (baseIdx >= 0) {
        const calcRet = (offset: number) => {
          const idx = baseIdx + offset;
          if (idx < bars.length && p.basePrice > 0) {
            return Number((((bars[idx].close - p.basePrice) / p.basePrice) * 100).toFixed(2));
          }
          return null;
        };
        const r1 = calcRet(1);
        const r3 = calcRet(3);
        const r5 = calcRet(5);
        const r10 = calcRet(10);
        const r20 = calcRet(20);
        const latestRet = r20 ?? r10 ?? r5 ?? r3 ?? r1;
        let outcome = '跟踪中';
        if (latestRet !== null) {
          if (p.stance === '买入关注' || p.stance === '持有') {
            outcome = latestRet >= 3 ? '命中' : latestRet <= -5 ? '失效' : '跟踪中';
          } else if (p.stance === '减仓' || p.stance === '卖出') {
            outcome = latestRet <= -3 ? '命中' : latestRet >= 5 ? '失效' : '跟踪中';
          } else {
            outcome = '中性';
          }
        }
        await db
          .update(aiPredictions)
          .set({
            ret1d: r1,
            ret3d: r3,
            ret5d: r5,
            ret10d: r10,
            ret20d: r20,
            outcomeStatus: outcome,
            lastTrackedAt: new Date(),
          })
          .where(eq(aiPredictions.id, p.id));
        updatedCount++;
      }
    }

    const refreshed = await db
      .select()
      .from(aiPredictions)
      .where(eq(aiPredictions.userId, req.dbUserId!))
      .orderBy(desc(aiPredictions.predictTime))
      .limit(50);

    res.json({ updatedCount, items: refreshed });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Alerts Rules & Evaluation
apiRouter.get('/alerts', requireAuth, async (req: AuthRequest, res) => {
  try {
    const [rules, events] = await Promise.all([
      db.select().from(alertRules).where(eq(alertRules.userId, req.dbUserId!)).orderBy(desc(alertRules.createdAt)),
      db.select().from(alertEvents).where(eq(alertEvents.userId, req.dbUserId!)).orderBy(desc(alertEvents.triggeredAt)).limit(50),
    ]);
    res.json({ rules, events });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/alerts/rules', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { symbol, stockName, ruleType, thresholdValue, cooldownMinutes, channel } = req.body || {};
    const clean = String(symbol || '').replace(/[^0-9]/g, '').slice(0, 6);
    if (!/^\d{6}$/.test(clean)) return res.status(400).json({ error: '无效的6位A股代码' });

    const [rule] = await db
      .insert(alertRules)
      .values({
        userId: req.dbUserId!,
        symbol: clean,
        stockName: stockName ? String(stockName) : clean,
        ruleType: String(ruleType || '突破压力位'),
        thresholdValue: typeof thresholdValue === 'number' ? thresholdValue : null,
        cooldownMinutes: Number(cooldownMinutes || 60),
        channel: String(channel || '站内通知'),
      })
      .returning();
    res.json({ rule });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/alerts/evaluate', requireAuth, async (req: AuthRequest, res) => {
  try {
    const rules = await db
      .select()
      .from(alertRules)
      .where(and(eq(alertRules.userId, req.dbUserId!), eq(alertRules.isEnabled, true)));

    const triggered: any[] = [];
    for (const r of rules) {
      if (r.lastTriggeredAt && Date.now() - new Date(r.lastTriggeredAt).getTime() < r.cooldownMinutes * 60000) {
        continue; // Deduplication cooldown
      }
      const q = await fetchStockQuote(r.symbol);
      if (!q || q.price === null) continue;
      let hit = false;
      let actualDesc = `当前价 ${q.price} 元，涨跌幅 ${q.changePct ?? 0}%`;

      if (r.ruleType === '突破压力位' && r.thresholdValue !== null && q.price >= r.thresholdValue) hit = true;
      else if (r.ruleType === '跌破支撑' && r.thresholdValue !== null && q.price <= r.thresholdValue) hit = true;
      else if (r.ruleType === '涨跌停' && q.changePct !== null && Math.abs(q.changePct) >= 9.8) hit = true;
      else if (r.ruleType === '放量异常' && q.volumeRatio !== null && q.volumeRatio >= (r.thresholdValue || 2.0)) {
        hit = true;
        actualDesc = `当前量比 ${q.volumeRatio}x，换手率 ${q.turnoverRate ?? '-'}%`;
      }

      if (hit) {
        const [ev] = await db
          .insert(alertEvents)
          .values({
            userId: req.dbUserId!,
            ruleId: r.id,
            symbol: r.symbol,
            eventTitle: `${r.stockName || r.symbol} 触发「${r.ruleType}」预警`,
            conditionDesc: `${r.ruleType} (阈值: ${r.thresholdValue ?? '默认'})`,
            actualData: actualDesc,
            notifyStatus: '已送达站内',
          })
          .returning();
        await db.update(alertRules).set({ lastTriggeredAt: new Date() }).where(eq(alertRules.id, r.id));
        triggered.push(ev);
      }
    }
    res.json({ evaluated: rules.length, triggered });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// System Management: Trading Rules, Data Sources, Model Versions
apiRouter.get('/system/overview', requireAuth, async (_req: AuthRequest, res) => {
  try {
    await ensureSeeded();
    const [rules, sources, qualityLogs, models] = await Promise.all([
      db.select().from(tradingRules),
      db.select().from(dataSources),
      db.select().from(dataQualityLogs).orderBy(desc(dataQualityLogs.checkedAt)).limit(30),
      db.select().from(modelVersions).orderBy(desc(modelVersions.createdAt)),
    ]);
    res.json({ rules, sources, qualityLogs, models });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

apiRouter.post('/system/model-versions', requireAuth, async (req: AuthRequest, res) => {
  try {
    const { versionCode, modelName, longTermWeights, shortTermWeights, description } = req.body || {};
    if (!versionCode || !modelName) return res.status(400).json({ error: '版本号和名称必填' });
    const [created] = await db
      .insert(modelVersions)
      .values({
        versionCode: String(versionCode),
        modelName: String(modelName),
        longTermWeights: longTermWeights || {},
        shortTermWeights: shortTermWeights || {},
        description: description ? String(description) : null,
        isActive: false,
      })
      .returning();
    res.json({ model: created });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
