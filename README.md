# China Stock Intelligence V3.0 (A股AI智能研究与投资决策系统)

## 系统定位
个人使用的 A 股研究与投资决策辅助平台，坚持 **数据真实优先、证据优先于观点、风险控制优先于收益预测、长期与短线分离分析、默认不自动下单** 的原则。

## 技术栈
- **前端**: React 19 + TypeScript + Tailwind CSS + TradingView Lightweight Charts
- **后端**: Node.js 22 + Express + TypeScript (`server.ts`, Port 3000)
- **数据库**: Cloud SQL PostgreSQL + Drizzle ORM (35 张结构化数据表)
- **鉴权**: Firebase Authentication (Google OAuth) + 服务端 Admin Token 校验
- **AI 引擎**: 服务端 `@google/genai` (默认 `gemini-4-hydrogen`) + 支持用户配置 OpenAI 兼容接口（服务端 AES-256-GCM 加密存储密钥）

## 核心功能模块
1. **A股市场监控中心**: 五大指数、涨跌广度、涨停/跌停/炸板与封板率、6态纯量化市场情绪模型、连板梯队、行业/概念轮动、龙虎榜及宏观指标(CPI/PPI/PMI/M2)。
2. **全市场搜索、筛选与对比**: 覆盖沪深主板、创业板、科创板、北交所，识别 ST/*ST 与退市风险，支持多条件选股、多股横向对比与个人自选股池。
3. **个股深度研究**: 实时/延迟快照、1m-60m/日/周/月前复权 K 线、MA/EMA/MACD/RSI/KDJ/BOLL/ATR/OBV/VWAP 技术指标、F10 财务与红旗异常体检、同业可比公司、巨潮资讯公告原文直达。
4. **价值与短线双轨评估**: 三情景估值模型(乐观/中性/悲观)与安全边际、第三方主力资金估算口径强制声明、双轨 100 分可溯源评分。
5. **AI 多角色研究与风控计划**: 9 位独立 AI 研究员 + 首席研究员汇总分歧并严格区分真实数据/计算/观点/推断/预测；依据风险预算与止损距离计算股数。
6. **历史回测与自动复盘**: 强制 T+1、涨跌停一字板不可成交、滑点/印花税/过户费与无未来函数校验；AI 预测留痕与 1/3/5/10/20 日自动收益率核对。
7. **预警与系统管理**: 站内价格/放量/涨跌停预警冷却去重、Markdown/CSV/打印PDF 报告导出、A股动态交易规则引擎版本库、数据源质量日志。

## 本地与云端启动方式
1. 安装依赖：`npm install`
2. 推送 PostgreSQL Schema：`npx drizzle-kit push --config=src/db/drizzle.config.ts`
3. 开发模式启动：`npm run dev`
4. 生产构建与启动：`npm run build && npm run start`
5. 引擎自检测试：`npx tsx scripts/verify-engines.ts`
