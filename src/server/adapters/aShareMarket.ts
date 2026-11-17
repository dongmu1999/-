import { db } from '../../db/index.ts';
import {
  dataQualityLogs,
  dataSources,
  stocks,
} from '../../db/schema.ts';
import { eq } from 'drizzle-orm';
import { inferExchangeAndBoard } from '../engines/tradingRules.ts';

const UA_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
};

export interface DataProvenance {
  dataSource: string;
  collectedAt: string;
  dataDate: string;
  isRealtime: boolean;
  dataStatus: '正常' | '延迟' | '缺失' | '异常' | '接口未连接';
  delayNotice?: string;
  missingFields?: string[];
}

export async function seedDataSourcesRegistry() {
  const sources = [
    {
      sourceKey: 'tencent_hq',
      sourceName: '腾讯财经行情与K线接口',
      category: '行情与K线',
      licenseType: '第三方免费',
      isEnabled: true,
      status: '正常',
      rateLimitNote: '存在数秒级行情延迟，仅作个人研究参考，非交易所Level-2直连',
    },
    {
      sourceKey: 'eastmoney_push',
      sourceName: '东方财富实时列表/板块/资金接口',
      category: '市场扫描与资金口径',
      licenseType: '第三方免费',
      isEnabled: true,
      status: '正常',
      rateLimitNote: '主力资金流向为第三方平台按成交额统计估算口径，非交易所官方口径',
    },
    {
      sourceKey: 'eastmoney_f10',
      sourceName: '东方财富F10财务与龙虎榜/宏观接口',
      category: '基本面/龙虎榜/宏观',
      licenseType: '第三方免费',
      isEnabled: true,
      status: '正常',
      rateLimitNote: '财务数据以财报披露日为准；部分细分口径存在缺失可能',
    },
    {
      sourceKey: 'cninfo_official',
      sourceName: '巨潮资讯网上市公司公告接口',
      category: '公司公告与监管信息',
      licenseType: '官方公开',
      isEnabled: true,
      status: '正常',
      rateLimitNote: '中国证监会指定上市公司信息披露平台公开查询',
    },
    {
      sourceKey: 'tushare_pro',
      sourceName: 'Tushare Pro 量化数据接口 (预留适配器)',
      category: '机构级历史与财务库',
      licenseType: '商业授权',
      isEnabled: false,
      status: '接口未连接',
      rateLimitNote: '需用户配置授权Token及积分权限，未连接时不伪造数据',
    },
  ];
  for (const s of sources) {
    await db
      .insert(dataSources)
      .values(s)
      .onConflictDoNothing({ target: dataSources.sourceKey });
  }
}

async function logQuality(
  sourceKey: string,
  endpoint: string,
  status: '正常' | '延迟' | '缺失' | '异常' | '接口未连接',
  latencyMs: number,
  message?: string,
  missingFields: string[] = []
) {
  try {
    await db.insert(dataQualityLogs).values({
      sourceKey,
      endpoint,
      status,
      latencyMs,
      missingFields,
      message,
    });
    await db
      .update(dataSources)
      .set({
        status,
        lastCheckedAt: new Date(),
        lastError: status === '正常' || status === '延迟' ? null : message || null,
      })
      .where(eq(dataSources.sourceKey, sourceKey));
  } catch {
    // Non-fatal logging failure
  }
}

function formatDateCN(d = new Date()): string {
  // Approximate Beijing time YYYY-MM-DD
  const bj = new Date(d.getTime() + 8 * 3600 * 1000);
  return bj.toISOString().slice(0, 10);
}

function getRecentTradingDateCandidates(): string[] {
  const res: string[] = [];
  const now = new Date(Date.now() + 8 * 3600 * 1000);
  for (let i = 0; i < 10; i++) {
    const dt = new Date(now.getTime() - i * 86400 * 1000);
    const day = dt.getUTCDay();
    if (day !== 0 && day !== 6) {
      res.push(dt.toISOString().slice(0, 10).replace(/-/g, ''));
    }
  }
  return res;
}

export async function searchAStocks(query: string, boardFilter?: string) {
  const q = (query || '').trim();
  const t0 = Date.now();
  try {
    if (q) {
      const url = `https://searchapi.eastmoney.com/api/suggest/get?input=${encodeURIComponent(
        q
      )}&type=14&token=D43BF722C8E33BDC906FB84D85E726E8&count=25`;
      const resp = await fetch(url, { headers: UA_HEADERS, signal: AbortSignal.timeout(6000) });
      const json: any = await resp.json();
      const rows = (json?.QuotationCodeTable?.Data || [])
        .filter((item: any) => ['1', '2', '0', '153', '154'].includes(String(item.MktNum)) || ['A', 'B'].includes(item.SecurityTypeName) || /A|科创|创业|北/.test(item.SecurityTypeName || ''))
        .filter((item: any) => /^\d{6}$/.test(item.Code) && !item.Code.startsWith('200') && !item.Code.startsWith('900'))
        .map((item: any) => {
          const info = inferExchangeAndBoard(item.Code);
          const name: string = item.Name || '';
          return {
            symbol: item.Code,
            tsCode: info.tsCode,
            name,
            exchange: info.exchange,
            board: info.board,
            securityType: item.SecurityTypeName || 'A股',
            isSt: /ST/i.test(name),
            isDelisting: name.includes('退'),
            pinyin: item.PinYin || '',
          };
        })
        .filter((s: any) => !boardFilter || boardFilter === '全部' || s.board === boardFilter);

      await logQuality('eastmoney_push', 'suggest/get', '正常', Date.now() - t0);
      return {
        items: rows,
        provenance: {
          dataSource: '东方财富证券代码检索接口',
          collectedAt: new Date().toISOString(),
          dataDate: formatDateCN(),
          isRealtime: false,
          dataStatus: '正常' as const,
        },
      };
    }

    // Empty query: fetch active A-share universe top 60 by turnover
    const listUrl =
      'https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=60&po=1&np=1&fltt=2&invt=2&fid=f6&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048&fields=f12,f14,f2,f3,f5,f6,f8,f9,f10,f20,f21,f23,f100';
    const resp = await fetch(listUrl, { headers: UA_HEADERS, signal: AbortSignal.timeout(7000) });
    const json: any = await resp.json();
    const diff = json?.data?.diff || [];
    const items = diff
      .map((d: any) => {
        const info = inferExchangeAndBoard(d.f12);
        return {
          symbol: d.f12,
          tsCode: info.tsCode,
          name: d.f14,
          exchange: info.exchange,
          board: info.board,
          industry: d.f100 || null,
          price: typeof d.f2 === 'number' ? d.f2 : null,
          changePct: typeof d.f3 === 'number' ? d.f3 : null,
          amount: typeof d.f6 === 'number' ? d.f6 : null,
          turnoverRate: typeof d.f8 === 'number' ? d.f8 : null,
          peTtm: typeof d.f9 === 'number' ? d.f9 : null,
          pb: typeof d.f23 === 'number' ? d.f23 : null,
          totalMarketCap: typeof d.f20 === 'number' ? d.f20 : null,
          isSt: /ST/i.test(d.f14 || ''),
          isDelisting: (d.f14 || '').includes('退'),
        };
      })
      .filter((s: any) => !boardFilter || boardFilter === '全部' || s.board === boardFilter);

    await logQuality('eastmoney_push', 'clist/get', '延迟', Date.now() - t0);
    return {
      items,
      provenance: {
        dataSource: '东方财富沪深京A股全市场列表接口',
        collectedAt: new Date().toISOString(),
        dataDate: formatDateCN(),
        isRealtime: false,
        dataStatus: '延迟' as const,
        delayNotice: '第三方行情接口（延迟数秒），非交易所直连',
      },
    };
  } catch (err: any) {
    await logQuality('eastmoney_push', 'searchAStocks', '接口未连接', Date.now() - t0, err.message);
    return {
      items: [],
      provenance: {
        dataSource: '东方财富接口',
        collectedAt: new Date().toISOString(),
        dataDate: formatDateCN(),
        isRealtime: false,
        dataStatus: '接口未连接' as const,
        delayNotice: `行情检索接口请求失败: ${err.message}`,
      },
    };
  }
}

