import { Router, Request, Response } from 'express';
import pool from '../db/connection';
import { calculateFuelEfficiency, getFuelEfficiencyHistory } from '../services/fuelCalc';
import { authMiddleware } from '../middleware/auth';
import { rateLimitMiddleware } from '../middleware/rateLimit';

const router = Router();

// 所有路由需要认证和流控
router.use(authMiddleware);
router.use(rateLimitMiddleware);

/**
 * POST /api/records
 * 创建加油记录
 * Body: { stationId, grade, amount, volume?, odometer, isFullTank?, receiptUrl? }
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const {
      stationId,
      grade,
      amount,
      volume,
      odometer,
      vehicleId,
      isFullTank,
      receiptUrl,
    } = req.body;

    if (!stationId || !grade || !amount || !odometer) {
      return res.status(400).json({ error: '缺少必要参数' });
    }

    // 验证油号
    const validGrades = ['regular', 'mid', 'premium', 'diesel'];
    if (!validGrades.includes(grade)) {
      return res.status(400).json({ error: '无效的油号' });
    }

    // stationId 可能是外部ID（如 "gasbuddy_4441"），需要查 stations 表获取整数 id
    let realStationId: number;
    if (typeof stationId === 'number' || /^\d+$/.test(String(stationId))) {
      // 纯数字，可能是 stations.id 或 stations.external_id，先按 id 查
      const numId = Number(stationId);
      const station = await queryOne<{ id: number }>(
        'SELECT id FROM stations WHERE id = ? OR external_id = ? OR external_id = CONCAT(\'gasbuddy_\', ?) LIMIT 1',
        [numId, String(stationId), String(stationId)]
      );
      if (station) {
        realStationId = station.id;
      } else {
        // 纯数字且 DB 不存在，同样自动创建（如 GasBuddy 原始站点）
        const stName = req.body.stationName || String(stationId);
        const stBrand = req.body.stationBrand || '';
        const stAddress = req.body.stationAddress || '';
        const stLat = parseFloat(req.body.stationLat) || 0;
        const stLng = parseFloat(req.body.stationLng) || 0;
        const insertResult = await execute(
          `INSERT INTO stations (external_id, source, name, brand, address, lat, lng)
           VALUES (?, 'gasbuddy', ?, ?, ?, ?, ?)`,
          [String(stationId), stName, stBrand, stAddress, stLat, stLng]
        );
        realStationId = (insertResult as any).insertId;
        console.log('[Records] 自动创建加油站记录(纯数字):', String(stationId), stName);
      }
    } else {
      // 非纯数字（如 "gasbuddy_4441"），按 external_id 查
      const station = await queryOne<{ id: number }>(
        'SELECT id FROM stations WHERE external_id = ? LIMIT 1',
        [String(stationId)]
      );
      if (station) {
        realStationId = station.id;
      } else {
        // 自动创建新站记录（GasBuddy 等外部站首次加油时）
        const stName = req.body.stationName || String(stationId);
        const stBrand = req.body.stationBrand || '';
        const stAddress = req.body.stationAddress || '';
        const stLat = parseFloat(req.body.stationLat) || 0;
        const stLng = parseFloat(req.body.stationLng) || 0;
        const insertResult = await execute(
          `INSERT INTO stations (external_id, source, name, brand, address, lat, lng)
           VALUES (?, 'gasbuddy', ?, ?, ?, ?, ?)`,
          [String(stationId), stName, stBrand, stAddress, stLat, stLng]
        );
        realStationId = (insertResult as any).insertId;
        console.log('[Records] 自动创建加油站记录:', String(stationId), stName);
      }
    }

    // 插入记录
    const result = await execute(
      `INSERT INTO refuel_records 
       (user_id, vehicle_id, station_id, grade, amount, volume, odometer, is_full_tank, receipt_url)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        vehicleId || null,
        realStationId,
        grade,
        amount,
        volume || null,
        odometer,
        isFullTank ? 1 : 0,
        receiptUrl || null,
      ]
    );

    const recordId = (result as any).insertId;

    // 如果有车辆ID，更新该车辆的默认油号（记住上次加的什么油）
    if (vehicleId) {
      await execute(
        'UPDATE vehicles SET last_grade = ? WHERE id = ? AND user_id = ?',
        [grade, vehicleId, userId]
      );
    }

    // 如果是加满，尝试计算油耗
    let efficiency = null;
    if (isFullTank) {
      const user = await queryOne<any>('SELECT country FROM users WHERE id = ?', [userId]);
      efficiency = await calculateFuelEfficiency(userId, recordId, user?.country || 'CN');

      // 更新油耗到记录
      if (efficiency) {
        await execute(
          'UPDATE refuel_records SET fuel_efficiency = ?, efficiency_unit = ? WHERE id = ?',
          [efficiency.value, efficiency.unit, recordId]
        );
      }
    }

    return res.json({
      success: true,
      recordId,
      fuelEfficiency: efficiency,
    });
  } catch (error: any) {
    console.error('创建加油记录错误:', error.message);
    return res.status(500).json({ error: '创建加油记录失败' });
  }
});

/**
 * GET /api/records
 * 获取用户加油记录列表
 * Query: limit?, offset?
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;
    const vehicleId = req.query.vehicleId ? parseInt(req.query.vehicleId as string) : null;

    let sql = `SELECT r.*, s.name as station_name, s.brand, s.address
       FROM refuel_records r
       LEFT JOIN stations s ON r.station_id = s.id
       WHERE r.user_id = ?`;
    const params: any[] = [userId];

    if (vehicleId) {
      sql += ' AND r.vehicle_id = ?';
      params.push(vehicleId);
    }

    sql += ' ORDER BY r.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const records = await query<any>(sql, params);

    return res.json({ success: true, records });
  } catch (error: any) {
    console.error('获取加油记录错误:', error.message);
    return res.status(500).json({ error: '获取加油记录失败' });
  }
});

/**
 * GET /api/records/stats
 * 获取用户统计数据
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const vehicleId = req.query.vehicleId ? parseInt(req.query.vehicleId as string) : null;

    if (!vehicleId) {
      return res.status(400).json({ error: '请选择车辆' });
    }

    let statsSql = `SELECT 
        COUNT(*) as total_count,
        SUM(amount) as total_amount,
        SUM(volume) as total_volume,
        AVG(fuel_efficiency) as avg_efficiency
       FROM refuel_records
       WHERE user_id = ? AND vehicle_id = ?`;
    const statsParams: any[] = [userId, vehicleId];

    const stats = await queryOne<any>(statsSql, statsParams);

    // 获取油耗历史
    const user = await queryOne<any>('SELECT country FROM users WHERE id = ?', [userId]);
    const history = await getFuelEfficiencyHistory(userId, user?.country || 'CN', 6, vehicleId);

    return res.json({
      success: true,
      stats: {
        totalCount: stats?.total_count || 0,
        totalAmount: parseFloat(stats?.total_amount || 0),
        totalVolume: parseFloat(stats?.total_volume || 0),
        avgEfficiency: parseFloat(stats?.avg_efficiency || 0),
      },
      history,
    });
  } catch (error: any) {
    console.error('获取统计数据错误:', error.message);
    return res.status(500).json({ error: '获取统计数据失败' });
  }
});

/**
 * DELETE /api/records/:id
 * 删除加油记录
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const recordId = parseInt(req.params.id);

    const result = await execute(
      'DELETE FROM refuel_records WHERE id = ? AND user_id = ?',
      [recordId, userId]
    );

    if ((result as any).affectedRows === 0) {
      return res.status(404).json({ error: '记录不存在或无权限删除' });
    }

    return res.json({ success: true });
  } catch (error: any) {
    console.error('删除加油记录错误:', error.message);
    return res.status(500).json({ error: '删除加油记录失败' });
  }
});

async function queryOne<T>(sql: string, params?: any[]): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

async function query<T = any>(sql: string, params?: any[]): Promise<T[]> {
  const [rows] = await pool.query(sql, params);
  return rows as T[];
}

async function execute(sql: string, params?: any[]): Promise<any> {
  const [result] = await pool.execute(sql, params);
  return result;
}

export default router;
