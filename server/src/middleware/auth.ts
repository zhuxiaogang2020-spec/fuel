import { Request, Response, NextFunction } from 'express';
import axios from 'axios';
import config from '../config/index';
import { query, queryOne, execute } from '../db/connection';

// 扩展 Express Request 类型
declare global {
  namespace Express {
    interface Request {
      userId?: number;
      openid?: string;
    }
  }
}

/**
 * 微信小程序登录中间件
 * 前端传入 code，换取 openid，自动注册用户
 */
export async function wechatLogin(req: Request, res: Response) {
  try {
    const { code, nickname, avatarUrl } = req.body;

    if (!code) {
      return res.status(400).json({ error: '缺少 code 参数' });
    }

    // 调用微信 code2Session 接口
    const url = 'https://api.weixin.qq.com/sns/jscode2session';
    const params = {
      appid: config.wechat.appid,
      secret: config.wechat.secret,
      js_code: code,
      grant_type: 'authorization_code',
    };

    const response = await axios.get(url, { params });
    const { openid, session_key, errcode, errmsg } = response.data;

    if (errcode) {
      return res.status(500).json({ error: `微信登录失败: ${errmsg}` });
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
      // 更新用户信息
      await execute(
        `UPDATE users SET nickname = COALESCE(?, nickname), avatar_url = COALESCE(?, avatar_url) WHERE id = ?`,
        [nickname || null, avatarUrl || null, user.id]
      );
    }

    return res.json({
      userId: user!.id,
      openid,
      sessionKey: session_key,
    });
  } catch (error: any) {
    console.error('微信登录错误:', error.message);
    return res.status(500).json({ error: '登录失败，请重试' });
  }
}

/**
 * 认证中间件：验证请求中的 openid
 */
export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const openid = req.header('X-WX-OpenID') || req.query.openid as string;

  if (!openid) {
    return res.status(401).json({ error: '未登录，请提供 openid' });
  }

  try {
    const user = await queryOne<{ id: number }>(
      'SELECT id FROM users WHERE openid = ?',
      [openid]
    );

    if (!user) {
      return res.status(401).json({ error: '用户不存在' });
    }

    req.userId = user.id;
    req.openid = openid;
    next();
  } catch (error: any) {
    console.error('认证中间件错误:', error.message);
    return res.status(500).json({ error: '认证失败' });
  }
}
