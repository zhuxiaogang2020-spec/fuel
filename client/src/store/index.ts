import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Vehicle } from '../types/station';
import { get, post, put, del } from '../utils/request';

interface UserState {
  userId: number | null;
  openid: string | null;
  nickname: string | null;
  avatarUrl: string | null;
  country: string;
  unitSystem: 'metric' | 'imperial';
  currencySymbol: string;
  priceUnit: string;
  distanceUnit: 'km' | 'miles';
  efficiencyUnit: 'L/100km' | 'MPG';
}

export const useUserStore = defineStore('user', () => {
  // 状态
  const userId = ref<number | null>(null);
  const openid = ref<string | null>(null);
  const nickname = ref<string | null>(null);
  const avatarUrl = ref<string | null>(null);
  const country = ref<string>('CA');
  const unitSystem = ref<'metric' | 'imperial'>('metric');
  const currencySymbol = ref<string>('¥');
  const priceUnit = ref<string>('¥/L');
  const distanceUnit = ref<'km' | 'miles'>('km');
  const efficiencyUnit = ref<'L/100km' | 'MPG'>('L/100km');

  // 计算属性
  const isLoggedIn = computed(() => !!openid.value);
  const isCN = computed(() => country.value === 'CN');
  const isCA = computed(() => country.value === 'CA');
  const isUS = computed(() => country.value === 'US');

  // 方法
  function setUser(info: Partial<UserState>) {
    if (info.userId !== undefined) userId.value = info.userId;
    if (info.openid !== undefined) openid.value = info.openid;
    if (info.nickname !== undefined) nickname.value = info.nickname;
    if (info.avatarUrl !== undefined) avatarUrl.value = info.avatarUrl;
    if (info.country !== undefined) country.value = info.country;
    if (info.unitSystem !== undefined) unitSystem.value = info.unitSystem;
    if (info.currencySymbol !== undefined) currencySymbol.value = info.currencySymbol;
    if (info.priceUnit !== undefined) priceUnit.value = info.priceUnit;
    if (info.distanceUnit !== undefined) distanceUnit.value = info.distanceUnit;
    if (info.efficiencyUnit !== undefined) efficiencyUnit.value = info.efficiencyUnit;
  }

  function setCountryInfo(info: {
    country: string;
    unitSystem: 'metric' | 'imperial';
    currencySymbol: string;
    priceUnit: string;
    distanceUnit: 'km' | 'miles';
    efficiencyUnit: 'L/100km' | 'MPG';
  }) {
    country.value = info.country;
    unitSystem.value = info.unitSystem;
    currencySymbol.value = info.currencySymbol;
    priceUnit.value = info.priceUnit;
    distanceUnit.value = info.distanceUnit;
    efficiencyUnit.value = info.efficiencyUnit;
  }

  function clearUser() {
    userId.value = null;
    openid.value = null;
    nickname.value = null;
    avatarUrl.value = null;
  }

  return {
    userId,
    openid,
    nickname,
    avatarUrl,
    country,
    unitSystem,
    currencySymbol,
    priceUnit,
    distanceUnit,
    efficiencyUnit,
    isLoggedIn,
    isCN,
    isCA,
    isUS,
    setUser,
    setCountryInfo,
    clearUser,
  };
});

/**
 * 位置状态 Store
 */
export const useLocationStore = defineStore('location', () => {
  const lat = ref<number>(43.6532);
  const lng = ref<number>(-79.3832);
  const address = ref<string>('Toronto, ON');
  const loading = ref<boolean>(false);

  function setLocation(newLat: number, newLng: number, newAddress?: string) {
    lat.value = newLat;
    lng.value = newLng;
    if (newAddress) address.value = newAddress;
  }

  function clearLocation() {
    lat.value = 0;
    lng.value = 0;
    address.value = '';
  }

  return {
    lat,
    lng,
    address,
    loading,
    setLocation,
    clearLocation,
  };
});

/**
 * 车辆状态 Store
 */
export const useVehicleStore = defineStore('vehicle', () => {
  const vehicles = ref<Vehicle[]>([]);
  const selectedVehicleId = ref<number | null>(null);
  const loading = ref(false);

  /** 从后端获取车辆列表 */
  async function fetchVehicles() {
    loading.value = true;
    try {
      const res = await get<{ success: boolean; vehicles: Vehicle[] }>('/vehicles');
      if (res.success) {
        vehicles.value = res.vehicles || [];
        // 如果只有一个车，自动选中
        if (vehicles.value.length === 1) {
          selectedVehicleId.value = vehicles.value[0].id;
        }
      }
    } catch (e: any) {
      console.error('获取车辆列表失败:', e.message);
    } finally {
      loading.value = false;
    }
  }

  /** 新增车辆 */
  async function addVehicle(data: { name: string; plateNumber?: string; model?: string }) {
    const res = await post<{ success: boolean; vehicleId: number }>('/vehicles', data);
    if (res.success) {
      await fetchVehicles();
      return res.vehicleId;
    }
    throw new Error('添加失败');
  }

  /** 更新车辆 */
  async function updateVehicle(id: number, data: Partial<Vehicle>) {
    await put(`/vehicles/${id}`, data);
    await fetchVehicles();
  }

  /** 删除车辆 */
  async function deleteVehicle(id: number) {
    await del(`/vehicles/${id}`);
    if (selectedVehicleId.value === id) {
      selectedVehicleId.value = null;
    }
    await fetchVehicles();
  }

  /** 选中车辆 */
  function selectVehicle(id: number | null) {
    selectedVehicleId.value = id;
  }

  /** 获取当前选中车辆 */
  const selectedVehicle = computed(() => {
    if (!selectedVehicleId.value) return null;
    return vehicles.value.find(v => v.id === selectedVehicleId.value) || null;
  });

  return {
    vehicles,
    selectedVehicleId,
    selectedVehicle,
    loading,
    fetchVehicles,
    addVehicle,
    updateVehicle,
    deleteVehicle,
    selectVehicle,
  };
});