export async function fetchStockQuote(symbol: string) {
  const clean = symbol.replace(/[^0-9]/g, '').slice(0, 6);
  const info = inferExchangeAndBoard(clean);
  const t0 = Date.now();
  const missingFields: string[] = [];

  try {
    const [tencentRes, emRes] = await Promise.allSettled([
      fetch(`https://qt.gtimg.cn/q=${info.tencentCode}`, {
        headers: UA_HEADERS,
        signal: AbortSignal.timeout(5000),
      }),
      fetch(
        `https://push2.eastmoney.com/api/qt/stock/get?secid=${info.eastmoneySecId}&fields=f43,f44,f45,f46,f47,f48,f50,f57,f58,f60,f116,f117,f127,f162,f167,f168,f169,f170,f173,f292`,
        { headers: UA_HEADERS, signal: AbortSignal.timeout(5000) }
      ),
    ]);

    let name = '';
    let price: number | null = null;
    let prevClose: number | null = null;
    let open: number | null = null;
    let high: number | null = null;
    let low: number | null = null;
    let volume: number | null = null;
    let amount: number | null = null;
    let changePct: number | null = null;
    let changeAmt: number | null = null;
    let turnoverRate: number | null = null;
    let volumeRatio: number | null = null;
    let totalMarketCap: number | null = null;
    let floatMarketCap: number | null = null;
    let peTtm: number | null = null;
    let pb: number | null = null;
    let high52w: number | null = null;
    let low52w: number | null = null;
    let dividendYield: number | null = null;
    let totalShares: number | null = null;
    let floatShares: number | null = null;
    let quoteTimeStr = formatDateCN();
    let usedSources: string[] = [];

    if (tencentRes.status === 'fulfilled' && tencentRes.value.ok) {
      const buf = await tencentRes.value.arrayBuffer();
      const text = new TextDecoder('gbk').decode(buf);
      const match = text.match(/="([^"]+)"/);
      if (match) {
        const f = match[1].split('~');
        if (f.length > 45) {
          name = f[1] || name;
          price = parseFloat(f[3]) || null;
          prevClose = parseFloat(f[4]) || null;
          open = parseFloat(f[5]) || null;
          volume = parseFloat(f[6]) ? parseFloat(f[6]) * 100 : null; // 手 -> 股
          quoteTimeStr = f[30] ? `${f[30].slice(0, 4)}-${f[30].slice(4, 6)}-${f[30].slice(6, 8)}` : quoteTimeStr;
          changeAmt = f[31] ? parseFloat(f[31]) : null;
          changePct = f[32] ? parseFloat(f[32]) : null;
          high = parseFloat(f[33]) || null;
          low = parseFloat(f[34]) || null;
          amount = f[37] ? parseFloat(f[37]) * 10000 : null; // 万元 -> 元
          turnoverRate = f[38] ? parseFloat(f[38]) : null;
          peTtm = f[39] ? parseFloat(f[39]) : null;
          floatMarketCap = f[44] ? parseFloat(f[44]) * 1e8 : null; // 亿 -> 元
          totalMarketCap = f[45] ? parseFloat(f[45]) * 1e8 : null;
          pb = f[46] ? parseFloat(f[46]) : null;
          volumeRatio = f[49] ? parseFloat(f[49]) : null;
          dividendYield = f[64] ? parseFloat(f[64]) : null;
          high52w = f[67] && parseFloat(f[67]) > 0 ? parseFloat(f[67]) : null;
          low52w = f[68] && parseFloat(f[68]) > 0 ? parseFloat(f[68]) : null;
          totalShares = f[72] ? parseFloat(f[72]) : null;
          floatShares = f[73] ? parseFloat(f[73]) : null;
          usedSources.push('腾讯财经(qt.gtimg.cn)');
        }
      }
    }

    let industry: string | null = null;
    if (emRes.status === 'fulfilled' && emRes.value.ok) {
      const json: any = await emRes.value.json();
      const d = json?.data;
      if (d) {
        name = name || d.f58 || clean;
        if (price === null && typeof d.f43 === 'number') price = d.f43 / 100;
        if (high === null && typeof d.f44 === 'number') high = d.f44 / 100;
        if (low === null && typeof d.f45 === 'number') low = d.f45 / 100;
        if (open === null && typeof d.f46 === 'number') open = d.f46 / 100;
        if (prevClose === null && typeof d.f60 === 'number') prevClose = d.f60 / 100;
        if (peTtm === null && typeof d.f162 === 'number') peTtm = d.f162 / 100;
        if (pb === null && typeof d.f167 === 'number') pb = d.f167 / 100;
        if (totalMarketCap === null && typeof d.f116 === 'number') totalMarketCap = d.f116;
        if (floatMarketCap === null && typeof d.f117 === 'number') floatMarketCap = d.f117;
        if (typeof d.f127 === 'string') industry = d.f127;
        if (volumeRatio === null && typeof d.f50 === 'number') volumeRatio = d.f50 / 100;
        if (turnoverRate === null && typeof d.f168 === 'number') turnoverRate = d.f168 / 100;
        usedSources.push('东方财富(push2)');
      }
    }

    if (!name && price === null) {
      await logQuality('tencent_hq', 'quote', '接口未连接', Date.now() - t0, `未获取到 ${clean} 行情`);
      return null;
    }

    if (high52w === null) missingFields.push('52周高点');
    if (low52w === null) missingFields.push('52周低点');
    if (dividendYield === null) missingFields.push('股息率(TTM)');
    const isSuspended = (volume === 0 || open === 0) && price !== null;
    const isSt = /ST/i.test(name);
    const isDelisting = name.includes('退');

    // Persist stock master record (best-effort cache)
    try {
      await db
        .insert(stocks)
        .values({
          symbol: clean,
          tsCode: info.tsCode,
          name,
          exchange: info.exchange,
          board: info.board,
          industry,
          isSt,
          isDelisting,
          isSuspended,
          totalShares,
          floatShares,
          dataSource: usedSources.join(' + '),
          dataDate: quoteTimeStr,
          dataStatus: '延迟',
        })
        .onConflictDoUpdate({
          target: stocks.symbol,
          set: {
            name,
            industry: industry || undefined,
            isSt,
            isDelisting,
            isSuspended,
            totalShares: totalShares || undefined,
            floatShares: floatShares || undefined,
            dataSource: usedSources.join(' + '),
            collectedAt: new Date(),
            dataDate: quoteTimeStr,
          },
        });
    } catch {
      // Non-fatal cache write failure
    }

    await logQuality('tencent_hq', 'quote', '延迟', Date.now() - t0, undefined, missingFields);

    return {
      symbol: clean,
      tsCode: info.tsCode,
      name,
      exchange: info.exchange,
      board: info.board,
      industry,
      price,
      prevClose,
      open,
      high,
      low,
      changePct,
      changeAmt,
      volume,
      amount,
      turnoverRate,
      volumeRatio,
      totalMarketCap,
      floatMarketCap,
      peTtm,
      pb,
      dividendYield,
      totalShares,
      floatShares,
      high52w,
      low52w,
      isSt,
      isDelisting,
      isSuspended,
      provenance: {
        dataSource: usedSources.join(' + '),
        collectedAt: new Date().toISOString(),
        dataDate: quoteTimeStr,
        isRealtime: false,
        dataStatus: '延迟' as const,
        delayNotice: '第三方公开行情接口（通常延迟数秒至15秒，非交易所收费Level-2直连）',
        missingFields,
      },
    };
  } catch (err: any) {
    await logQuality('tencent_hq', 'quote', '异常', Date.now() - t0, err.message);
    throw err;
  }
}

