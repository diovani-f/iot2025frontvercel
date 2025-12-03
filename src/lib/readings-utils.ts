import type { Device } from "./device-registry"

export type GenericPayload = Record<string, unknown>

export type Reading = {
  espId: string
  timestamp?: string | number
  data?: GenericPayload
  payload?: GenericPayload
  values?: GenericPayload
  readings?: GenericPayload
  medidas?: GenericPayload
  [key: string]: unknown
}

const TIMESTAMP_KEYS = ["timestamp", "ts", "time", "createdAt", "created_at", "date"] as const

export const normalizeKey = (input: unknown): string =>
  String(input ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "")

export const pickTimestamp = (source: unknown, fallback = 0): number => {
  if (!source || typeof source !== "object") return fallback
  const record = source as Record<string, unknown>
  for (const key of TIMESTAMP_KEYS) {
    const value = record[key]
    let parsed = typeof value === "string" ? Date.parse(value) : typeof value === "number" ? value : undefined

    if (Number.isFinite(parsed)) {
      if (parsed! < 1e11 && parsed! > 0) {
        parsed = parsed! * 1000
      }
      return parsed as number
    }
  }
  return fallback
}

export const flattenObject = (input: unknown, prefix = "", out: GenericPayload = {}): GenericPayload => {
  if (!input || typeof input !== "object") return out
  const entries = Object.entries(input as Record<string, unknown>)
  for (const [key, value] of entries) {
    const nextKey = prefix ? `${prefix}.${key}` : key
    if (value && typeof value === "object" && !Array.isArray(value)) {
      flattenObject(value, nextKey, out)
    } else {
      out[nextKey] = value
    }
  }
  return out
}

export const candidateRoots = (reading: Reading): GenericPayload[] => {
  const roots = [reading.data, reading.payload, reading.values, reading.readings, reading.medidas, reading]
  return roots.filter((root): root is GenericPayload => !!root && typeof root === "object")
}

export const extractPayloadMaps = (reading: Reading) => {
  const roots = candidateRoots(reading)
  const deep = (roots[0] ?? {}) as GenericPayload
  const flat = flattenObject(deep)
  return { roots, deep, flat }
}

export const flattenFirstRoot = (reading: Reading): GenericPayload => extractPayloadMaps(reading).flat

export const numericValue = (value: unknown): number => {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "boolean") return value ? 1 : 0
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (/^0x[0-9a-f]+$/i.test(trimmed)) return Number.parseInt(trimmed, 16)
    const parsed = Number(trimmed)
    if (Number.isFinite(parsed)) return parsed
  }
  return Number.NaN
}

export const formatClock = (ms: number): string => {
  if (!ms) return "--:--"
  const date = new Date(ms)
  const hours = String(date.getHours()).padStart(2, "0")
  const minutes = String(date.getMinutes()).padStart(2, "0")
  return `${hours}:${minutes}`
}

export const formatDateTime = (ms: number): string => {
  if (!ms) return "-"
  const date = new Date(ms)
  const yyyy = date.getFullYear()
  const MM = String(date.getMonth() + 1).padStart(2, "0")
  const dd = String(date.getDate()).padStart(2, "0")
  const hh = String(date.getHours()).padStart(2, "0")
  const mm = String(date.getMinutes()).padStart(2, "0")
  const ss = String(date.getSeconds()).padStart(2, "0")
  return `${yyyy}-${MM}-${dd} ${hh}:${mm}:${ss}`
}

export const deviceLabel = (device: Pick<Device, "name" | "espId">) => device.name || device.espId
