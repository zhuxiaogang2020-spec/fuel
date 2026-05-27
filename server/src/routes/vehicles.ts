import { Router, Request, Response } from 'express';
import pool from '../db/connection';
import { authMiddleware } from '../middleware/auth';
import { rateLimitMiddleware } from '../middleware/rateLimit';

const router = Router();

router.use(authMiddleware);
router.use(rateLimitMiddleware);

/**
 * GET /api/vehicles
 * 获取用户车辆列表
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const [rows] = await pool.query(
      'SELECT * FROM vehicles WHERE user_id = ? ORDER BY created_at ASC',
      [userId]
    );
    return res.json({ success: true, vehicles: rows });
  } catch (error: any) {
    console.error('获取车辆列表错误:', error.message);
    return res.status(500).json({ error: '获取车辆列表失败' });
  }
});

/**
 * POST /api/vehicles
 * 创建车辆
 * Body: { name, plateNumber?, model?, lastGrade? }
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const { name, plateNumber, model, lastGrade } = req.body;

    if (!name) {
      return res.status(400).json({ error: '车辆名称为必填项' });
    }

    // 限制每用户最多 5 辆车
    const [countRows]: any = await pool.query(
      'SELECT COUNT(*) as cnt FROM vehicles WHERE user_id = ?',
      [userId]
    );
    if (countRows[0]?.cnt >= 5) {
      return res.status(400).json({ error: '最多添加 5 辆车' });
    }

    const grade = lastGrade || null;
    if (grade && !['regular', 'mid', 'premium', 'diesel'].includes(grade)) {
      return res.status(400).json({ error: '无效的油号' });
    }

    const [result]: any = await pool.execute(
      `INSERT INTO vehicles (user_id, name, plate_number, model, last_grade)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, name, plateNumber || null, model || null, grade]
    );

    return res.json({ success: true, vehicleId: result.insertId });
  } catch (error: any) {
    console.error('创建车辆错误:', error.message);
    return res.status(500).json({ error: '创建车辆失败' });
  }
});

/**
 * PUT /api/vehicles/:id
 * 更新车辆
 * Body: { name?, plateNumber?, model?, lastGrade? }
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const vehicleId = parseInt(req.params.id);
    const { name, plateNumber, model, lastGrade } = req.body;

    // 检查所有权
    const [rows]: any = await pool.query(
      'SELECT * FROM vehicles WHERE id = ? AND user_id = ?',
      [vehicleId, userId]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: '车辆不存在或无权限' });
    }

    const fields: string[] = [];
    const values: any[] = [];

    if (name !== undefined) { fields.push('name = ?'); values.push(name); }
    if (plateNumber !== undefined) { fields.push('plate_number = ?'); values.push(plateNumber); }
    if (model !== undefined) { fields.push('model = ?'); values.push(model); }
    if (lastGrade !== undefined) {
      if (lastGrade && !['regular', 'mid', 'premium', 'diesel'].includes(lastGrade)) {
        return res.status(400).json({ error: '无效的油号' });
      }
      fields.push('last_grade = ?');
      values.push(lastGrade || null);
    }

    if (fields.length === 0) {
      return res.status(400).json({ error: '无更新字段' });
    }

    values.push(vehicleId, userId);
    await pool.execute(
      `UPDATE vehicles SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`,
      values
    );

    return res.json({ success: true });
  } catch (error: any) {
    console.error('更新车辆错误:', error.message);
    return res.status(500).json({ error: '更新车辆失败' });
  }
});

/**
 * DELETE /api/vehicles/:id
 * 删除车辆
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const vehicleId = parseInt(req.params.id);

    const [result]: any = await pool.execute(
      'DELETE FROM vehicles WHERE id = ? AND user_id = ?',
      [vehicleId, userId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: '车辆不存在或无权限' });
    }

    return res.json({ success: true });
  } catch (error: any) {
    console.error('删除车辆错误:', error.message);
    return res.status(500).json({ error: '删除车辆失败' });
  }
});

export default router;