export async function fetchStockOhlcv(
  symbol: string,
  timeframe: '1m' | '5m' | '15m' | '30m' | '60m' | 'day' | 'week' | 'month' = 'day',
  limit = 240,
  customPrefixCode?: string
) {
  const clean = symbol.replace(/[^0-9]/g, '').slice(0, 6);
  const info = inferExchangeAndBoard(clean);
  const tCode = customPrefixCode || info.tencentCode;
  const t0 = Date.now();

  try {
    let bars: { time: string; open: number; high: number; low: number; close: number; volume: number }[] = [];
    if (['1m', '5m', '15m', '30m', '60m'].includes(timeframe)) {
      const mKey = `m${timeframe.replace('m', '')}`;
      const url = `https://ifzq.gtimg.cn/appstock/app/kline/mkline?param=${tCode},${mKey},,${Math.min(limit, 320)}`;
      const resp = await fetch(url, { headers: UA_HEADERS, signal: AbortSignal.timeout(7000) });
      const json: any = await resp.json();
      const rawArr: any[] = json?.data?.[tCode]?.[mKey] || [];
      bars = rawArr.map((r) => {
        const rawT = String(r[0]); // YYYYMMDDHHmm
        const formatted =
          rawT.length >= 12
            ? `${rawT.slice(0, 4)}-${rawT.slice(4, 6)}-${rawT.slice(6, 8)} ${rawT.slice(8, 10)}:${rawT.slice(10, 12)}`
            : rawT;
        return {
          time: formatted,
          open: parseFloat(r[1]),
          close: parseFloat(r[2]),
          high: parseFloat(r[3]),
          low: parseFloat(r[4]),
          volume: parseFloat(r[5]) * 100,
        };
      });
    } else {
      const qfqKey = timeframe === 'day' ? 'qfqday' : timeframe === 'week' ? 'qfqweek' : 'qfqmonth';
      const plainKey = timeframe;
      const url = `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${tCode},${timeframe},,,${Math.min(
        limit,
        1250
      )},qfq`;
      const resp = await fetch(url, { headers: UA_HEADERS, signal: AbortSignal.timeout(8000) });
      const json: any = await resp.json();
      const node = json?.data?.[tCode];
      const rawArr: any[] = node?.[qfqKey] || node?.[plainKey] || [];
      bars = rawArr.map((r) => ({
        time: String(r[0]),
        open: parseFloat(r[1]),
        close: parseFloat(r[2]),
        high: parseFloat(r[3]),
        low: parseFloat(r[4]),
        volume: parseFloat(r[5]) * 100,
      }));
    }

    await logQuality('tencent_hq', `ohlcv/${timeframe}`, '正常', Date.now() - t0);
    return {
      bars: bars.filter((b) => !Number.isNaN(b.open) && !Number.isNaN(b.close)),
      provenance: {
        dataSource: `腾讯财经前复权K线接口 (${timeframe})`,
        collectedAt: new Date().toISOString(),
        dataDate: bars.length ? bars[bars.length - 1].time : formatDateCN(),
        isRealtime: false,
        dataStatus: (bars.length ? '正常' : '缺失') as '正常' | '缺失',
        delayNotice: timeframe.endsWith('m')
          ? '分钟K线受免费接口回溯长度限制，最多获取最近约320根K线'
          : '日/周/月线采用前复权(qfq)口径',
      },
    };
  } catch (err: any) {
    await logQuality('tencent_hq', `ohlcv/${timeframe}`, '接口未连接', Date.now() - t0, err.message);
    return {
      bars: [],
      provenance: {
        dataSource: '腾讯财经K线接口',
        collectedAt: new Date().toISOString(),
        dataDate: formatDateCN(),
        isRealtime: false,
        dataStatus: '接口未连接' as const,
        delayNotice: err.message,
      },
    };
  }
}

