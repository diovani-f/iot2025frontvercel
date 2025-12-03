import { useEffect, useState } from "react"
import { API_URL } from "./api"

export type ComponentConfig = {
  name?: string
  model?: string
  type?: string
  pin?: number | number[]
  interval?: number
  unit?: string
  label?: string
  config?: { min?: number; max?: number }
}

export type Device = {
  name: string
  espId: string
  status?: 'online' | 'offline'
  lastSeen?: string
  components: ComponentConfig[]
}

export type DeviceInput = Partial<Device> & { components?: Array<Partial<ComponentConfig>> }

const STORAGE_KEY = "iot2025::devices"

const listeners = new Set<(devices: Device[]) => void>()
let storageListenerBound = false

const isBrowser = () => typeof window !== "undefined" && typeof localStorage !== "undefined"

const clampNumber = (value: unknown, fallback: number) => {
  const num = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN
  return Number.isFinite(num) ? num : fallback
}

const parsePin = (value: unknown): number | number[] | undefined => {
  if (typeof value === "number") return value
  if (Array.isArray(value)) return value.every(v => typeof v === "number") ? value : undefined
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed)
        if (Array.isArray(parsed) && parsed.every(v => typeof v === "number")) {
          return parsed
        }
      } catch {}
    }
    const num = Number(trimmed)
    if (Number.isFinite(num)) return num
  }
  return undefined
}

const sanitizeComponent = (input: Partial<ComponentConfig> | undefined): ComponentConfig => {
  const pin = parsePin(input?.pin) ?? 0
  const intervalRaw = clampNumber(input?.interval, NaN)
  const config: { min?: number; max?: number } = {}

  const minRaw = typeof input?.config?.min !== "undefined" ? input?.config?.min : undefined
  const maxRaw = typeof input?.config?.max !== "undefined" ? input?.config?.max : undefined

  const minNum = clampNumber(minRaw, NaN)
  const maxNum = clampNumber(maxRaw, NaN)
  if (Number.isFinite(minNum)) config.min = minNum
  if (Number.isFinite(maxNum)) config.max = maxNum

  const cleaned: ComponentConfig = {
    name: (input?.name ?? "").toString().trim(),
    model: (input?.model ?? "").toString().trim(),
    type: (input?.type ?? "sensor").toString().trim() || "sensor",
    pin,
    interval: Number.isFinite(intervalRaw) ? intervalRaw : undefined,
    unit: (input?.unit ?? "").toString().trim() || undefined,
    label: (input?.label ?? "").toString().trim(),
    config: Object.keys(config).length ? config : undefined,
  }

  return cleaned
}

const sanitizeDevice = (input: DeviceInput | undefined): Device | null => {
  if (!input) return null
  const name = (input.name ?? "").toString().trim()
  const espId = (input.espId ?? "").toString().trim()
  if (!espId) return null

  const rawComponents = Array.isArray(input.components) ? input.components : []
  const components = rawComponents.map((c) => sanitizeComponent(c))

  return {
    name,
    espId,
    status: input.status as 'online' | 'offline' | undefined,
    lastSeen: input.lastSeen,
    components,
  }
}

const normalizeList = (list: DeviceInput[]): Device[] => {
  const map = new Map<string, Device>()
  for (const item of list) {
    const sanitized = sanitizeDevice(item)
    if (!sanitized) continue
    map.set(sanitized.espId, sanitized)
  }
  return Array.from(map.values())
}

const readDevices = (): Device[] => {
  if (!isBrowser()) return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return normalizeList(parsed as DeviceInput[])
  } catch {
    return []
  }
}

const writeDevices = (devices: Device[]) => {
  if (!isBrowser()) return
  if (!devices.length) {
    localStorage.removeItem(STORAGE_KEY)
  } else {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(devices))
  }
}

const emit = (devices: Device[]) => {
  listeners.forEach((listener) => {
    try {
      listener(devices)
    } catch (err) {
      console.error("device-registry listener error", err)
    }
  })
}

const ensureStorageListener = () => {
  if (storageListenerBound || !isBrowser()) return
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY) return
    emit(readDevices())
  })
  storageListenerBound = true
}

ensureStorageListener()

const setAll = (devices: Device[]) => {
  const normalized = normalizeList(devices)
  writeDevices(normalized)
  emit(normalized)
  return normalized
}

const upsertInternal = (device: DeviceInput, originalEspId?: string) => {
  const sanitized = sanitizeDevice(device)
  if (!sanitized) return readDevices()

  const current = readDevices()
  const targetId = originalEspId?.trim() || sanitized.espId
  const next = current.filter((d) => d.espId !== targetId)
  next.push(sanitized)
  return setAll(next)
}

const removeInternal = async (espId: string) => {
  const id = (espId || "").trim()
  if (!id) return readDevices()

  const current = readDevices()
  const next = current.filter((d) => d.espId !== id)
  setAll(next)

  try {
    await fetch(`${API_URL}/api/devices/${id}`, { method: 'DELETE' })
  } catch (err) {
    console.error("Failed to delete device from backend:", err)
  }

  return next
}

const fetchFromBackend = async (): Promise<Device[]> => {
  try {
    const response = await fetch(`${API_URL}/api/devices`)
    if (!response.ok) {
      console.warn("Failed to fetch devices from backend:", response.status)
      return readDevices()
    }
    const backendDevices = await response.json() as DeviceInput[]

    const localDevices = readDevices()
    const merged = new Map<string, Device>()

    localDevices.forEach(device => merged.set(device.espId, device))

    const sanitizedBackend = normalizeList(backendDevices)
    sanitizedBackend.forEach(device => merged.set(device.espId, device))

    const result = Array.from(merged.values())

    writeDevices(result)
    emit(result)

    return result
  } catch (error) {
    console.error("Error fetching devices from backend:", error)
    return readDevices()
  }
}

export const deviceRegistry = {
  get: (): Device[] => readDevices(),
  set: (devices: DeviceInput[]) => setAll(devices as Device[]),
  upsert: (device: DeviceInput, originalEspId?: string) => upsertInternal(device, originalEspId),
  remove: async (espId: string) => await removeInternal(espId),
  fetchFromBackend,
  subscribe: (listener: (devices: Device[]) => void) => {
    listeners.add(listener)
    listener(readDevices())
    return () => {
      listeners.delete(listener)
    }
  },
}

export const useDeviceRegistry = () => {
  const [devices, setDevices] = useState<Device[]>(() => readDevices())
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    ensureStorageListener()
    const unsubscribe = deviceRegistry.subscribe(setDevices)

    const loadDevices = async () => {
      setLoading(true)
      try {
        await deviceRegistry.fetchFromBackend()
      } finally {
        setLoading(false)
      }
    }

    loadDevices()

    return () => unsubscribe()
  }, [])

  return {
    devices,
    loading,
    upsertDevice: (device: DeviceInput, originalEspId?: string) => deviceRegistry.upsert(device, originalEspId),
    removeDevice: (espId: string) => deviceRegistry.remove(espId),
    replaceAll: (list: DeviceInput[]) => deviceRegistry.set(list),
    reset: () => deviceRegistry.set([]),
    refresh: () => deviceRegistry.fetchFromBackend(),
    refreshDevices: () => deviceRegistry.fetchFromBackend(),
  }
}

