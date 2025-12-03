import { API_URL } from "@/lib/api"
import type { Device, Reading } from "@/types/iot"

type HttpMethod = "GET" | "POST" | "PUT" | "DELETE"

const perform = async <T>(url: string, method: HttpMethod, body?: unknown): Promise<T> => {
  const response = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!response.ok) {
    throw new Error(`Request ${method} ${url} failed (${response.status})`)
  }
  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

export const fetchDevicesFromApi = async (): Promise<Device[] | null> => {
  const endpoints = ["/api/devices", "/api/config/devices"]
  for (const endpoint of endpoints) {
    try {
      const url = `${API_URL}${endpoint}`
      const result = await perform<Device[]>(url, "GET")
      if (Array.isArray(result)) return result
    } catch (error) {
      if (error instanceof Error && /404/.test(error.message)) continue
    }
  }
  return null
}

export const saveDeviceToApi = async (device: Device): Promise<boolean> => {
  const payload = { ...device }
  const endpoints: { url: string; method: HttpMethod }[] = [
    { url: `${API_URL}/api/devices`, method: "POST" },
    { url: `${API_URL}/api/configure`, method: "POST" },
  ]
  for (const endpoint of endpoints) {
    try {
      await perform(endpoint.url, endpoint.method, payload)
      return true
    } catch (error) {
      if (error instanceof Error && /404/.test(error.message)) continue
    }
  }
  return false
}

export const deleteDeviceFromApi = async (espId: string): Promise<boolean> => {
  const endpoints = [`${API_URL}/api/device/${encodeURIComponent(espId)}`]
  for (const url of endpoints) {
    try {
      await perform(url, "DELETE")
      return true
    } catch (error) {
      if (error instanceof Error && /404/.test(error.message)) continue
    }
  }
  return false
}

export const resendDeviceConfig = async (espId: string) => {
  const url = `${API_URL}/api/device/${encodeURIComponent(espId)}/resend`
  await perform<{ message: string }>(url, "POST")
}

export const fetchReadings = async (sensorId: string): Promise<Reading[]> => {
  const url = `${API_URL}/api/readings/${encodeURIComponent(sensorId)}`
  try {
    const result = await perform<Reading[]>(url, "GET")
    return Array.isArray(result) ? result : []
  } catch (error) {
    console.error("fetchReadings error", error)
    return []
  }
}

export const fetchLatestReading = async (sensorId: string): Promise<Reading | null> => {
  const endpoints = [`${API_URL}/api/latestReading/${encodeURIComponent(sensorId)}`, `${API_URL}/api/readings/${encodeURIComponent(sensorId)}/latest`]
  for (const url of endpoints) {
    try {
      const result = await perform<Reading>(url, "GET")
      if (result && typeof result === "object") return result
    } catch (error) {
      if (error instanceof Error && /404/.test(error.message)) continue
    }
  }
  return null
}