export async function fetchStockFundamentalsAndFinancials(symbol: string) {
  const clean = symbol.replace(/[^0-9]/g, '').slice(0, 6);
  const info = inferExchangeAndBoard(clean);
  const emCode = `${info.exchange}${clean}`;
  const t0 = Date.now();

  try {
    const [surveyRes, bizRes, annualRes, reportRes, holderRes, orgHoldRes, divRes, lhbRes] =
      await Promise.allSettled([
        fetch(`https://emweb.securities.eastmoney.com/PC_HSF10/CompanySurvey/PageAjax?code=${emCode}`, {
          headers: UA_HEADERS,
          signal: AbortSignal.timeout(7000),
        }),
        fetch(`https://emweb.securities.eastmoney.com/PC_HSF10/BusinessAnalysis/PageAjax?code=${emCode}`, {
          headers: UA_HEADERS,
          signal: AbortSignal.timeout(7000),
        }),
        fetch(
          `https://emweb.securities.eastmoney.com/PC_HSF10/NewFinanceAnalysis/ZYZBAjaxNew?type=1&code=${emCode}`,
          { headers: UA_HEADERS, signal: AbortSignal.timeout(7000) }
        ),
        fetch(
          `https://emweb.securities.eastmoney.com/PC_HSF10/NewFinanceAnalysis/ZYZBAjaxNew?type=0&code=${emCode}`,
          { headers: UA_HEADERS, signal: AbortSignal.timeout(7000) }
        ),
        fetch(
          `https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_HOLDERNUM_DET&columns=ALL&filter=(SECURITY_CODE%3D%22${clean}%22)&pageSize=4&sortColumns=END_DATE&sortTypes=-1`,
          { headers: UA_HEADERS, signal: AbortSignal.timeout(6000) }
        ),
        fetch(
          `https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_F10_MAIN_ORGHOLD&columns=ALL&filter=(SECURITY_CODE%3D%22${clean}%22)&pageSize=4&sortColumns=REPORT_DATE&sortTypes=-1`,
          { headers: UA_HEADERS, signal: AbortSignal.timeout(6000) }
        ),
        fetch(
          `https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_SHAREBONUS_DET&columns=ALL&filter=(SECURITY_CODE%3D%22${clean}%22)&pageSize=5&sortColumns=PLAN_NOTICE_DATE&sortTypes=-1`,
          { headers: UA_HEADERS, signal: AbortSignal.timeout(6000) }
        ),
        fetch(
          `https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_DAILYBILLBOARD_DETAILSNEW&columns=ALL&filter=(SECURITY_CODE%3D%22${clean}%22)&pageSize=5&sortColumns=TRADE_DATE&sortTypes=-1`,
          { headers: UA_HEADERS, signal: AbortSignal.timeout(6000) }
        ),
      ]);

    let profile: Record<string, any> | null = null;
    let orgTypeStr = '通用';
    if (surveyRes.status === 'fulfilled' && surveyRes.value.ok) {
      const sJson: any = await surveyRes.value.json();
      const jbzl = sJson?.jbzl?.[0];
      const fxxg = sJson?.fxxg?.[0];
      if (jbzl) {
        orgTypeStr = jbzl.ORG_TYPE || '通用';
        profile = {
          orgName: jbzl.ORG_NAME,
          industry: jbzl.EM2016 || jbzl.INDUSTRYCSRC1,
          csrcIndustry: jbzl.INDUSTRYCSRC1,
          securityType: jbzl.SECURITY_TYPE,
          mainBusiness: jbzl.MAIN_BUSINESS || null,
          businessScope: jbzl.BUSINESS_SCOPE || null,
          chairman: jbzl.CHAIRMAN,
          president: jbzl.PRESIDENT,
          legalPerson: jbzl.LEGAL_PERSON,
          regCapital: jbzl.REG_CAPITAL,
          employees: jbzl.EMP_NUM,
          province: jbzl.PROVINCE,
          website: jbzl.ORG_WEB,
          orgProfile: jbzl.ORG_PROFILE || null,
          listDate: fxxg?.LISTING_DATE ? String(fxxg.LISTING_DATE).slice(0, 10) : null,
          businessComposition: [] as any[],
          managementDiscussion: null as string | null,
        };
      }
    }

    if (bizRes.status === 'fulfilled' && bizRes.value.ok) {
      const bJson: any = await bizRes.value.json();
      const scope = bJson?.zyfw?.[0]?.BUSINESS_SCOPE || null;
      const compRaw: any[] = bJson?.zygcfx || [];
      const latestCompDate = compRaw[0]?.REPORT_DATE ? String(compRaw[0].REPORT_DATE).slice(0, 10) : null;
      const latestComp = compRaw
        .filter((c) => !latestCompDate || String(c.REPORT_DATE).slice(0, 10) === latestCompDate)
        .filter((c) => c.MAINOP_TYPE === '2' || c.MAINOP_TYPE === '1')
        .slice(0, 8)
        .map((c) => ({
          reportDate: String(c.REPORT_DATE || '').slice(0, 10),
          type: c.MAINOP_TYPE === '2' ? '按产品' : '按行业',
          itemName: c.ITEM_NAME,
          income: c.MAIN_BUSINESS_INCOME,
          ratioPct: typeof c.MBI_RATIO === 'number' ? Number((c.MBI_RATIO * 100).toFixed(2)) : null,
          grossMarginPct:
            typeof c.GROSS_RPOFIT_RATIO === 'number'
              ? Number((c.GROSS_RPOFIT_RATIO * 100).toFixed(2))
              : null,
        }));

      const jypsList: any[] = bJson?.jyps || [];
      const jypsText = jypsList[0]?.MS_CONTENT || jypsList[0]?.CONTENT || null;

      if (!profile) {
        profile = { businessComposition: [], managementDiscussion: null };
      }
      if (!profile.businessScope && scope) profile.businessScope = scope;
      profile.businessComposition = latestComp;
      profile.managementDiscussion = jypsText;

      if (!profile.mainBusiness) {
        const prodItems = latestComp.filter((c) => c.type === '按产品');
        const used = prodItems.length ? prodItems : latestComp;
        if (used.length > 0) {
          profile.mainBusiness = used
            .slice(0, 5)
            .map(
              (c) =>
                `${c.itemName}${c.ratioPct !== null ? ` (${c.ratioPct}%)` : ''}`
            )
            .join('；');
        } else if (profile.businessScope) {
          profile.mainBusiness = profile.businessScope;
        } else if (profile.orgProfile) {
          profile.mainBusiness = profile.orgProfile;
        }
      }
    }

    const aRaw: any[] =
      annualRes.status === 'fulfilled' && annualRes.value.ok ? (await annualRes.value.json())?.data || [] : [];
    const qRaw: any[] =
      reportRes.status === 'fulfilled' && reportRes.value.ok ? (await reportRes.value.json())?.data || [] : [];

    // Fetch Balance Sheet & Cash Flow for exact dates
    const uniqueDates = Array.from(
      new Set([...qRaw.slice(0, 8), ...aRaw.slice(0, 5)].map((r) => String(r.REPORT_DATE || '').slice(0, 10)))
    )
      .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
      .slice(0, 10);

    const companyType =
      orgTypeStr.includes('银行') ? 3 : orgTypeStr.includes('保险') ? 2 : orgTypeStr.includes('证券') ? 1 : 4;

    const bsMap = new Map<string, any>();
    const cfMap = new Map<string, any>();

    if (uniqueDates.length > 0) {
      const datesParam = uniqueDates.join(',');
      const [bsRes, cfRes] = await Promise.allSettled([
        fetch(
          `https://emweb.securities.eastmoney.com/PC_HSF10/NewFinanceAnalysis/zcfzbAjaxNew?companyType=${companyType}&reportDateType=0&reportType=1&dates=${datesParam}&code=${emCode}`,
          { headers: UA_HEADERS, signal: AbortSignal.timeout(7000) }
        ),
        fetch(
          `https://emweb.securities.eastmoney.com/PC_HSF10/NewFinanceAnalysis/xjllbAjaxNew?companyType=${companyType}&reportDateType=0&reportType=1&dates=${datesParam}&code=${emCode}`,
          { headers: UA_HEADERS, signal: AbortSignal.timeout(7000) }
        ),
      ]);
      if (bsRes.status === 'fulfilled' && bsRes.value.ok) {
        const bsJson: any = await bsRes.value.json();
        for (const row of bsJson?.data || []) {
          const dt = String(row.REPORT_DATE || '').slice(0, 10);
          if (dt) bsMap.set(dt, row);
        }
      }
      if (cfRes.status === 'fulfilled' && cfRes.value.ok) {
        const cfJson: any = await cfRes.value.json();
        for (const row of cfJson?.data || []) {
          const dt = String(row.REPORT_DATE || '').slice(0, 10);
          if (dt) cfMap.set(dt, row);
        }
      }
    }

    const parseFinRow = (r: any) => {
      const dt = r.REPORT_DATE ? String(r.REPORT_DATE).slice(0, 10) : '';
      const bs = bsMap.get(dt) || {};
      const cf = cfMap.get(dt) || {};
      const netProfit = typeof r.PARENTNETPROFIT === 'number' ? r.PARENTNETPROFIT : null;
      const opCash =
        typeof cf.NETCASH_OPERATE === 'number'
          ? cf.NETCASH_OPERATE
          : typeof r.MGJYXJJE === 'number' && typeof r.TOTAL_SHARE === 'number'
          ? r.MGJYXJJE * r.TOTAL_SHARE
          : null;
      const cfRatio =
        typeof r.XJLLB === 'number'
          ? r.XJLLB
          : opCash !== null && netProfit && netProfit !== 0
          ? Number((opCash / netProfit).toFixed(2))
          : null;

      return {
        reportDate: dt,
        reportType: r.REPORT_TYPE || '报告期',
        revenue: typeof r.TOTALOPERATEREVE === 'number' ? r.TOTALOPERATEREVE : null,
        revenueYoy: typeof r.TOTALOPERATEREVETZ === 'number' ? r.TOTALOPERATEREVETZ : null,
        netProfit,
        netProfitYoy: typeof r.PARENTNETPROFITTZ === 'number' ? r.PARENTNETPROFITTZ : null,
        deductedNetProfit: typeof r.KCFJCXSYJLR === 'number' ? r.KCFJCXSYJLR : null,
        grossMargin: typeof r.XSMLL === 'number' ? r.XSMLL : null,
        netMargin: typeof r.XSJLL === 'number' ? r.XSJLL : null,
        roe: typeof r.ROEJQ === 'number' ? r.ROEJQ : null,
        roic: typeof r.ROIC === 'number' ? r.ROIC : null,
        eps: typeof r.EPSJB === 'number' ? r.EPSJB : null,
        operatingCashFlow: opCash,
        debtToAssetRatio: typeof r.ZCFZL === 'number' ? r.ZCFZL : null,
        accountsReceivable: typeof bs.ACCOUNTS_RECE === 'number' ? bs.ACCOUNTS_RECE : null,
        inventory: typeof bs.INVENTORY === 'number' ? bs.INVENTORY : null,
        goodwill: typeof bs.GOODWILL === 'number' ? bs.GOODWILL : 0,
        monetaryFunds: typeof bs.MONETARYFUNDS === 'number' ? bs.MONETARYFUNDS : null,
        totalAssets: typeof bs.TOTAL_ASSETS === 'number' ? bs.TOTAL_ASSETS : null,
        totalLiabilities: typeof bs.TOTAL_LIABILITIES === 'number' ? bs.TOTAL_LIABILITIES : null,
        currentRatio: typeof r.LD === 'number' ? r.LD : null,
        cashFlowToNetProfit: cfRatio,
      };
    };

    const annualFinancials = aRaw.slice(0, 6).map(parseFinRow);
    const quarterlyFinancials = qRaw.slice(0, 10).map(parseFinRow);

    const shareholderNumbers =
      holderRes.status === 'fulfilled' && holderRes.value.ok
        ? ((await holderRes.value.json())?.result?.data || []).map((h: any) => ({
            endDate: String(h.END_DATE || '').slice(0, 10),
            holderNum: h.HOLDER_NUM,
            changeNum: h.HOLDER_NUM_CHANGE,
            changeRatioPct: h.HOLDER_NUM_RATIO,
            avgHoldShares: h.AVG_HOLD_NUM,
          }))
        : [];

    const institutionalHoldings =
      orgHoldRes.status === 'fulfilled' && orgHoldRes.value.ok
        ? ((await orgHoldRes.value.json())?.result?.data || []).map((o: any) => ({
            reportDate: String(o.REPORT_DATE || '').slice(0, 10),
            orgCount: o.TOTAL_ORG_NUM,
            totalSharesRatioPct: o.TOTAL_SHARES_RATIO,
            holdMarketCap: o.TOTAL_MARKET_CAP,
          }))
        : [];

    const dividends =
      divRes.status === 'fulfilled' && divRes.value.ok
        ? ((await divRes.value.json())?.result?.data || []).map((d: any) => ({
            reportDate: String(d.REPORT_DATE || '').slice(0, 10),
            planNoticeDate: String(d.PLAN_NOTICE_DATE || '').slice(0, 10),
            planExplain: d.IMPL_PLAN_PROFILE || d.ASSIGN_PROGRESS || '分红预案/实施',
            exDividendDate: d.EX_DIVIDEND_DATE ? String(d.EX_DIVIDEND_DATE).slice(0, 10) : null,
          }))
        : [];

    const stockDragonTiger =
      lhbRes.status === 'fulfilled' && lhbRes.value.ok
        ? ((await lhbRes.value.json())?.result?.data || []).map((l: any) => ({
            tradeDate: String(l.TRADE_DATE || '').slice(0, 10),
            reason: l.EXPLANATION,
            netBuyAmount: l.BILLBOARD_NET_AMT,
            explain: l.EXPLAIN,
          }))
        : [];

    await logQuality('eastmoney_f10', 'F10/Survey+Biz+ZYZB+ZCFZ+XJLL', '正常', Date.now() - t0);
    return {
      profile,
      annualFinancials,
      quarterlyFinancials,
      shareholderNumbers,
      institutionalHoldings,
      dividends,
      stockDragonTiger,
      provenance: {
        dataSource: '东方财富 F10（公司概况/主营构成/三大报表指标/股东与机构持仓/分红）',
        collectedAt: new Date().toISOString(),
        dataDate: quarterlyFinancials[0]?.reportDate || formatDateCN(),
        isRealtime: false,
        dataStatus: (quarterlyFinancials.length ? '正常' : '缺失') as '正常' | '缺失',
        missingFields: [],
      },
    };
  } catch (err: any) {
    await logQuality('eastmoney_f10', 'F10', '接口未连接', Date.now() - t0, err.message);
    return {
      profile: null,
      annualFinancials: [],
      quarterlyFinancials: [],
      shareholderNumbers: [],
      institutionalHoldings: [],
      dividends: [],
      stockDragonTiger: [],
      provenance: {
        dataSource: '东方财富 F10',
        collectedAt: new Date().toISOString(),
        dataDate: formatDateCN(),
        isRealtime: false,
        dataStatus: '接口未连接' as const,
      },
    };
  }
}

