import type { Reading } from "@/types/iot"

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const flattenObject = (value: unknown, prefix = "", out: Record<string, unknown> = {}): Record<string, unknown> => {
  if (!isObject(value)) return out
  for (const [key, entry] of Object.entries(value)) {
    const nextKey = prefix ? `${prefix}.${key}` : key
    if (isObject(entry)) {
      flattenObject(entry, nextKey, out)
    } else {
      out[nextKey] = entry
    }
  }
  return out
}

export const pickTimestamp = (reading: Reading): number => {
  const options = [reading.timestamp, reading.createdAt, reading.updatedAt, reading["ts"], reading["time"], reading["date"]]
  for (const candidate of options) {
    if (typeof candidate === "string") {
      const coerced = Date.parse(candidate)
      if (Number.isFinite(coerced)) return coerced
    }
    if (typeof candidate === "number" && Number.isFinite(candidate)) return candidate
    if (candidate instanceof Date) return candidate.getTime()
  }
  return 0
}

export const extractDataMap = (reading: Reading): Record<string, unknown> => {
  const sources = [reading.data, reading.payload, reading.values, reading.readings, reading.medidas, reading]
  for (const source of sources) {
    if (isObject(source)) {
      return flattenObject(source)
    }
  }
  return {}
}

export const numericFieldsFromReadings = (readings: Reading[]): string[] => {
  const numeric = new Set<string>()
  for (const reading of readings) {
    const flat = extractDataMap(reading)
    Object.entries(flat).forEach(([key, value]) => {
      const numberValue = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN
      if (Number.isFinite(numberValue)) numeric.add(key)
    })
  }
  return Array.from(numeric)
}

export type ChartPoint = {
  time: string
  value: number
}

export const buildChartSeries = (readings: Reading[], field: string): ChartPoint[] => {
  return readings
    .map((reading) => {
      const timestamp = pickTimestamp(reading)
      const flat = extractDataMap(reading)
      const raw = flat[field]
      const numberValue = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN
      if (!Number.isFinite(numberValue) || !timestamp) return null
      const date = new Date(timestamp)
      const label = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")}`
      return { time: label, value: numberValue as number }
    })
    .filter((entry): entry is ChartPoint => entry !== null)
}

export const summarizeSeries = (series: ChartPoint[]) => {
  if (!series.length) {
    return { min: null as number | null, max: null as number | null, avg: null as number | null }
  }
  let min = Number.POSITIVE_INFINITY
  let max = Number.NEGATIVE_INFINITY
  let total = 0
  for (const point of series) {
    if (point.value < min) min = point.value
    if (point.value > max) max = point.value
    total += point.value
  }
  const avg = total / series.length
  return {
    min: Number.isFinite(min) ? min : null,
    max: Number.isFinite(max) ? max : null,
    avg: Number.isFinite(avg) ? avg : null,
  }
}

export const formatNumber = (value: number | null) => {
  if (value === null || !Number.isFinite(value)) return "-"
  return Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(2)
}

export const describeValue = (value: unknown): string => {
  if (value === null || value === undefined) return "-"
  if (typeof value === "number") return formatNumber(value)
  if (typeof value === "boolean") return value ? "on" : "off"
  if (typeof value === "string") return value
  return JSON.stringify(value)
}
