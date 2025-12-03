import type { Device } from "@/types/iot"

const DEVICE_STORAGE_KEY = "iot2025:devices"
const SELECTION_STORAGE_KEY = "iot2025:selection"

export type StoredSelection = {
  deviceId: string | null
  componentKey: string | null
}

const safeParse = <T>(value: string | null): T | null => {
  if (!value) return null
  try {
    return JSON.parse(value) as T
  } catch {
    return null
  }
}

export const loadDevicesFromStorage = (): Device[] => {
  if (typeof window === "undefined") return []
  const parsed = safeParse<Device[]>(localStorage.getItem(DEVICE_STORAGE_KEY))
  if (!parsed || !Array.isArray(parsed)) return []
  return parsed
}

export const saveDevicesToStorage = (devices: Device[]) => {
  if (typeof window === "undefined") return
  localStorage.setItem(DEVICE_STORAGE_KEY, JSON.stringify(devices))
}

export const loadSelectionFromStorage = (): StoredSelection => {
  if (typeof window === "undefined") return { deviceId: null, componentKey: null }
  const parsed = safeParse<StoredSelection>(localStorage.getItem(SELECTION_STORAGE_KEY))
  if (!parsed) return { deviceId: null, componentKey: null }
  return {
    deviceId: parsed.deviceId ?? null,
    componentKey: parsed.componentKey ?? null,
  }
}

export const saveSelectionToStorage = (selection: StoredSelection) => {
  if (typeof window === "undefined") return
  localStorage.setItem(SELECTION_STORAGE_KEY, JSON.stringify(selection))
}

export const clearStoredData = () => {
  if (typeof window === "undefined") return
  localStorage.removeItem(DEVICE_STORAGE_KEY)
  localStorage.removeItem(SELECTION_STORAGE_KEY)
}