export async function fetchStockAnnouncements(symbol: string) {
  const clean = symbol.replace(/[^0-9]/g, '').slice(0, 6);
  const info = inferExchangeAndBoard(clean);
  const t0 = Date.now();
  try {
    const column = info.exchange === 'SH' ? 'sse' : info.exchange === 'BJ' ? 'third' : 'szse';
    // Search orgId first via cninfo topSearch or pass query without orgId
    const resp = await fetch('https://www.cninfo.com.cn/new/hisAnnouncement/query', {
      method: 'POST',
      headers: {
        ...UA_HEADERS,
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      },
      body: new URLSearchParams({
        pageNum: '1',
        pageSize: '20',
        column,
        tabName: 'fulltext',
        plate: '',
        stock: '',
        searchkey: clean,
        secid: '',
        category: '',
        trade: '',
        seDate: '',
        sortName: '',
        sortType: '',
        isHLtitle: 'false',
      }),
      signal: AbortSignal.timeout(7000),
    });
    const json: any = await resp.json();
    const list = (json?.announcements || [])
      .filter((a: any) => !a.secCode || a.secCode === clean)
      .slice(0, 15)
      .map((a: any) => {
        const title = String(a.announcementTitle || '').replace(/<[^>]+>/g, '');
        const dt = a.announcementTime ? new Date(a.announcementTime).toISOString().slice(0, 10) : formatDateCN();
        // Rule-based preliminary event tagging (factual keywords, AI enriches when invoked)
        let sentimentLabel: '利好' | '利空' | '中性' = '中性';
        if (/回购|增持|预增|中标|重大合同|股权激励|分红|派息/.test(title)) sentimentLabel = '利好';
        else if (/减持|问询|处罚|诉讼|预减|亏损|风险提示|立案|违约/.test(title)) sentimentLabel = '利空';

        return {
          announcementId: a.announcementId,
          symbol: a.secCode || clean,
          secName: a.secName || '',
          title,
          category: a.announcementTypeName || '公司公告',
          publishedAt: dt,
          sourceName: '巨潮资讯网 (CNINFO)',
          sourceUrl: `https://www.cninfo.com.cn/new/disclosure/detail?stockCode=${a.secCode || clean}&announcementId=${a.announcementId}&orgId=${a.orgId}&announcementTime=${dt}`,
          pdfUrl: a.adjunctUrl ? `https://static.cninfo.com.cn/${a.adjunctUrl}` : null,
          sentimentLabel,
          collectedAt: new Date().toISOString(),
        };
      });

    await logQuality('cninfo_official', 'hisAnnouncement/query', '正常', Date.now() - t0);
    return {
      items: list,
      provenance: {
        dataSource: '巨潮资讯网官方公告披露接口',
        collectedAt: new Date().toISOString(),
        dataDate: list[0]?.publishedAt || formatDateCN(),
        isRealtime: false,
        dataStatus: (list.length ? '正常' : '缺失') as '正常' | '缺失',
      },
    };
  } catch (err: any) {
    await logQuality('cninfo_official', 'hisAnnouncement/query', '接口未连接', Date.now() - t0, err.message);
    return {
      items: [],
      provenance: {
        dataSource: '巨潮资讯网',
        collectedAt: new Date().toISOString(),
        dataDate: formatDateCN(),
        isRealtime: false,
        dataStatus: '接口未连接' as const,
      },
    };
  }
}

export async function fetchComparablePeers(symbol: string, industryName: string | null) {
  const clean = symbol.replace(/[^0-9]/g, '').slice(0, 6);
  try {
    // Query EastMoney industry board stocks or active A-shares in same industry
    const url =
      'https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=150&po=1&np=1&fltt=2&invt=2&fid=f20&fs=m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23&fields=f12,f14,f2,f3,f8,f9,f20,f23,f100';
    const resp = await fetch(url, { headers: UA_HEADERS, signal: AbortSignal.timeout(6000) });
    const json: any = await resp.json();
    const diff: any[] = json?.data?.diff || [];
    const targetInd = (industryName || '').replace(/行业|板块/g, '');
    let peers = diff.filter(
      (d) =>
        d.f12 !== clean &&
        targetInd &&
        d.f100 &&
        (d.f100.includes(targetInd) || targetInd.includes(d.f100))
    );
    if (peers.length < 3) {
      peers = diff.filter((d) => d.f12 !== clean).slice(0, 5);
    }
    return peers.slice(0, 5).map((d) => ({
      symbol: d.f12,
      name: d.f14,
      industry: d.f100 || industryName || '未知',
      price: typeof d.f2 === 'number' ? d.f2 : null,
      changePct: typeof d.f3 === 'number' ? d.f3 : null,
      peTtm: typeof d.f9 === 'number' ? d.f9 : null,
      pb: typeof d.f23 === 'number' ? d.f23 : null,
      totalMarketCap: typeof d.f20 === 'number' ? d.f20 : null,
      turnoverRate: typeof d.f8 === 'number' ? d.f8 : null,
    }));
  } catch {
    return [];
  }
}

