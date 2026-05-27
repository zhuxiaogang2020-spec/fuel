import { Request, Response, NextFunction } from 'express';
import pool from '../db/connection';
import config from '../config/index';

/**
 * 流控中间件：原子计数 + 熔断判断
 * 前置条件：authMiddleware 已执行，req.userId 存在
 */
export async function rateLimitMiddleware(req: Request, res: Response, next: NextFunction) {
  const userId = req.userId;
  if (!userId) {
    return next(); // 未登录用户不限制
  }

  try {
    const today = new Date().toISOString().split('T')[0];

    // 原子操作：使用事务 + SELECT FOR UPDATE
    const connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // 锁定当前用户的流控记录
      const [rows] = await connection.execute(
        'SELECT * FROM user_rate_limits WHERE user_id = ? AND last_call_date = ? FOR UPDATE',
        [userId, today]
      ) as [any[], any];
      
      let record = rows.length > 0 ? rows[0] : null;

      if (!record) {
        // 首次调用，插入记录
        await connection.execute(
          'INSERT INTO user_rate_limits (user_id, api_calls_today, last_call_date) VALUES (?, 1, ?)',
          [userId, today]
        );
      } else if (record.api_calls_today >= config.rateLimit.dailyLimit) {
        // 超过限制，熔断
        await connection.rollback();
        return res.status(429).json({
          error: '今日 API 调用次数已达上限，请明天再试',
          limit: config.rateLimit.dailyLimit,
          remaining: 0,
        });
      } else {
        // 原子递增
        await connection.execute(
          'UPDATE user_rate_limits SET api_calls_today = api_calls_today + 1 WHERE id = ?',
          [record.id]
        );
      }

      await connection.commit();
      next();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error: any) {
    console.error('流控中间件错误:', error.message);
    // 流控失败不阻塞请求
    next();
  }
}
