import React, { useEffect, useState } from 'react';
import { Bell, History, Play, Shield, Database, Cpu } from 'lucide-react';
import { EquityCurveChart } from '../components/KlineChart';
import { apiFetch, downloadTextFile, formatPct, priceColorClass } from '../lib/api';
import { useAuth } from '../contexts/AuthContext';

interface BacktestAlertsSystemPageProps {
  defaultSection: 'backtest' | 'alerts_history' | 'system';
  activeSymbol: string;
  onSelectStock: (symbol: string) => void;
}

export const BacktestAlertsSystemPage: React.FC<BacktestAlertsSystemPageProps> = ({
  defaultSection,
  activeSymbol,
  onSelectStock,
}) => {
  const { user, signInWithGoogle } = useAuth();
  const [section, setSection] = useState(defaultSection);

  useEffect(() => {
    setSection(defaultSection);
  }, [defaultSection]);

  // Backtest state
  const [btSymbol, setBtSymbol] = useState(activeSymbol || '600519');
  const [btStrategy, setBtStrategy] = useState('MA_CROSS');
  const [btPeriod, setBtPeriod] = useState('1Y');
  const [btCapital, setBtCapital] = useState('500000');
  const [btStopLoss, setBtStopLoss] = useState('8');
  const [btTakeProfit, setBtTakeProfit] = useState('20');
  const [btResult, setBtResult] = useState<any>(null);
  const [btHistory, setBtHistory] = useState<any[]>([]);
  const [btLoading, setBtLoading] = useState(false);
  const [btError, setBtError] = useState<string | null>(null);

  // Predictions Review
  const [predictions, setPredictions] = useState<any[]>([]);
  const [trackingLoading, setTrackingLoading] = useState(false);

  // Alerts & Reports
  const [alertsData, setAlertsData] = useState<{ rules: any[]; events: any[] }>({ rules: [], events: [] });
  const [historyData, setHistoryData] = useState<{ reports: any[]; plans: any[] }>({ reports: [], plans: [] });
  const [newRuleSymbol, setNewRuleSymbol] = useState(activeSymbol || '600519');
  const [newRuleType, setNewRuleType] = useState('突破压力位');
  const [newRuleThreshold, setNewRuleThreshold] = useState('');

  // System & Settings
  const [settings, setSettings] = useState<any>(null);
  const [sysOverview, setSysOverview] = useState<any>(null);
  const [customApiKey, setCustomApiKey] = useState('');
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [testingAi, setTestingAi] = useState(false);

  const loadWorkspaceData = async () => {
    if (!user) return;
    try {
      if (section === 'backtest') {
        const [btRes, predRes] = await Promise.all([
          apiFetch('/api/backtests'),
          apiFetch('/api/predictions'),
        ]);
        setBtHistory(btRes.items || []);
        setPredictions(predRes.items || []);
      } else if (section === 'alerts_history') {
        const [alRes, histRes] = await Promise.all([
          apiFetch('/api/alerts'),
          apiFetch('/api/research/history'),
        ]);
        setAlertsData(alRes);
        setHistoryData(histRes);
      } else if (section === 'system') {
        const [setRes, sysRes] = await Promise.all([
          apiFetch('/api/user/settings'),
          apiFetch('/api/system/overview'),
        ]);
        setSettings(setRes);
        setSysOverview(sysRes);
      }
    } catch {
      // handled per section
    }
  };

  useEffect(() => {
    loadWorkspaceData();
  }, [section, user]);

  const handleRunBacktest = async () => {
    if (!user) {
      await signInWithGoogle();
      return;
    }
    setBtLoading(true);
    setBtError(null);
    try {
      const res = await apiFetch('/api/backtests/run', {
        method: 'POST',
        body: JSON.stringify({
          symbol: btSymbol,
          strategyType: btStrategy,
          periodLabel: btPeriod,
          initialCapital: Number(btCapital),
          stopLossPct: Number(btStopLoss),
          takeProfitPct: Number(btTakeProfit),
        }),
      });
      setBtResult(res.backtest);
      setBtHistory((prev) => [res.backtest, ...prev]);
    } catch (err: any) {
      setBtError(err.message);
    } finally {
      setBtLoading(false);
    }
  };

  const handleTrackPredictions = async () => {
    setTrackingLoading(true);
    try {
      const res = await apiFetch('/api/predictions/track', { method: 'POST' });
      setPredictions(res.items || []);
    } finally {
      setTrackingLoading(false);
    }
  };

  const handleCreateAlertRule = async () => {
    try {
      await apiFetch('/api/alerts/rules', {
        method: 'POST',
        body: JSON.stringify({
          symbol: newRuleSymbol,
          ruleType: newRuleType,
          thresholdValue: newRuleThreshold ? Number(newRuleThreshold) : null,
        }),
      });
      loadWorkspaceData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleEvaluateAlerts = async () => {
    try {
      await apiFetch('/api/alerts/evaluate', { method: 'POST' });
      loadWorkspaceData();
    } catch {
      // ignore
    }
  };

  const handleSaveSettings = async () => {
    if (!settings) return;
    setSaveMsg('正在保存...');
    try {
      await apiFetch('/api/user/settings', {
        method: 'PUT',
        body: JSON.stringify({
          ...settings,
          aiApiKeyPlain: customApiKey.trim() || undefined,
        }),
      });
      setCustomApiKey('');
      setSaveMsg('配置已加密保存至服务端 PostgreSQL');
      loadWorkspaceData();
      setTimeout(() => setSaveMsg(null), 3500);
    } catch (err: any) {
      setSaveMsg(`保存失败: ${err.message}`);
    }
  };

  const handleTestAiConnection = async () => {
    if (!settings) return;
    setTestingAi(true);
    setSaveMsg('正在测试 AI 接口连通性...');
    try {
      const res = await apiFetch('/api/user/test-ai', {
        method: 'POST',
        body: JSON.stringify({
          aiProviderType: settings.aiProviderType,
          aiBaseUrl: settings.aiBaseUrl,
          aiModelName: settings.aiModelName,
          aiApiKeyPlain: customApiKey.trim() || undefined,
        }),
      });
      setSaveMsg(`连通成功 (${res.model} · ${res.latencyMs}ms · 回复: ${res.replyPreview})`);
    } catch (err: any) {
      setSaveMsg(`连通失败: ${err.message}`);
    } finally {
      setTestingAi(false);
    }
  };

  if (!user) {
    return (
      <div className="p-10 bg-white border border-slate-200 rounded-lg text-center space-y-4">
        <h2 className="text-lg font-semibold text-slate-900">请先登录个人投研工作台</h2>
        <p className="text-xs text-slate-500 max-w-md mx-auto">
          历史回测、AI预测自动复盘、站内预警规则、研究档案与加密AI密钥均需绑定您的账号安全隔离存储在 Cloud SQL PostgreSQL 中。
        </p>
        <button
          onClick={signInWithGoogle}
          className="px-5 py-2.5 text-sm font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800"
        >
          使用 Google 账号登录
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-slate-900">
          {section === 'backtest'
            ? '历史回测与AI预测自动复盘中心'
            : section === 'alerts_history'
            ? '风险预警与历史研究档案中心'
            : '数据源、动态交易规则、风控与AI模型管理'}
        </h1>
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
          {[
            { id: 'backtest', label: '回测与自动复盘' },
            { id: 'alerts_history', label: '预警与研究档案' },
            { id: 'system', label: '规则、数据源与设置' },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setSection(t.id as any)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap shrink-0 ${
                section === t.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* SECTION 1: BACKTEST & AUTO REVIEW */}
      {section === 'backtest' && (
        <div className="space-y-6">
          <div className="p-5 bg-white border border-slate-200 rounded-lg space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">
                A股合规历史回测引擎（强制T+1 · 涨跌停不可成交 · 无未来函数）
              </h2>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 text-xs">
              <div>
                <label className="block text-slate-500 mb-1">股票代码</label>
                <input
                  value={btSymbol}
                  onChange={(e) => setBtSymbol(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-500 mb-1">策略模型</label>
                <select
                  value={btStrategy}
                  onChange={(e) => setBtStrategy(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"
                >
                  <option value="MA_CROSS">双均线趋势 (MA5/MA20)</option>
                  <option value="BOLL_RSI">布林+RSI均值回归</option>
                  <option value="BREAKOUT_MOMENTUM">20日突破+MACD动量</option>
                  <option value="VALUE_DISCIPLINE">长线低估偏离定投</option>
                </select>
              </div>
              <div>
                <label className="block text-slate-500 mb-1">回测周期</label>
                <select
                  value={btPeriod}
                  onChange={(e) => setBtPeriod(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"
                >
                  {['30D', '90D', '180D', '1Y', '3Y', '5Y'].map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-slate-500 mb-1">初始资金 (元)</label>
                <input
                  value={btCapital}
                  onChange={(e) => setBtCapital(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono"
                />
              </div>
              <div>
                <label className="block text-slate-500 mb-1">止损线 (%)</label>
                <input
                  value={btStopLoss}
                  onChange={(e) => setBtStopLoss(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono"
                />
              </div>
              <div className="flex items-end">
                <button
                  onClick={handleRunBacktest}
                  disabled={btLoading}
                  className="w-full px-4 py-2 text-xs font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800 inline-flex items-center justify-center gap-1.5 whitespace-nowrap"
                >
                  <Play className="w-3.5 h-3.5" />
                  {btLoading ? '回测计算中...' : '运行真实历史回测'}
                </button>
              </div>
            </div>
            {btError && <div className="text-xs text-red-600">{btError}</div>}
          </div>

          {btResult && (
            <div className="p-5 bg-white border border-slate-200 rounded-lg space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 text-xs border-b border-slate-100 pb-4">
                <div>
                  <div className="text-slate-500">策略总收益率 / 基准</div>
                  <div className={`mt-1 text-lg font-semibold font-mono ${priceColorClass(btResult.totalReturnPct)}`}>
                    {formatPct(btResult.totalReturnPct)}
                    <span className="text-xs text-slate-500 ml-1">({formatPct(btResult.benchmarkReturnPct)})</span>
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">年化收益率 / 夏普</div>
                  <div className="mt-1 text-lg font-semibold font-mono text-slate-900">
                    {formatPct(btResult.annualReturnPct)} · {btResult.sharpeRatio}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">胜率 / 盈亏比</div>
                  <div className="mt-1 text-lg font-semibold font-mono text-slate-900">
                    {btResult.winRatePct}% · {btResult.profitLossRatio}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">最大回撤 / 单笔最大亏</div>
                  <div className="mt-1 text-lg font-semibold font-mono text-emerald-700">
                    -{btResult.maxDrawdownPct}% / {btResult.maxSingleLossPct}%
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">成交笔数 / 平均持仓</div>
                  <div className="mt-1 text-lg font-semibold font-mono text-slate-900">
                    {btResult.tradeCount} 笔 · {btResult.avgHoldingDays} 天
                  </div>
                </div>
              </div>

              <EquityCurveChart curve={btResult.equityCurve || []} />

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 space-y-1">
                <div>合规核验：{btResult.complianceChecks?.noLookAheadBias}</div>
                <div>规则约束：{btResult.complianceChecks?.priceLimitRuleApplied} · 费用：{btResult.complianceChecks?.feesApplied}</div>
              </div>
            </div>
          )}

          {/* AI Prediction Auto Tracking */}
          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <History className="w-4 h-4 text-slate-600" />
                AI预测历史留痕与 1/3/5/10/20 日自动复盘
              </h2>
              <button
                onClick={handleTrackPredictions}
                disabled={trackingLoading}
                className="px-3 py-1.5 text-xs font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 whitespace-nowrap"
              >
                {trackingLoading ? '正在核对真实行情...' : '同步最新行情自动复盘'}
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="text-left px-4 py-2.5">预测日期</th>
                    <th className="text-left px-4 py-2.5">标的</th>
                    <th className="text-left px-4 py-2.5">观点 / 基准价</th>
                    <th className="text-right px-4 py-2.5">1日表现</th>
                    <th className="text-right px-4 py-2.5">3日表现</th>
                    <th className="text-right px-4 py-2.5">5日表现</th>
                    <th className="text-right px-4 py-2.5">10日表现</th>
                    <th className="text-right px-4 py-2.5">20日表现</th>
                    <th className="text-left px-4 py-2.5">复盘判定</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                  {predictions.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-4 py-6 text-center font-sans text-slate-500">
                        暂无AI预测留痕，在个股研究中执行「启动AI多角色研究」后将自动记录于此。
                      </td>
                    </tr>
                  ) : (
                    predictions.map((p) => (
                      <tr key={p.id} className="hover:bg-slate-50">
                        <td className="px-4 py-2 text-slate-500">{p.predictDate}</td>
                        <td className="px-4 py-2 font-sans">
                          <button onClick={() => onSelectStock(p.symbol)} className="text-blue-700 hover:underline font-medium">
                            {p.stockName} ({p.symbol})
                          </button>
                        </td>
                        <td className="px-4 py-2 font-sans text-slate-800">
                          {p.stance} @ {p.basePrice}
                        </td>
                        {[p.ret1d, p.ret3d, p.ret5d, p.ret10d, p.ret20d].map((r, idx) => (
                          <td key={idx} className={`px-4 py-2 text-right ${priceColorClass(r)}`}>
                            {r !== null && r !== undefined ? formatPct(r) : '-'}
                          </td>
                        ))}
                        <td className="px-4 py-2 font-sans font-medium text-slate-900">{p.outcomeStatus}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 2: ALERTS & RESEARCH ARCHIVES */}
      {section === 'alerts_history' && (
        <div className="space-y-6">
          <div className="p-5 bg-white border border-slate-200 rounded-lg space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <Bell className="w-4 h-4 text-slate-600" />
                创建价格/放量/涨跌停预警规则（含防重复冷却）
              </h2>
              <button
                onClick={handleEvaluateAlerts}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200"
              >
                立即巡检触发预警
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs">
              <input
                value={newRuleSymbol}
                onChange={(e) => setNewRuleSymbol(e.target.value)}
                placeholder="6位股票代码"
                className="px-3 py-2 border border-slate-200 rounded-lg font-mono"
              />
              <select
                value={newRuleType}
                onChange={(e) => setNewRuleType(e.target.value)}
                className="px-3 py-2 border border-slate-200 rounded-lg bg-white"
              >
                <option value="突破压力位">股价突破设定阈值</option>
                <option value="跌破支撑">股价跌破设定支撑</option>
                <option value="放量异常">量比放量异常</option>
                <option value="涨跌停">涨停或跌停异动</option>
              </select>
              <input
                value={newRuleThreshold}
                onChange={(e) => setNewRuleThreshold(e.target.value)}
                placeholder="阈值（如目标价或量比2.0）"
                className="px-3 py-2 border border-slate-200 rounded-lg font-mono"
              />
              <button
                onClick={handleCreateAlertRule}
                className="px-4 py-2 font-medium text-white bg-blue-700 rounded-lg hover:bg-blue-800"
              >
                新增预警规则
              </button>
            </div>

            {alertsData.events.length > 0 && (
              <div className="pt-3 border-t border-slate-100 space-y-2">
                <div className="text-xs font-semibold text-slate-800">最近触发记录</div>
                {alertsData.events.map((ev) => (
                  <div key={ev.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs flex justify-between">
                    <div>
                      <span className="font-medium text-slate-900">{ev.eventTitle}</span>
                      <span className="mx-2 text-slate-400">·</span>
                      <span className="text-slate-600">{ev.actualData}</span>
                    </div>
                    <span className="font-mono text-slate-500">{new Date(ev.triggeredAt).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 text-sm font-semibold text-slate-900">
              历史深度研究报告档案 ({historyData.reports.length})
            </div>
            <div className="divide-y divide-slate-100">
              {historyData.reports.length === 0 ? (
                <div className="p-6 text-xs text-slate-500">暂无已保存研究报告。</div>
              ) : (
                historyData.reports.map((rep) => (
                  <div key={rep.id} className="px-5 py-3 flex items-center justify-between gap-4 text-xs hover:bg-slate-50">
                    <div>
                      <button onClick={() => onSelectStock(rep.symbol)} className="font-medium text-blue-700 hover:underline">
                        {rep.title}
                      </button>
                      <div className="mt-0.5 text-slate-500">
                        模型版本：{rep.modelVersion} · 生成时间：{new Date(rep.createdAt).toLocaleString()}
                      </div>
                    </div>
                    <button
                      onClick={() => downloadTextFile(`${rep.symbol}_研究报告.md`, rep.reportMarkdown)}
                      className="text-slate-700 hover:text-blue-700 font-medium whitespace-nowrap"
                    >
                      下载 Markdown
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* SECTION 3: SYSTEM, RISK SETTINGS, DATA SOURCES, RULES */}
      {section === 'system' && (
        <div className="space-y-6">
          {settings && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Risk Budget Settings */}
              <div className="p-5 bg-white border border-slate-200 rounded-lg space-y-4 text-xs">
                <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2 border-b border-slate-100 pb-2.5">
                  <Shield className="w-4 h-4 text-slate-600" />
                  个人资金与风险预算硬约束配置
                </h2>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-500 mb-1">账户总资金 (元)</label>
                    <input
                      type="number"
                      value={settings.totalCapital}
                      onChange={(e) => setSettings({ ...settings, totalCapital: Number(e.target.value) })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 mb-1">单笔交易最大允许亏损 (%)</label>
                    <input
                      type="number"
                      step="0.5"
                      value={settings.maxSingleLossPct}
                      onChange={(e) => setSettings({ ...settings, maxSingleLossPct: Number(e.target.value) })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 mb-1">单只股票最大仓位上限 (%)</label>
                    <input
                      type="number"
                      value={settings.maxPositionPerStockPct}
                      onChange={(e) => setSettings({ ...settings, maxPositionPerStockPct: Number(e.target.value) })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 mb-1">总持仓上限 (%)</label>
                    <input
                      type="number"
                      value={settings.maxTotalExposurePct}
                      onChange={(e) => setSettings({ ...settings, maxTotalExposurePct: Number(e.target.value) })}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* AI Provider Config (Server-Side Encrypted) */}
              <div className="p-5 bg-white border border-slate-200 rounded-lg space-y-4 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                  <h2 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                    <Cpu className="w-4 h-4 text-slate-600" />
                    AI多角色研究模型配置（密钥服务端 AES-256-GCM 加密）
                  </h2>
                  <button
                    type="button"
                    onClick={() =>
                      setSettings({
                        ...settings,
                        aiProviderType: 'deepseek',
                        aiBaseUrl: 'https://api.deepseek.com',
                        aiModelName: 'deepseek-chat',
                      })
                    }
                    className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-blue-700 font-medium rounded"
                  >
                    一键填入 DeepSeek 默认
                  </button>
                </div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-slate-500 mb-1">模型服务通道</label>
                    <select
                      value={settings.aiProviderType}
                      onChange={(e) => {
                        const v = e.target.value;
                        setSettings({
                          ...settings,
                          aiProviderType: v,
                          aiBaseUrl:
                            v === 'deepseek' ? 'https://api.deepseek.com' : settings.aiBaseUrl || 'https://api.deepseek.com',
                          aiModelName:
                            v === 'gemini'
                              ? 'gemini-4-hydrogen'
                              : settings.aiModelName && settings.aiModelName !== 'gemini-4-hydrogen'
                              ? settings.aiModelName
                              : 'deepseek-chat',
                        });
                      }}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg bg-white"
                    >
                      <option value="deepseek">DeepSeek 官方接口 (deepseek-chat / deepseek-reasoner)</option>
                      <option value="openai_compatible">自定义 OpenAI 兼容接口 (Qwen / GLM / OpenAI)</option>
                      <option value="gemini">内置服务端 Gemini 引擎 (默认，免填Key)</option>
                    </select>
                  </div>
                  {(settings.aiProviderType === 'deepseek' || settings.aiProviderType === 'openai_compatible') && (
                    <>
                      <div>
                        <label className="block text-slate-500 mb-1">接口地址 (Base URL)</label>
                        <input
                          value={settings.aiBaseUrl || ''}
                          onChange={(e) => setSettings({ ...settings, aiBaseUrl: e.target.value })}
                          placeholder="https://api.deepseek.com"
                          className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-slate-500 mb-1">模型名称</label>
                          {settings.aiProviderType === 'deepseek' ? (
                            <select
                              value={settings.aiModelName || 'deepseek-chat'}
                              onChange={(e) => setSettings({ ...settings, aiModelName: e.target.value })}
                              className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono bg-white"
                            >
                              <option value="deepseek-chat">deepseek-chat (DeepSeek-V3)</option>
                              <option value="deepseek-reasoner">deepseek-reasoner (DeepSeek-R1)</option>
                            </select>
                          ) : (
                            <input
                              value={settings.aiModelName || ''}
                              onChange={(e) => setSettings({ ...settings, aiModelName: e.target.value })}
                              placeholder="deepseek-chat"
                              className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono"
                            />
                          )}
                        </div>
                        <div>
                          <label className="block text-slate-500 mb-1">
                            API Key {settings.aiApiKeyConfigured ? `(已保存 ****${settings.aiApiKeyLast4})` : ''}
                          </label>
                          <input
                            type="password"
                            value={customApiKey}
                            onChange={(e) => setCustomApiKey(e.target.value)}
                            placeholder="输入新 sk-... 密钥将加密覆盖"
                            className="w-full px-3 py-2 border border-slate-200 rounded-lg font-mono"
                          />
                        </div>
                      </div>
                    </>
                  )}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
                  <span className="text-blue-700 flex-1">{saveMsg || ''}</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleTestAiConnection}
                      disabled={testingAi}
                      className="px-3 py-2 font-medium text-slate-700 bg-slate-100 rounded-lg hover:bg-slate-200 disabled:opacity-60 whitespace-nowrap"
                    >
                      {testingAi ? '测试中...' : '测试接口连接'}
                    </button>
                    <button
                      onClick={handleSaveSettings}
                      className="px-4 py-2 font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 whitespace-nowrap"
                    >
                      保存风控与模型设置
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Data Sources & Rules */}
          {sysOverview && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-200 text-sm font-semibold text-slate-900 flex items-center gap-2">
                  <Database className="w-4 h-4 text-slate-600" />
                  数据源状态与授权口径清单
                </div>
                <div className="divide-y divide-slate-100 text-xs">
                  {(sysOverview.sources || []).map((s: any) => (
                    <div key={s.sourceKey} className="p-4 space-y-1">
                      <div className="flex items-center justify-between font-medium text-slate-900">
                        <span>{s.sourceName}</span>
                        <span className={s.status === '接口未连接' ? 'text-amber-700' : 'text-emerald-700'}>
                          {s.status} · {s.licenseType}
                        </span>
                      </div>
                      <div className="text-slate-500">{s.rateLimitNote}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                <div className="px-5 py-3.5 border-b border-slate-200 text-sm font-semibold text-slate-900">
                  A股动态交易规则引擎版本库
                </div>
                <div className="divide-y divide-slate-100 text-xs">
                  {(sysOverview.rules || []).map((r: any) => (
                    <div key={r.ruleCode} className="p-4 space-y-1">
                      <div className="flex items-center justify-between font-medium text-slate-900">
                        <span>{r.ruleName}</span>
                        <span className="font-mono text-slate-600">
                          {r.priceLimitPct !== null ? `±${r.priceLimitPct}%` : '无限制'} · {r.tPlusRule}
                        </span>
                      </div>
                      <div className="text-slate-500">
                        生效：{r.effectiveDate} · 最小申报：{r.minOrderQty}股（{r.qtyStep}股递增） · 印花税(卖)：{r.stampDutySellPct}%
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