export async function fetchCapitalFlow(symbol: string) {
  const clean = symbol.replace(/[^0-9]/g, '').slice(0, 6);
  const info = inferExchangeAndBoard(clean);
  const t0 = Date.now();
  const definitionNote =
    '重要口径声明：以下“主力/超大单/大单/中单/小单”资金流向为东方财富第三方平台基于逐笔成交单笔金额切分的统计估算口径，不等同于上交所/深交所/北交所官方公布的真实资金净流向，仅作交投结构辅助观察。';

  try {
    const [todayRes, klineRes, intradayRes] = await Promise.allSettled([
      fetch(
        `https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&secids=${info.eastmoneySecId}&fields=f62,f184,f66,f69,f72,f75,f78,f81,f84,f87,f124`,
        { headers: UA_HEADERS, signal: AbortSignal.timeout(5000) }
      ),
      fetch(
        `https://push2.eastmoney.com/api/qt/stock/fflow/kline/get?lmt=20&klt=101&secid=${info.eastmoneySecId}&fields1=f1,f2,f3,f7&fields2=f51,f52,f53,f54,f55,f56`,
        { headers: UA_HEADERS, signal: AbortSignal.timeout(5000) }
      ),
      fetch(
        `https://push2.eastmoney.com/api/qt/stock/fflow/kline/get?lmt=240&klt=1&secid=${info.eastmoneySecId}&fields1=f1,f2,f3,f7&fields2=f51,f52,f53,f54,f55,f56`,
        { headers: UA_HEADERS, signal: AbortSignal.timeout(5000) }
      ),
    ]);

    let todaySnapshot: any = null;
    if (todayRes.status === 'fulfilled' && todayRes.value.ok) {
      const j: any = await todayRes.value.json();
      const d = j?.data?.diff?.[0];
      if (d) {
        todaySnapshot = {
          tradeDate: d.f124 ? new Date(d.f124 * 1000).toISOString().slice(0, 10) : formatDateCN(),
          mainNetInflowEst: typeof d.f62 === 'number' ? d.f62 : 0,
          mainNetRatioPct: typeof d.f184 === 'number' ? d.f184 : null,
          superLargeNetInflow: typeof d.f66 === 'number' ? d.f66 : 0,
          superLargeRatioPct: typeof d.f69 === 'number' ? d.f69 : null,
          largeNetInflow: typeof d.f72 === 'number' ? d.f72 : 0,
          largeRatioPct: typeof d.f75 === 'number' ? d.f75 : null,
          mediumNetInflow: typeof d.f78 === 'number' ? d.f78 : 0,
          smallNetInflow: typeof d.f84 === 'number' ? d.f84 : 0,
        };
      }
    }

    let series: any[] = [];
    if (klineRes.status === 'fulfilled' && klineRes.value.ok) {
      const json: any = await klineRes.value.json();
      const klines: string[] = json?.data?.klines || [];
      const byDay = new Map<string, any>();
      for (const row of klines) {
        const p = row.split(',');
        const dayKey = p[0].slice(0, 10);
        byDay.set(dayKey, {
          tradeDate: p[0],
          mainNetInflowEst: parseFloat(p[1]) || 0,
          smallNetInflow: parseFloat(p[2]) || 0,
          mediumNetInflow: parseFloat(p[3]) || 0,
          largeNetInflow: parseFloat(p[4]) || 0,
          superLargeNetInflow: parseFloat(p[5]) || 0,
        });
      }
      series = Array.from(byDay.values());
    }

    let intradayCurve: { time: string; mainNetInflowEst: number; superLargeNetInflow: number; retailNetInflow: number }[] = [];
    if (intradayRes.status === 'fulfilled' && intradayRes.value.ok) {
      const json: any = await intradayRes.value.json();
      const klines: string[] = json?.data?.klines || [];
      const step = Math.max(1, Math.floor(klines.length / 48));
      for (let i = 0; i < klines.length; i += step) {
        const p = klines[i].split(',');
        intradayCurve.push({
          time: p[0].slice(11, 16) || p[0],
          mainNetInflowEst: parseFloat(p[1]) || 0,
          retailNetInflow: (parseFloat(p[2]) || 0) + (parseFloat(p[3]) || 0),
          superLargeNetInflow: parseFloat(p[5]) || 0,
        });
      }
      if (klines.length > 0) {
        const last = klines[klines.length - 1].split(',');
        const lastTime = last[0].slice(11, 16) || last[0];
        if (!intradayCurve.length || intradayCurve[intradayCurve.length - 1].time !== lastTime) {
          intradayCurve.push({
            time: lastTime,
            mainNetInflowEst: parseFloat(last[1]) || 0,
            retailNetInflow: (parseFloat(last[2]) || 0) + (parseFloat(last[3]) || 0),
            superLargeNetInflow: parseFloat(last[5]) || 0,
          });
        }
      }
    }

    if (todaySnapshot && !series.some((s) => s.tradeDate.startsWith(todaySnapshot.tradeDate))) {
      series.push(todaySnapshot);
    }

    await logQuality('eastmoney_push', 'fflow/ulist+kline', '正常', Date.now() - t0);
    return {
      todaySnapshot,
      series,
      intradayCurve,
      definitionNote,
      provenance: {
        dataSource: '东方财富第三方估算资金流向接口 (push2)',
        collectedAt: new Date().toISOString(),
        dataDate: todaySnapshot?.tradeDate || series[series.length - 1]?.tradeDate || formatDateCN(),
        isRealtime: false,
        dataStatus: (series.length || todaySnapshot ? '正常' : '缺失') as '正常' | '缺失',
      },
    };
  } catch (err: any) {
    await logQuality('eastmoney_push', 'fflow', '接口未连接', Date.now() - t0, err.message);
    return {
      todaySnapshot: null,
      series: [],
      intradayCurve: [],
      definitionNote,
      provenance: {
        dataSource: '东方财富资金流向接口',
        collectedAt: new Date().toISOString(),
        dataDate: formatDateCN(),
        isRealtime: false,
        dataStatus: '接口未连接' as const,
        delayNotice: '资金流接口暂不可达，已标记为未连接，不使用模拟数值填充。',
      },
    };
  }
}

