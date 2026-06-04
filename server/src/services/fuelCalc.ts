import { query } from '../db/connection';
import { l100kmToMpgImperial, l100kmToMpgUs } from './unitConvert';

export interface FuelEfficiencyResult {
  value: number;
  unit: 'L/100km' | 'MPG';
  lastOdometer?: number;
  currentOdometer?: number;     
  volume?: number;
}

/**
 * 加满到加满法计算油耗
 * 
 * 前提：两条记录均为「加满」
 * 油耗(L/100km) = (本次加油量 / (本次里程 - 上次里程)) × 100
 * 油耗(MPG) = (本次里程 - 上次里程) / 本次加油量 × 3.785(US) 或 4.546(Imp)
 * 
 * @param userId 用户ID
 * @param currentRecordId 当前加油记录ID
 * @param country 国家代码（用于确定单位）
 */
export async function calculateFuelEfficiency(
  userId: number,
  currentRecordId: number,
  country: string
): Promise<FuelEfficiencyResult | null> {
  try {
    // 获取当前记录
    const current = await queryOne<any>(
      `SELECT volume, odometer, is_full_tank, vehicle_id, created_at 
       FROM refuel_records 
       WHERE id = ? AND user_id = ?`,
      [currentRecordId, userId]
    );

    if (!current || !current.is_full_tank || !current.volume || !current.odometer) {
      return null;
    }

    // 查找同一辆车的上一条「加满」记录
    const vehicleFilter = current.vehicle_id ? ' AND vehicle_id = ?' : ' AND vehicle_id IS NULL';
    const vehicleParams = current.vehicle_id ? [userId, current.odometer, currentRecordId, current.vehicle_id] : [userId, current.odometer, currentRecordId];
    const previous = await queryOne<any>(
      `SELECT volume, odometer, is_full_tank, created_at 
       FROM refuel_records 
       WHERE user_id = ? AND is_full_tank = TRUE 
         AND odometer < ? AND id != ?
         ${vehicleFilter}
       ORDER BY odometer DESC, created_at DESC 
       LIMIT 1`,
      vehicleParams
    );

    if (!previous || !previous.odometer) {
      return null; // 没有上一条加满记录，无法计算
    }

    const distance = Number(current.odometer) - Number(previous.odometer); // 行驶距离
    const volume = Number(current.volume); // 加油量（升）

    if (distance <= 0 || volume <= 0) {
      return null;
    }

    // 计算 L/100km
    const l100km = (volume / distance) * 100;

    // 根据国家返回对应单位
    if (country === 'US') {
      // 美国：MPG (US)
      const mpg = l100kmToMpgUs(l100km);
      return {
        value: Math.round(mpg * 10) / 10,
        unit: 'MPG',
        lastOdometer: Number(previous.odometer),
        currentOdometer: Number(current.odometer),
        volume,
      };
    } else {
      // 中国、加拿大及其他国家：L/100km（公制）
      return {
        value: Math.round(l100km * 100) / 100,
        unit: 'L/100km',
        lastOdometer: Number(previous.odometer),
        currentOdometer: Number(current.odometer),
        volume,
      };
    }
  } catch (error) {
    console.error('油耗计算出错:', (error as Error).message);
    return null;
  }
}

/**
 * 获取用户历史油耗统计
 * @param userId 用户ID
 * @param country 国家代码
 * @param limit 返回记录数
 */
export interface FuelEfficiencyHistoryItem extends FuelEfficiencyResult {
  created_at?: string;
  stationName?: string;
  amount?: number;
}

export async function getFuelEfficiencyHistory(
  userId: number,
  country: string,
  limit: number = 6,
  vehicleId?: number | null
): Promise<FuelEfficiencyHistoryItem[]> {
  try {
    const fetchLimit = limit + 1; // 多取一条用于计算
    const vehicleFilter = vehicleId ? ' AND r.vehicle_id = ?' : '';
    const records = await query<any>(
      `SELECT r.id, r.volume, r.odometer, r.is_full_tank, r.created_at, r.amount,
              s.name as station_name
       FROM refuel_records r
       LEFT JOIN stations s ON r.station_id = s.id
       WHERE r.user_id = ? AND r.is_full_tank = TRUE AND r.volume IS NOT NULL AND r.odometer IS NOT NULL
             ${vehicleFilter}
       ORDER BY r.odometer DESC, r.created_at DESC
       LIMIT ${fetchLimit}`,
      vehicleId ? [userId, vehicleId] : [userId]
    );

    const results: FuelEfficiencyHistoryItem[] = [];

    // 少于2条加满记录无法形成有效配对，直接返回空
    if (records.length < 2) {
      return [];
    }

    for (let i = 0; i < records.length - 1; i++) {
      const current = records[i];
      const previous = records[i + 1];

      const distance = Number(current.odometer) - Number(previous.odometer);
      const volume = Number(current.volume);

      if (distance <= 0 || volume <= 0) continue;

      const l100km = (volume / distance) * 100;

      const base = {
        lastOdometer: Number(previous.odometer),
        currentOdometer: Number(current.odometer),
        volume,
        created_at: current.created_at,
        stationName: current.station_name || '未知加油站',
        amount: current.amount ? parseFloat(current.amount) : undefined,
      };

      if (country === 'US') {
        results.push({
          ...base,
          value: Math.round(l100kmToMpgUs(l100km) * 10) / 10,
          unit: 'MPG',
        });
      } else {
        // 中国、加拿大及其他国家：L/100km（公制）
        results.push({
          ...base,
          value: Math.round(l100km * 100) / 100,
          unit: 'L/100km',
        });
      }
    }

    return results;
  } catch (error) {
    console.error('获取油耗历史出错:', (error as Error).message);
    return [];
  }
}

function queryOne<T>(sql: string, params?: any[]): Promise<T | null> {
  return query<T>(sql, params).then(rows => rows.length > 0 ? rows[0] : null);
}
