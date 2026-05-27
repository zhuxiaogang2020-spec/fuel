import { Router, Request, Response } from 'express';
import axios from 'axios';
import config from '../config/index';
import pool from '../db/connection';

const router = Router();

/**
 * POST /api/auth/login
 * 微信小程序登录
 * Body: { code, nickname?, avatarUrl? }
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { code, nickname, avatarUrl } = req.body;

    if (!code) {
      return res.status(400).json({ error: '缺少 code 参数' });
    }

    let openid: string;
    let session_key: string;

    // 开发/Mock 模式：直接用 code 作为 openid（绕过微信 API）
    if (config.mock.enabled || config.wechat.secret === 'placeholder_secret' || process.env.NODE_ENV === 'development') {
      console.log('[Auth] Mock 模式登录, code:', code.substring(0, 20) + '...');
      openid = 'dev_' + code.replace(/[^a-zA-Z0-9]/g, '').substring(0, 32);
      session_key = 'mock_session_key';
    } else {
      // 调用微信 code2Session 接口
      const url = 'https://api.weixin.qq.com/sns/jscode2session';
      const params = {
        appid: config.wechat.appid,
        secret: config.wechat.secret,
        js_code: code,
        grant_type: 'authorization_code',
      };

      const response = await axios.get(url, { params });
      const data = response.data;
      openid = data.openid;
      session_key = data.session_key;

      if (data.errcode) {
        return res.status(500).json({ error: `微信登录失败: ${data.errmsg}` });
      }
    }

    // 查找或创建用户
    let user = await queryOne<{ id: number; openid: string }>(
      'SELECT id, openid FROM users WHERE openid = ?',
      [openid]
    );

    if (!user) {
      await execute(
        `INSERT INTO users (openid, nickname, avatar_url) VALUES (?, ?, ?)`,
        [openid, nickname || null, avatarUrl || null]
      );
      user = await queryOne<{ id: number; openid: string }>(
        'SELECT id, openid FROM users WHERE openid = ?',
        [openid]
      );
    } else if (nickname || avatarUrl) {
      await execute(
        `UPDATE users SET nickname = COALESCE(?, nickname), avatar_url = COALESCE(?, avatar_url) WHERE id = ?`,
        [nickname || null, avatarUrl || null, user.id]
      );
    }

    return res.json({
      success: true,
      userId: user!.id,
      openid,
      sessionKey: session_key,
    });
  } catch (error: any) {
    console.error('微信登录错误:', error.message);
    return res.status(500).json({ error: '登录失败，请重试' });
  }
});

/**
 * GET /api/auth/userinfo
 * 获取用户信息
 * Query: openid
 */
router.get('/userinfo', async (req: Request, res: Response) => {
  const openid = req.query.openid as string;

  if (!openid) {
    return res.status(400).json({ error: '缺少 openid 参数' });
  }

  try {
    const user = await queryOne<any>(
      'SELECT id, openid, nickname, avatar_url, country, unit_preference FROM users WHERE openid = ?',
      [openid]
    );

    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    return res.json({ success: true, user });
  } catch (error: any) {
    console.error('获取用户信息错误:', error.message);
    return res.status(500).json({ error: '获取用户信息失败' });
  }
});

async function queryOne<T>(sql: string, params?: any[]): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

async function query<T = any>(sql: string, params?: any[]): Promise<T[]> {
  const [rows] = await pool.execute(sql, params);
  return rows as T[];
}

async function execute(sql: string, params?: any[]): Promise<any> {
  const [result] = await pool.execute(sql, params);
  return result;
}

export default router;