export async function fetchMarketOverviewAndSentiment() {
  const t0 = Date.now();
  const indicesCodes = ['sh000001', 'sz399001', 'sz399006', 'sh000688', 'bj899050'];
  const indexMap: Record<string, string> = {
    sh000001: '上证指数',
    sz399001: '深证成指',
    sz399006: '创业板指',
    sh000688: '科创50',
    bj899050: '北证50',
  };

  let indices: any[] = [];
  let breadth = { up: 0, down: 0, flat: 0, totalTurnoverYuan: 0, shSzTurnoverYuan: 0 };
  let marketBreakdown: Record<string, { name: string; up: number; down: number; flat: number; amountYi: number }> = {};
  let limitUpPool: any[] = [];
  let limitDownPool: any[] = [];
  let limitUpCount = 0;
  let limitDownCount = 0;
  let brokenBoardCount: number | null = null;
  let sealRatePct: number | null = null;
  let maxBoards = 0;
  let industries: any[] = [];
  let concepts: any[] = [];
  let ztDate = '';

  try {
    // 1. Fetch 5 indices via Tencent
    const idxResp = await fetch(`https://qt.gtimg.cn/q=${indicesCodes.join(',')}`, {
      headers: UA_HEADERS,
      signal: AbortSignal.timeout(5000),
    });
    const idxBuf = await idxResp.arrayBuffer();
    const idxText = new TextDecoder('gbk').decode(idxBuf);
    for (const line of idxText.split('\n')) {
      const m = line.match(/v_(\w+)="([^"]+)"/);
      if (m) {
        const code = m[1];
        const f = m[2].split('~');
        indices.push({
          code,
          name: indexMap[code] || f[1],
          price: parseFloat(f[3]) || null,
          prevClose: parseFloat(f[4]) || null,
          changeAmt: parseFloat(f[31]) || null,
          changePct: parseFloat(f[32]) || null,
          amountYuan: f[37] ? parseFloat(f[37]) * 10000 : null,
          quoteDate: f[30] ? `${f[30].slice(0, 4)}-${f[30].slice(4, 6)}-${f[30].slice(6, 8)}` : formatDateCN(),
        });
      }
    }

    // 2. Fetch Industry & Concept rankings + official SH/SZ/BJ full-market breadth
    // NOTE: EastMoney clist/get caps pz at 100 items per page, so we MUST use ulist.np f104/f105/f106 on exchange composite indices.
    const [indRes, conRes, breadthRes] = await Promise.allSettled([
      fetch(
        'https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=20&po=1&np=1&fltt=2&invt=2&fid=f3&fs=m:90+t:2+f:!50&fields=f12,f14,f2,f3,f6,f8,f62,f104,f105,f128,f140,f136',
        { headers: UA_HEADERS, signal: AbortSignal.timeout(6000) }
      ),
      fetch(
        'https://push2.eastmoney.com/api/qt/clist/get?pn=1&pz=20&po=1&np=1&fltt=2&invt=2&fid=f3&fs=m:90+t:3+f:!50&fields=f12,f14,f2,f3,f6,f8,f62,f104,f105,f128,f140,f136',
        { headers: UA_HEADERS, signal: AbortSignal.timeout(6000) }
      ),
      fetch(
        'https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&secids=1.000001,0.399001,0.899050&fields=f12,f14,f2,f3,f6,f104,f105,f106',
        { headers: UA_HEADERS, signal: AbortSignal.timeout(6000) }
      ),
    ]);

    if (indRes.status === 'fulfilled' && indRes.value.ok) {
      const j: any = await indRes.value.json();
      industries = (j?.data?.diff || []).map((d: any) => ({
        code: d.f12,
        name: d.f14,
        changePct: d.f3,
        amountYuan: d.f6,
        netInflowEst: d.f62,
        upCount: d.f104,
        downCount: d.f105,
        leaderName: d.f128,
        leaderCode: d.f140,
        leaderChangePct: d.f136,
      }));
    }

    if (conRes.status === 'fulfilled' && conRes.value.ok) {
      const j: any = await conRes.value.json();
      concepts = (j?.data?.diff || []).map((d: any) => ({
        code: d.f12,
        name: d.f14,
        changePct: d.f3,
        amountYuan: d.f6,
        netInflowEst: d.f62,
        upCount: d.f104,
        downCount: d.f105,
        leaderName: d.f128,
        leaderCode: d.f140,
        leaderChangePct: d.f136,
      }));
    }

    if (breadthRes.status === 'fulfilled' && breadthRes.value.ok) {
      const j: any = await breadthRes.value.json();
      const rows: any[] = j?.data?.diff || [];
      for (const r of rows) {
        const up = typeof r.f104 === 'number' ? r.f104 : 0;
        const down = typeof r.f105 === 'number' ? r.f105 : 0;
        const flat = typeof r.f106 === 'number' ? r.f106 : 0;
        const amt = typeof r.f6 === 'number' ? r.f6 : 0;
        breadth.up += up;
        breadth.down += down;
        breadth.flat += flat;
        breadth.totalTurnoverYuan += amt;
        if (r.f12 === '000001' || r.f12 === '399001') {
          breadth.shSzTurnoverYuan += amt;
        }
        const key = r.f12 === '000001' ? 'sh' : r.f12 === '399001' ? 'sz' : 'bj';
        marketBreakdown[key] = {
          name: r.f12 === '000001' ? '沪市' : r.f12 === '399001' ? '深市' : '北交所',
          up,
          down,
          flat,
          amountYi: Number((amt / 1e8).toFixed(1)),
        };
      }
    }

    // Fallback turnover from Tencent indices if EastMoney ulist.np failed
    if (breadth.shSzTurnoverYuan === 0 && indices.length > 0) {
      const shAmt = indices.find((x) => x.code === 'sh000001')?.amountYuan || 0;
      const szAmt = indices.find((x) => x.code === 'sz399001')?.amountYuan || 0;
      const bjAmt = indices.find((x) => x.code === 'bj899050')?.amountYuan || 0;
      breadth.shSzTurnoverYuan = shAmt + szAmt;
      breadth.totalTurnoverYuan = shAmt + szAmt + bjAmt;
    }

    // 3. Limit-Up Pool, Limit-Down Pool, and Broken-Board Pool (matched on exact same trading date)
    for (const dtStr of getRecentTradingDateCandidates()) {
      try {
        const ztUrl = `https://push2ex.eastmoney.com/getTopicZTPool?ut=7eea3edcaed734bea9cbfc24409ed989&dpt=wz.ztzt&Pageindex=0&pagesize=150&sort=lbc%3Adesc&date=${dtStr}`;
        const dtUrl = `https://push2ex.eastmoney.com/getTopicDTPool?ut=7eea3edcaed734bea9cbfc24409ed989&dpt=wz.ztzt&Pageindex=0&pagesize=150&sort=fund%3Adesc&date=${dtStr}`;
        const zbUrl = `https://push2ex.eastmoney.com/getTopicZBPool?ut=7eea3edcaed734bea9cbfc24409ed989&dpt=wz.ztzt&Pageindex=0&pagesize=80&sort=zdp%3Adesc&date=${dtStr}`;

        const [ztRes, dtRes, zbRes] = await Promise.allSettled([
          fetch(ztUrl, { headers: UA_HEADERS, signal: AbortSignal.timeout(5000) }).then((r) => r.json()),
          fetch(dtUrl, { headers: UA_HEADERS, signal: AbortSignal.timeout(5000) }).then((r) => r.json()),
          fetch(zbUrl, { headers: UA_HEADERS, signal: AbortSignal.timeout(4000) }).then((r) => r.json()),
        ]);

        const ztJson: any = ztRes.status === 'fulfilled' ? ztRes.value : null;
        const dtJson: any = dtRes.status === 'fulfilled' ? dtRes.value : null;
        const zbJson: any = zbRes.status === 'fulfilled' ? zbRes.value : null;

        const ztItems = ztJson?.data?.pool || [];
        const dtItems = dtJson?.data?.pool || [];

        if (ztItems.length > 0 || dtItems.length > 0) {
          const actualQDate = String(ztJson?.data?.qdate || dtJson?.data?.qdate || dtStr);
          ztDate = `${actualQDate.slice(0, 4)}-${actualQDate.slice(4, 6)}-${actualQDate.slice(6, 8)}`;
          limitUpCount = typeof ztJson?.data?.tc === 'number' ? ztJson.data.tc : ztItems.length;
          limitDownCount = typeof dtJson?.data?.tc === 'number' ? dtJson.data.tc : dtItems.length;

          limitUpPool = ztItems.map((p: any) => {
            const lbc = p.lbc || 1;
            if (lbc > maxBoards) maxBoards = lbc;
            return {
              symbol: p.c,
              name: p.n,
              price: typeof p.p === 'number' ? p.p / 1000 : null,
              changePct: p.zdp,
              turnoverRate: p.hs,
              amountYuan: p.amount,
              floatMarketCap: p.ltsz,
              firstSealTime: p.fbt ? String(p.fbt).padStart(6, '0').replace(/(\d{2})(\d{2})(\d{2})/, '$1:$2:$3') : null,
              lastSealTime: p.lbt ? String(p.lbt).padStart(6, '0').replace(/(\d{2})(\d{2})(\d{2})/, '$1:$2:$3') : null,
              openTimes: typeof p.zbc === 'number' ? p.zbc : null,
              continuousBoards: lbc,
              industry: p.hybk || '未分类',
              sealAmount: p.fund || null,
            };
          });

          limitDownPool = dtItems.map((p: any) => ({
            symbol: p.c,
            name: p.n,
            price: typeof p.p === 'number' ? p.p / 1000 : null,
            changePct: p.zdp,
            turnoverRate: p.hs,
            amountYuan: p.amount,
            floatMarketCap: p.ltsz,
            lastSealTime: p.lbt ? String(p.lbt).padStart(6, '0').replace(/(\d{2})(\d{2})(\d{2})/, '$1:$2:$3') : null,
            openTimes: typeof p.oc === 'number' ? p.oc : null,
            continuousDownDays: p.days || 1,
            industry: p.hybk || '未分类',
            sealAmount: p.fund || p.fba || null,
          }));

          if (typeof zbJson?.data?.tc === 'number') {
            const zbCount: number = zbJson.data.tc;
            brokenBoardCount = zbCount;
            const totalAttempts = limitUpCount + zbCount;
            sealRatePct = totalAttempts > 0 ? Number(((limitUpCount / totalAttempts) * 100).toFixed(1)) : null;
          }
          break;
        }
      } catch {
        // try previous day
      }
    }

    // 4. Quantitative 6-state Market Sentiment Model (no AI guessing!)
    const totalStocks = breadth.up + breadth.down + breadth.flat;
    const upRatio = totalStocks > 0 ? (breadth.up / totalStocks) * 100 : 50;
    const turnoverYi = breadth.totalTurnoverYuan / 1e8;
    const shSzTurnoverYi = breadth.shSzTurnoverYuan / 1e8;

    let sentimentScore = 50;
    sentimentScore += (upRatio - 50) * 0.65;
    sentimentScore += Math.min(limitUpCount, 120) * 0.22;
    sentimentScore -= Math.min(limitDownCount, 100) * 0.45;
    if (maxBoards >= 6) sentimentScore += 7;
    else if (maxBoards >= 4) sentimentScore += 4;
    if (sealRatePct !== null) sentimentScore += (sealRatePct - 65) * 0.2;
    sentimentScore = Math.max(5, Math.min(98, Number(sentimentScore.toFixed(1))));

    let phaseLabel: '冰点' | '修复' | '回暖' | '高潮' | '分歧' | '退潮' = '修复';
    if (sentimentScore < 25 || (upRatio < 20 && limitUpCount < 25)) phaseLabel = '冰点';
    else if (sentimentScore >= 78 && upRatio > 65 && limitUpCount >= 70) phaseLabel = '高潮';
    else if (sentimentScore >= 60 && upRatio >= 52) phaseLabel = '回暖';
    else if (limitDownCount >= 25 && upRatio < 35) phaseLabel = '退潮';
    else if (brokenBoardCount !== null && brokenBoardCount > limitUpCount * 0.5 && limitUpCount >= 30) phaseLabel = '分歧';
    else if (limitDownCount >= 20 && upRatio < 38) phaseLabel = '退潮';
    else phaseLabel = '修复';

    await logQuality('eastmoney_push', 'market_overview', '延迟', Date.now() - t0);

    return {
      indices,
      breadth: {
        upCount: breadth.up,
        downCount: breadth.down,
        flatCount: breadth.flat,
        totalStocks,
        limitUpCount,
        limitDownCount,
        brokenBoardCount,
        sealRatePct,
        maxContinuousBoards: maxBoards,
        totalTurnoverYi: Number(turnoverYi.toFixed(1)),
        shSzTurnoverYi: Number(shSzTurnoverYi.toFixed(1)),
        upRatioPct: Number(upRatio.toFixed(1)),
        marketBreakdown,
      },
      sentiment: {
        phaseLabel,
        sentimentScore,
        quantitativeBasis: {
          upRatioPct: Number(upRatio.toFixed(1)),
          limitUpCount,
          limitDownCount,
          brokenBoardCount,
          sealRatePct,
          maxContinuousBoards: maxBoards,
          totalTurnoverYi: Number(turnoverYi.toFixed(1)),
        },
      },
      limitUpPool,
      limitDownPool,
      ztDate: ztDate || formatDateCN(),
      industries,
      concepts,
      provenance: {
        dataSource: '腾讯财经指数 + 东方财富沪深京全市场涨跌统计与涨跌停池',
        collectedAt: new Date().toISOString(),
        dataDate: indices[0]?.quoteDate || formatDateCN(),
        isRealtime: false,
        dataStatus: '延迟' as const,
        delayNotice: '全市场涨跌家数统计覆盖沪市(上证)、深市(深证)及北交所；板块资金流向为第三方估算口径',
      },
    };
  } catch (err: any) {
    await logQuality('eastmoney_push', 'market_overview', '接口未连接', Date.now() - t0, err.message);
    throw err;
  }
}

