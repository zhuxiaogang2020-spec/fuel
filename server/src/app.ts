import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import fs from 'fs';
import path from 'path';
import { query } from './db/connection';
import authRoutes from './routes/auth';
import stationsRoutes from './routes/stations';
import recordsRoutes from './routes/records';
import vehiclesRoutes from './routes/vehicles';
import pricesRoutes from './routes/prices';
import config from './config/index';
import { startScheduler, stopScheduler, manualScrape } from './services/scheduler';
import { forceRefreshCity } from './services/priceFetchService';

const app = express();

/**
 * 按分号拆分多条 SQL 语句（跳过空行和纯注释行）
 */
function splitStatements(sql: string): string[] {
  return sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0 && !/^--/.test(s))
    .map(s => s + ';');
}

async function runMigrations(): Promise<void> {
  const migrationsDir = path.join(__dirname, 'db');
  const files = ['migration_add_price_fetch_state.sql', 'migration_add_gasbuddy.sql', 'migration_add_vehicles.sql'];
  
  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    if (!fs.existsSync(filePath)) {
      console.log(`[Migrations] 跳过 ${file}（文件不存在）`);
      continue;
    }
    try {
      const sql = fs.readFileSync(filePath, 'utf8');
      // pool.execute() 不支持多语句，需拆分后逐条执行
      const statements = splitStatements(sql);
      for (const stmt of statements) {
        await query(stmt);
      }
      console.log(`[Migrations] ${file} 已执行`);
    } catch (err: any) {
      // 表已存在等错误可以忽略
      if (err.code === 'ER_TABLE_EXISTS_ERROR' || err.errno === 1050) {
        console.log(`[Migrations] ${file} 已存在，跳过`);
      } else {
        console.warn(`[Migrations] ${file} 执行警告:`, err.message);
      }
    }
  }
}

// 中间件
app.use(cors());
app.use(helmet({
  contentSecurityPolicy: false, // 微信小程序需要
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 请求日志
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// 健康检查
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    mock: config.mock.enabled,
  });
});

// API 路由
app.use('/api/auth', authRoutes);
app.use('/api/stations', stationsRoutes);
app.use('/api/records', recordsRoutes);
app.use('/api/vehicles', vehiclesRoutes);
app.use('/api/prices', pricesRoutes);

// GasBuddy 爬虫手动触发（调试用）
// POST /api/scrape/gasbuddy  { city?, mode? }
//   city: 可选，城市名
//   mode: 可选，'api' (GraphQL默认) | 'stealth' (Playwright反爬)
app.post('/api/scrape/gasbuddy', async (req, res) => {
  const city = req.body?.city as string | undefined;
  const mode = req.body?.mode as 'api' | 'stealth' | undefined;
  try {
    const result = await manualScrape(city, mode);
    res.json({ success: true, result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GasBuddy 直接调 FastAPI（调试用，FastAPI 自带缓存）
// POST /api/scrape/refresh-city  { city: "Vancouver, BC" }
app.post('/api/scrape/refresh-city', async (req, res) => {
  const city = req.body?.city as string;
  if (!city) return res.status(400).json({ success: false, error: '缺少 city 参数' });
  try {
    const result = await forceRefreshCity(city);
    res.json({ success: true, result });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 404 处理
app.use((_req, res) => {
  res.status(404).json({ error: '接口不存在' });
});

// 错误处理
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('全局错误:', err);
  res.status(500).json({
    error: '服务器内部错误',
    message: config.mock.enabled ? err.message : undefined,
  });
});

// 启动服务器
const PORT = config.port;

// 先跑迁移再监听端口
runMigrations().then(() => {
  app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════╗
║     Fuel2 Backend Server Started       ║
╚══════════════════════════════════════╝
  Port: ${PORT}
  Mock Mode: ${config.mock.enabled}
  DB Host: ${config.db.host}
  API Endpoints:
    - POST /api/auth/login
    - GET  /api/stations/nearby
    - POST /api/records
    - GET  /api/prices/compare
    - POST /api/scrape/refresh-city
  Health: GET /health
  `);

    // ⚠️ 定时爬虫已禁用，改用按需爬取策略（远程 FastAPI 服务）
    // 如需启用定时爬虫，取消下行注释：
    // startScheduler();
    console.log('[Server] 按需爬取模式已就绪（远程 GasBuddy FastAPI）');
  });
});

// 优雅关闭
process.on('SIGTERM', async () => {
  console.log('[Server] 收到 SIGTERM，正在关闭...');
  stopScheduler();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[Server] 收到 SIGINT，正在关闭...');
  stopScheduler();
  process.exit(0);
});

// 定期清理过期缓存（每 30 分钟）
setInterval(
  async () => {
    try {
      await query('DELETE FROM cached_grids WHERE expires_at < NOW()');
      console.log('[Cache] 已清理过期缓存');
    } catch (error) {
      console.error('[Cache] 清理过期缓存失败:', (error as Error).message);
    }
  },
  30 * 60 * 1000
);

export default app;
