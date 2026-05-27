-- Migration: GasBuddy 爬虫数据支持
-- 运行方式: mysql -u root fuel_db < src/db/migration_add_gasbuddy.sql

-- 1. 扩展 source 字段，支持 'gasbuddy' 数据源
ALTER TABLE stations MODIFY COLUMN source ENUM('tencent','google','mock','gasbuddy') DEFAULT NULL;

-- 2. 添加 external_id 唯一索引（用于 UPSERT）
-- 先检查是否已有 external_id 重复数据
-- 如果有，更新测试数据的 external_id 使其唯一
UPDATE stations SET external_id = CONCAT(external_id, '_', id) 
WHERE external_id IN (
  SELECT external_id FROM (
    SELECT external_id, COUNT(*) as cnt FROM stations 
    WHERE external_id IS NOT NULL AND external_id != ''
    GROUP BY external_id HAVING cnt > 1
  ) AS dupes
);

ALTER TABLE stations ADD UNIQUE INDEX idx_external_id (external_id);
