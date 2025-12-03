import { useEffect, useMemo, useState } from "react"
import { Activity, Clock, Database, Wifi, Thermometer } from "lucide-react"
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {Select, SelectTrigger, SelectValue, SelectContent, SelectItem} from "@/components/ui/select"

import { API_URL } from "@/lib/api"
import { useDeviceRegistry } from "@/lib/device-registry"
import {
  extractPayloadMaps,
  formatClock,
  formatDateTime,
  numericValue,
  pickTimestamp,
  type Reading,
} from "@/lib/readings-utils"

type StatusInfo = {
  lastSeen: number
  online: boolean
  summary: Array<{ label: string; value: string }>
}

const MAX_POINTS = 50

const formatNumeric = (value: unknown) => {
  const num = numericValue(value)
  if (!Number.isFinite(num)) return "-"
  if (Math.abs(num) >= 100) return num.toFixed(0)
  return num.toFixed(2)
}

export default function Dashboard() {
  const { devices } = useDeviceRegistry()
  const [selectedEsp, setSelectedEsp] = useState<string>(devices[0]?.espId ?? "")
  const [history, setHistory] = useState<Reading[]>([])
  const [statusMap, setStatusMap] = useState<Record<string, StatusInfo>>({})
  const [metricKey, setMetricKey] = useState<string>("")
  const [error, setError] = useState<string>("")
  const [loading, setLoading] = useState<boolean>(false)
  const [lastStatusRefresh, setLastStatusRefresh] = useState<number>(0)

  useEffect(() => {
    if (!selectedEsp && devices.length) {
      setSelectedEsp(devices[0].espId)
    }
  }, [devices, selectedEsp])

  useEffect(() => {
    if (!selectedEsp) return
    let ignore = false
    const controller = new AbortController()

    const loadHistory = async () => {
      try {
        setLoading(true)
        setError("")
        const response = await fetch(`${API_URL}/api/readings/${encodeURIComponent(selectedEsp)}`, {
          signal: controller.signal,
        })
        if (!response.ok) throw new Error(`falha ao carregar leituras (${response.status})`)
        const payload = (await response.json()) as Reading[] | undefined
        if (!ignore) setHistory(Array.isArray(payload) ? payload.slice().reverse() : [])
      } catch (err) {
        if (ignore) return
        if ((err as Error).name !== "AbortError") setError((err as Error).message || "erro ao carregar leituras")
      } finally {
        if (!ignore) setLoading(false)
      }
    }

    loadHistory()
    const timer = setInterval(loadHistory, 5000)
    return () => {
      ignore = true
      controller.abort()
      clearInterval(timer)
    }
  }, [selectedEsp])

  useEffect(() => {
    if (!devices.length) return
    let cancelled = false

    const refreshStatus = async () => {
      try {
        const entries = await Promise.all(
          devices.map(async (device) => {
            try {
              const response = await fetch(`${API_URL}/api/readings/${encodeURIComponent(device.espId)}/latest`)
              if (!response.ok) return [device.espId, null] as const
              const reading = (await response.json()) as Reading | undefined
              if (!reading) return [device.espId, null] as const
              const ts = pickTimestamp(reading, 0) || 0
              const online = ts ? Date.now() - ts < 45_000 : false
              const { flat } = extractPayloadMaps(reading)
              const summary: Array<{ label: string; value: string }> = []
              for (const [key, value] of Object.entries(flat)) {
                if (summary.length >= 3) break
                if (value === null || value === undefined) continue
                const num = numericValue(value)
                const label = key.split(".").slice(-1)[0] || key
                if (Number.isFinite(num)) {
                  summary.push({ label, value: formatNumeric(num) })
                } else if (typeof value === "string" && value.trim()) {
                  summary.push({ label, value: value.trim().slice(0, 24) })
                }
              }
              return [device.espId, { lastSeen: ts, online, summary }] as const
            } catch {
              return [device.espId, null] as const
            }
          })
        )
        if (cancelled) return
        const next: Record<string, StatusInfo> = {}
        for (const [espId, info] of entries) {
          if (info) next[espId] = info
        }
        setStatusMap(next)
        setLastStatusRefresh(Date.now())
      } catch (err) {
        if (!cancelled) console.warn("status refresh failed", err)
      }
    }

    refreshStatus()
    const timer = setInterval(refreshStatus, 7000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [devices])

  const numericKeys = useMemo(() => {
    if (!history.length) return [] as string[]
    const latest = history[history.length - 1]
    const { flat } = extractPayloadMaps(latest)
    return Object.entries(flat)
      .filter(([, value]) => Number.isFinite(numericValue(value)))
      .map(([key]) => key)
  }, [history])

  const sensorTypes: string[] = useMemo(() => {
    if (!history.length) return []

    const typesSet = new Set<string>()
    history.forEach((reading) => {
      if (reading.tipo && typeof reading.tipo === "string") {
        typesSet.add(reading.tipo)
      }
    })

    return Array.from(typesSet)
  }, [history])

  useEffect(() => {
    if (!metricKey && numericKeys.length) {
      setMetricKey(numericKeys[0])
    }
    if (metricKey && numericKeys.length && !numericKeys.includes(metricKey)) {
      setMetricKey(numericKeys[0])
    }
  }, [numericKeys, metricKey])

  const chartData = useMemo(() => {
    if (!metricKey) return [] as Array<{ ts: number; label: string; value: number }>
    return history
      .map((reading, index) => {
        const ts = pickTimestamp(reading, index)
        const { flat } = extractPayloadMaps(reading)
        const match = flat[metricKey]
        const num = numericValue(match)
        return {
          ts: ts || Date.now() - (history.length - index) * 1000,
          label: formatClock(ts || Date.now()),
          value: Number.isFinite(num) ? (num as number) : NaN,
        }
      })
      .filter((row) => Number.isFinite(row.value))
      .slice(-MAX_POINTS)
  }, [history, metricKey])

  const latestInfo = useMemo(() => {
    if (!history.length) return [] as Array<{ label: string; value: string }>
    const latest = history[history.length - 1]
    const { flat } = extractPayloadMaps(latest)
    const entries = Object.entries(flat)
      .slice(0, 12)
      .map(([key, value]) => {
        const label = key.split(".").slice(-1)[0] || key
        const num = numericValue(value)
        if (Number.isFinite(num)) return { label, value: formatNumeric(num) }
        if (typeof value === "string" && value.trim()) return { label, value: value.trim().slice(0, 32) }
        return { label, value: String(value ?? "-") }
      })
    return entries
  }, [history])

  const onlineCount = useMemo(() => Object.values(statusMap).filter((info) => info.online).length, [statusMap])

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <div className="container mx-auto space-y-6 p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-4xl font-bold text-transparent">
              Visao Geral
            </h1>
            <p className="mt-2 text-muted-foreground">
              Acompanhe o status dos dispositivos e as ultimas leituras sem depender de listagens do backend
            </p>
          </div>
          <div className="w-60">
            <Select value={selectedEsp} onValueChange={setSelectedEsp}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um dispositivo" />
              </SelectTrigger>

              <SelectContent>
                {devices.map((device) => (
                  <SelectItem key={device.espId} value={device.espId}>
                    {device.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {error && <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-destructive">{error}</div>}
        {!devices.length && (
          <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">
            Cadastre um dispositivo para comecar a acompanhar as leituras.
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">          
          <Card className="border-primary/20 bg-card/60 backdrop-blur">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Metricas disponiveis</CardTitle>
              <Activity className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{numericKeys.length}</div>
              <p className="text-xs text-muted-foreground">Detectadas a partir das leituras</p>
            </CardContent>
          </Card>
          <Card className="border-primary/20 bg-card/60 backdrop-blur">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Sensores Conectados</CardTitle>
              <Database className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto pr-1">
                {sensorTypes.length > 0 ? (
                  sensorTypes.map((type) => (
                    <Badge key={type} variant="secondary" className="px-2 py-1 text-xs whitespace-nowrap">
                      {type}
                    </Badge>
                  ))
                ) : (
                  <p className="text-xs text-muted-foreground">Nenhum sensor detectado.</p>
                )}
              </div>
            </CardContent>
          </Card>
          <Card className="border-primary/20 bg-card/60 backdrop-blur">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Ultima leitura</CardTitle>
              <Clock className="h-4 w-4 text-secondary" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{history.length ? formatClock(pickTimestamp(history[history.length - 1], history.length - 1) || Date.now()) : "-"}</div>
              <p className="text-xs text-muted-foreground">Dispositivo {selectedEsp || "-"}</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <Card className="border-primary/30 bg-card/60 backdrop-blur">
            <CardHeader className="flex items-center justify-between gap-2">
              <div>
                <CardTitle className="text-center w-full">
                  Evolução temporal
                </CardTitle>
                <CardDescription>Selecione uma metrica para visualizar a tendencia recente</CardDescription>
              </div>
              <select
                className="h-9 rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                value={metricKey}
                onChange={(event) => setMetricKey(event.target.value)}
              >
                <option value="">selecione</option>
                {numericKeys.map((key) => (
                  <option key={key} value={key}>
                    {key}
                  </option>
                ))}
              </select>
            </CardHeader>
            <CardContent className="h-80">
              {metricKey && chartData.length ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 16, right: 24, bottom: 8, left: 0 }}>
                    <CartesianGrid strokeDasharray="4 4" strokeOpacity={0.2} />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} interval="preserveEnd" minTickGap={16} />
                    <YAxis tick={{ fontSize: 12 }} width={60} domain={["dataMin", "dataMax"]} />
                    <Tooltip
                      formatter={(value: number) => formatNumeric(value)}
                      labelFormatter={(label) => label}
                    />
                    <Line type="monotone" dataKey="value" strokeWidth={2} stroke="hsl(var(--primary))" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  {loading ? "Carregando dados" : "Nenhuma serie disponivel"}
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-primary/30 bg-card/60 backdrop-blur">
            <CardHeader>
              <CardTitle>Valores recentes</CardTitle>
              <CardDescription>Resumo da ultima leitura recebida</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {latestInfo.length ? (
                latestInfo.map((item) => (
                  <div key={item.label} className="flex items-center justify-between rounded-lg border border-border/40 p-3 text-sm">
                    <span className="text-muted-foreground">{item.label}</span>
                    <span className="font-semibold text-foreground">{item.value}</span>
                  </div>
                ))
              ) : (
                <div className="rounded-lg border border-dashed p-4 text-center text-muted-foreground">Sem leitura recente</div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
