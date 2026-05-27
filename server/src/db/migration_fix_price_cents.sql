-- Migration: 修复 GasBuddy FastAPI 价格单位错误（分 → 元）
-- 背景: FastAPI /prices 接口的 cost 字段是「分/升」(cents/L)
-- 但 gasBuddyApiClient.ts 直接当「元/升」写入 DB，导致价格被放大100倍
-- 例如: 212 分/L → 错误存为 212 元/L → 前端自动计算 100/212=0.47L

-- 仅修复疑似被放大100倍的价格（> 50 的认为是分而非元）
-- 加拿大 GasBuddy GraphQL 直接抓取的价格在 1-2 元范围，不会受此影响
UPDATE stations
SET
    price_regular = price_regular / 100,
    price_mid = price_mid / 100,
    price_premium = price_premium / 100,
    price_diesel = price_diesel / 100
WHERE source = 'gasbuddy'
  AND (price_regular > 50 OR price_mid > 50 OR price_premium > 50 OR price_diesel > 50);