let cachedMarketOverview: { data: any; ts: number } | null = null;
export async function getCachedMarketOverviewAndSentiment(ttlMs = 60000) {
  if (cachedMarketOverview && Date.now() - cachedMarketOverview.ts < ttlMs) {
    return cachedMarketOverview.data;
  }
  const fresh = await fetchMarketOverviewAndSentiment();
  cachedMarketOverview = { data: fresh, ts: Date.now() };
  return fresh;
}

export async function fetchDragonTigerList() {
  const t0 = Date.now();
  try {
    const url =
      'https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=RPT_DAILYBILLBOARD_DETAILSNEW&columns=ALL&pageSize=30&pageNumber=1&sortColumns=TRADE_DATE,SECURITY_CODE&sortTypes=-1,-1';
    const resp = await fetch(url, { headers: UA_HEADERS, signal: AbortSignal.timeout(7000) });
    const json: any = await resp.json();
    const rows = (json?.result?.data || []).map((d: any) => ({
      symbol: d.SECURITY_CODE,
      name: d.SECURITY_NAME_ABBR,
      tradeDate: d.TRADE_DATE ? String(d.TRADE_DATE).slice(0, 10) : '',
      closePrice: d.CLOSE_PRICE,
      changePct: d.CHANGE_RATE,
      reason: d.EXPLANATION || '异动上榜',
      netBuyAmount: d.BILLBOARD_NET_AMT,
      buyAmount: d.BILLBOARD_BUY_AMT,
      sellAmount: d.BILLBOARD_SELL_AMT,
      turnoverRatio: d.DEAL_AMOUNT_RATIO,
      after1dPct: d.D1_CLOSE_ADJCHRATE ?? null,
      after3dPct: d.D3_CLOSE_ADJCHRATE ?? null,
      after5dPct: d.D5_CLOSE_ADJCHRATE ?? null,
    }));
    await logQuality('eastmoney_f10', 'dragon_tiger', '正常', Date.now() - t0);
    return {
      items: rows,
      provenance: {
        dataSource: '东方财富龙虎榜公开数据中心',
        collectedAt: new Date().toISOString(),
        dataDate: rows[0]?.tradeDate || formatDateCN(),
        isRealtime: false,
        dataStatus: (rows.length ? '正常' : '缺失') as '正常' | '缺失',
      },
    };
  } catch (err: any) {
    await logQuality('eastmoney_f10', 'dragon_tiger', '接口未连接', Date.now() - t0, err.message);
    return {
      items: [],
      provenance: {
        dataSource: '东方财富龙虎榜',
        collectedAt: new Date().toISOString(),
        dataDate: formatDateCN(),
        isRealtime: false,
        dataStatus: '接口未连接' as const,
      },
    };
  }
}

export async function fetchMacroIndicators() {
  const t0 = Date.now();
  const reports = [
    { key: 'CPI', name: '居民消费价格指数 (CPI同比)', report: 'RPT_ECONOMY_CPI', valField: 'NATIONAL_SAME', dateField: 'TIME', unit: '%' },
    { key: 'PPI', name: '工业生产者出厂价格指数 (PPI同比)', report: 'RPT_ECONOMY_PPI', valField: 'BASE_SAME', dateField: 'TIME', unit: '%' },
    { key: 'PMI', name: '中国制造业采购经理指数 (PMI)', report: 'RPT_ECONOMY_PMI', valField: 'MAKE_INDEX', dateField: 'TIME', unit: '点' },
    { key: 'M2', name: '广义货币供应量 (M2同比)', report: 'RPT_ECONOMY_CURRENCY_SUPPLY', valField: 'BASIC_CURRENCY_SAME', dateField: 'TIME', unit: '%' },
  ];

  const results: any[] = [];
  for (const r of reports) {
    try {
      const url = `https://datacenter-web.eastmoney.com/api/data/v1/get?reportName=${r.report}&columns=ALL&pageSize=6&pageNumber=1&sortColumns=REPORT_DATE&sortTypes=-1`;
      const resp = await fetch(url, { headers: UA_HEADERS, signal: AbortSignal.timeout(5000) });
      const json: any = await resp.json();
      const rows: any[] = json?.result?.data || [];
      if (rows.length > 0) {
        results.push({
          key: r.key,
          name: r.name,
          unit: r.unit,
          latestPeriod: rows[0][r.dateField] || String(rows[0].REPORT_DATE).slice(0, 10),
          latestValue: rows[0][r.valField],
          history: rows.map((row) => ({
            period: row[r.dateField] || String(row.REPORT_DATE).slice(0, 10),
            value: row[r.valField],
          })),
          dataStatus: '正常',
          dataSource: '东方财富宏观经济数据中心 (国家统计局/央行口径)',
        });
      }
    } catch {
      results.push({
        key: r.key,
        name: r.name,
        unit: r.unit,
        latestPeriod: '缺失',
        latestValue: null,
        history: [],
        dataStatus: '接口未连接',
        dataSource: '东方财富宏观经济数据中心',
      });
    }
  }
  await logQuality('eastmoney_f10', 'macro', '正常', Date.now() - t0);
  return results;
}
