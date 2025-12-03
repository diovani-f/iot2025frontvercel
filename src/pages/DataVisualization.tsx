import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Card } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { LineChart as RLine, Line, BarChart as RBar, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ScatterChart, Scatter, ZAxis } from "recharts"

import { API_URL } from "@/lib/api"
import { useDeviceRegistry } from "@/lib/device-registry"
import {
  flattenFirstRoot,
  formatClock,
  normalizeKey,
  numericValue,
  pickTimestamp,
  type Reading,
} from "@/lib/readings-utils"


const findKeys = (readings: Reading[]) => {
  if (!readings || readings.length === 0) return {}

  const sample = readings.slice(-50)
  const allKeys = new Set<string>()

  sample.forEach(r => {
    const flat = flattenFirstRoot(r)
    Object.keys(flat).forEach(k => allKeys.add(k))
  })

  const normalizedKeys = Array.from(allKeys).map(k => ({ original: k, lower: normalizeKey(k.split(".").pop() || k).toLowerCase() }))

  const findAll = (regex: RegExp) => normalizedKeys.filter(k => regex.test(k.lower)).map(k => k.original)


  const temps = findAll(/(temp|temperatura|ds18|dht|bme|bmp)/).filter(k => !/(hum|umid)/i.test(k))
  const hums = findAll(/(hum|umid)/)

  return {
    temp: temps,
    hum: hums,
    dist: findAll(/(dist|distance|distancia|hc-sr04)/),
    speed: findAll(/(speed|velocidade|rpm|encoder)/),
    accelX: findAll(/(accelx|acelerometrox|ax)/),
    accelY: findAll(/(accely|acelerometroy|ay)/),
    accelZ: findAll(/(accelz|acelerometroz|az)/),
    gyroX: findAll(/(gyrox|giroscopiox|gx)/),
    gyroY: findAll(/(gyroy|giroscopioy|gy)/),
    gyroZ: findAll(/(gyroz|giroscopioz|gz)/),
    joyX: findAll(/(joyx|joystickx|vrx)/),
    joyY: findAll(/(joyy|joysticky|vry)/),
    joyBtn: findAll(/(joybtn|joystickbtn|sw|button)/),
    red: findAll(/(red|vermelho)/),
    green: findAll(/(green|verde)/),
    blue: findAll(/(blue|azul)/),
    prox: findAll(/(prox|proximidade)/),
    gesture: findAll(/(gesture|gesto)/),
    relay: findAll(/(relay|rele|state|estado)/),
    vibration: findAll(/(vibration|vibracao)/),
    key: findAll(/(key|tecla|keypad)/),
    ir: findAll(/(ir|ircode|infravermelho)/),
  }
}

type DeviceStatus = {
  online: boolean
  lastTs: number
}

const formatLastSeen = (timestamp: number) => {
  if (!timestamp) return "sem leituras"
  try {
    return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "medium" }).format(new Date(timestamp))
  } catch (err) {
    console.warn("Intl formatter falhou", err)
    return new Date(timestamp).toLocaleString()
  }
}

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--accent))",
  "#ef4444",
  "#22c55e",
  "#3b82f6",
  "#eab308",
  "#a855f7",
  "#ec4899",
  "#14b8a6",
  "#f97316",
]

export default function DataVisualization() {
  const { devices } = useDeviceRegistry()
  const [selected, setSelected] = useState<string>("")
  const [period, setPeriod] = useState<"1h" | "24h" | "7d" | "30d" | "all">("24h")
  const [readings, setReadings] = useState<Reading[]>([])
  const [loadingReadings, setLoadingReadings] = useState(false)
  const [error, setError] = useState("")
  const [statusMap, setStatusMap] = useState<Record<string, DeviceStatus>>({})
  const [loadingStatus, setLoadingStatus] = useState(false)

  const [detectedKeys, setDetectedKeys] = useState<ReturnType<typeof findKeys>>({})

  useEffect(() => {
    if (!devices.length) {
      setSelected("")
      setReadings([])
      return
    }
    setSelected((prev) => {
      if (prev && devices.some((device) => device.espId === prev)) return prev
      return devices[0].espId
    })
  }, [devices])

  const refreshStatus = useCallback(async () => {
    if (!devices.length) {
      setStatusMap({})
      return
    }
    setLoadingStatus(true)
    try {
      const now = Date.now()
      const entries = await Promise.all(
        devices.map(async (device) => {
          try {
            const response = await fetch(`${API_URL}/api/readings/${encodeURIComponent(device.espId)}/latest`)
            if (!response.ok) return [device.espId, { online: false, lastTs: 0 }] as const
            const payload = (await response.json()) as Reading | undefined
            const ts = payload ? pickTimestamp(payload, 0) : 0
            const online = !!(ts && now - ts < 60_000)
            return [device.espId, { online, lastTs: ts }] as const
          } catch (err) {
            console.warn("falha ao consultar status", err)
            return [device.espId, { online: false, lastTs: 0 }] as const
          }
        })
      )
      const next: Record<string, DeviceStatus> = {}
      for (const [espId, data] of entries) next[espId] = data
      setStatusMap(next)
    } finally {
      setLoadingStatus(false)
    }
  }, [devices])

  useEffect(() => {
    refreshStatus()
  }, [refreshStatus])

  useEffect(() => {
    if (!selected) {
      setReadings([])
      return
    }
    let cancelled = false
    const load = async () => {
      setLoadingReadings(true)
      setError("")
      try {
        const response = await fetch(`${API_URL}/api/readings/${encodeURIComponent(selected)}`)
        if (!response.ok) throw new Error(`falha ao buscar leituras: ${response.status}`)
        const payload = (await response.json()) as Reading[]
        if (!cancelled) {
          const data = Array.isArray(payload) ? payload.reverse() : []
          setReadings(data)
          if (data.length > 0) {
            setDetectedKeys(findKeys(data))
          } else {
            setDetectedKeys({})
          }
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "erro ao buscar leituras")
      } finally {
        if (!cancelled) setLoadingReadings(false)
      }
    }
    load()
    const timer = setInterval(load, 5000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [selected])

  const filteredReadings = useMemo(() => {
    if (!readings.length) return [] as Reading[]
    if (period === "all") return readings

    const now = Date.now()
    const span =
      period === "1h"
        ? 3600_000
        : period === "24h"
          ? 24 * 3600_000
          : period === "7d"
            ? 7 * 24 * 3600_000
            : 30 * 24 * 3600_000
    return readings.filter((row, index) => {
      const fallback = now - (readings.length - index) * 1000
      const ts = pickTimestamp(row, fallback)
      return ts && now - ts <= span
    })
  }, [readings, period])

  const chartData = useMemo(() => {
    const source = filteredReadings.length ? filteredReadings : []
    return source.map((row, index) => {
      const fallback = Date.now() - (source.length - index) * 1000
      const ts = pickTimestamp(row, fallback)
      const flat = flattenFirstRoot(row)

      const processed: Record<string, any> = {
        time: formatClock(ts),
        timestamp: ts,
        ...flat
      }

      Object.values(detectedKeys).flat().forEach(key => {
        if (key && flat[key] !== undefined) {
          processed[key] = numericValue(flat[key])
        }
      })

      if (detectedKeys.gesture) {
        detectedKeys.gesture.forEach(k => {
          if (k) processed[k] = flat[k]
        })
      }

      return processed
    })
  }, [filteredReadings, detectedKeys])

  const hasData = (keys?: string[]) => keys && keys.length > 0

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <div className="container mx-auto space-y-6 p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-4xl font-bold text-transparent">
              Dados e Visualização
            </h1>
            <p className="mt-2 text-muted-foreground">Análise detalhada dos dados dos sensores</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Select value={period} onValueChange={(value) => setPeriod(value as typeof period)}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Período" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1h">Última hora</SelectItem>
                <SelectItem value="24h">Últimas 24h</SelectItem>
                <SelectItem value="7d">Últimos 7 dias</SelectItem>
                <SelectItem value="30d">Últimos 30 dias</SelectItem>
                <SelectItem value="all">Todo o histórico</SelectItem>
              </SelectContent>
            </Select>

            <Select value={selected} onValueChange={(value) => setSelected(value)}>
              <SelectTrigger className="w-[220px]">
                <SelectValue placeholder="Dispositivo" />
              </SelectTrigger>
              <SelectContent>
                {devices.map((device) => (
                  <SelectItem key={device.espId} value={device.espId}>
                    {device.name} ({device.espId})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {!!error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-destructive">erro: {error}</div>
        )}
        {loadingReadings && (
          <div className="rounded-lg border border-primary/30 bg-primary/10 p-3 text-primary">carregando leituras...</div>
        )}

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList className="flex w-full flex-wrap justify-start gap-2 bg-transparent p-0">
            <TabsTrigger value="overview" className="data-[state=active]:bg-primary/10">Visão Geral</TabsTrigger>
            {(hasData(detectedKeys.temp) || hasData(detectedKeys.hum)) && <TabsTrigger value="climate" className="data-[state=active]:bg-primary/10">Clima</TabsTrigger>}
            {(hasData(detectedKeys.accelX) || hasData(detectedKeys.gyroX)) && <TabsTrigger value="motion" className="data-[state=active]:bg-primary/10">Movimento</TabsTrigger>}
            {hasData(detectedKeys.dist) && <TabsTrigger value="distance" className="data-[state=active]:bg-primary/10">Distância</TabsTrigger>}
            {hasData(detectedKeys.speed) && <TabsTrigger value="speed" className="data-[state=active]:bg-primary/10">Velocidade</TabsTrigger>}
            {(hasData(detectedKeys.red) || hasData(detectedKeys.prox) || hasData(detectedKeys.gesture)) && <TabsTrigger value="light" className="data-[state=active]:bg-primary/10">Luz & Gestos</TabsTrigger>}
            {hasData(detectedKeys.joyX) && <TabsTrigger value="joystick" className="data-[state=active]:bg-primary/10">Joystick</TabsTrigger>}
            {(hasData(detectedKeys.key) || hasData(detectedKeys.ir) || hasData(detectedKeys.relay) || hasData(detectedKeys.vibration)) && <TabsTrigger value="events" className="data-[state=active]:bg-primary/10">Eventos & Estados</TabsTrigger>}
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <Card className="border-primary/20 bg-card/50 p-6 backdrop-blur">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-semibold">Status dos Dispositivos</h3>
                <button
                  type="button"
                  className="text-sm text-primary hover:underline"
                  onClick={() => refreshStatus()}
                  disabled={loadingStatus}
                >
                  {loadingStatus ? "Atualizando..." : "Atualizar agora"}
                </button>
              </div>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                {devices.map((device) => {
                  const status = statusMap[device.espId]
                  const online = !!status?.online
                  const last = status?.lastTs ? formatLastSeen(status.lastTs) : ""
                  return (
                    <div
                      key={device.espId}
                      className={`rounded-lg border p-4 transition-all ${online ? "border-primary/20 bg-gradient-to-br from-primary/5 to-transparent shadow-sm" : "border-border/50 bg-muted/30 opacity-70"
                        }`}
                    >
                      <div className="flex items-center justify-between">
                        <p className="font-medium">{device.name || device.espId}</p>
                        <div className={`h-2 w-2 rounded-full ${online ? "bg-green-500" : "bg-red-500"}`} />
                      </div>
                      <p className={`mt-2 text-2xl font-bold ${online ? "text-foreground" : "text-muted-foreground"}`}>
                        {online ? "Online" : "Offline"}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {online ? `Última leitura: ${last}` : "Sem atividade recente"}
                      </p>
                    </div>
                  )
                })}
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="climate" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              {hasData(detectedKeys.temp) && (
                <Card className="border-primary/20 bg-card/50 p-6 backdrop-blur">
                  <h3 className="mb-4 text-lg font-semibold">Temperatura (°C)</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <RLine data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="time" stroke="hsl(var(--foreground))" fontSize={12} tickMargin={10} />
                      <YAxis stroke="hsl(var(--foreground))" fontSize={12} />
                      <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))" }} />
                      <Legend />
                      {detectedKeys.temp?.map((key, i) => (
                        <Line key={key} type="monotone" dataKey={key} name={key} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} connectNulls />
                      ))}
                    </RLine>
                  </ResponsiveContainer>
                </Card>
              )}
              {hasData(detectedKeys.hum) && (
                <Card className="border-primary/20 bg-card/50 p-6 backdrop-blur">
                  <h3 className="mb-4 text-lg font-semibold">Umidade (%)</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <RLine data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="time" stroke="hsl(var(--foreground))" fontSize={12} tickMargin={10} />
                      <YAxis stroke="hsl(var(--foreground))" fontSize={12} />
                      <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))" }} />
                      <Legend />
                      {detectedKeys.hum?.map((key, i) => (
                        <Line key={key} type="monotone" dataKey={key} name={key} stroke={COLORS[(i + 2) % COLORS.length]} strokeWidth={2} dot={false} connectNulls />
                      ))}
                    </RLine>
                  </ResponsiveContainer>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="motion" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              {hasData(detectedKeys.accelX) && (
                <Card className="border-primary/20 bg-card/50 p-6 backdrop-blur">
                  <h3 className="mb-4 text-lg font-semibold">Acelerômetro</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <RLine data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="time" stroke="hsl(var(--foreground))" fontSize={12} />
                      <YAxis stroke="hsl(var(--foreground))" fontSize={12} />
                      <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))" }} />
                      <Legend />
                      {detectedKeys.accelX?.map((key, i) => <Line key={key} type="monotone" dataKey={key} name={key} stroke="#ef4444" dot={false} connectNulls />)}
                      {detectedKeys.accelY?.map((key, i) => <Line key={key} type="monotone" dataKey={key} name={key.replace('X', 'Y')} stroke="#22c55e" dot={false} connectNulls />)}
                      {detectedKeys.accelZ?.map((key, i) => <Line key={key} type="monotone" dataKey={key} name={key.replace('X', 'Z')} stroke="#3b82f6" dot={false} connectNulls />)}
                    </RLine>
                  </ResponsiveContainer>
                </Card>
              )}
              {hasData(detectedKeys.gyroX) && (
                <Card className="border-primary/20 bg-card/50 p-6 backdrop-blur">
                  <h3 className="mb-4 text-lg font-semibold">Giroscópio</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <RLine data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="time" stroke="hsl(var(--foreground))" fontSize={12} />
                      <YAxis stroke="hsl(var(--foreground))" fontSize={12} />
                      <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))" }} />
                      <Legend />
                      {detectedKeys.gyroX?.map((key, i) => <Line key={key} type="monotone" dataKey={key} name={key} stroke="#ef4444" dot={false} connectNulls />)}
                      {detectedKeys.gyroY?.map((key, i) => <Line key={key} type="monotone" dataKey={key} name={key.replace('X', 'Y')} stroke="#22c55e" dot={false} connectNulls />)}
                      {detectedKeys.gyroZ?.map((key, i) => <Line key={key} type="monotone" dataKey={key} name={key.replace('X', 'Z')} stroke="#3b82f6" dot={false} connectNulls />)}
                    </RLine>
                  </ResponsiveContainer>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="distance" className="space-y-4">
            <Card className="border-primary/20 bg-card/50 p-6 backdrop-blur">
              <h3 className="mb-4 text-lg font-semibold">Distância (cm)</h3>
              <ResponsiveContainer width="100%" height={300}>
                <RLine data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="time" stroke="hsl(var(--foreground))" fontSize={12} />
                  <YAxis stroke="hsl(var(--foreground))" fontSize={12} />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))" }} />
                  <Legend />
                  {detectedKeys.dist?.map((key, i) => (
                    <Line key={key} type="stepAfter" dataKey={key} name={key} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} connectNulls />
                  ))}
                </RLine>
              </ResponsiveContainer>
            </Card>
          </TabsContent>

          <TabsContent value="speed" className="space-y-4">
            <Card className="border-primary/20 bg-card/50 p-6 backdrop-blur">
              <h3 className="mb-4 text-lg font-semibold">Velocidade (RPM/Encoder)</h3>
              <ResponsiveContainer width="100%" height={300}>
                <RLine data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="time" stroke="hsl(var(--foreground))" fontSize={12} />
                  <YAxis stroke="hsl(var(--foreground))" fontSize={12} />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))" }} />
                  <Legend />
                  {detectedKeys.speed?.map((key, i) => (
                    <Line key={key} type="monotone" dataKey={key} name={key} stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={false} connectNulls />
                  ))}
                </RLine>
              </ResponsiveContainer>
            </Card>
          </TabsContent>

          <TabsContent value="light" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              {(hasData(detectedKeys.red) || hasData(detectedKeys.prox)) && (
                <Card className="border-primary/20 bg-card/50 p-6 backdrop-blur">
                  <h3 className="mb-4 text-lg font-semibold">Cor e Proximidade</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <RBar data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="time" stroke="hsl(var(--foreground))" fontSize={12} />
                      <YAxis stroke="hsl(var(--foreground))" fontSize={12} />
                      <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))" }} />
                      <Legend />
                      {detectedKeys.red?.map((key, i) => <Bar key={key} dataKey={key} name="Red" fill="#ef4444" stackId="a" />)}
                      {detectedKeys.green?.map((key, i) => <Bar key={key} dataKey={key} name="Green" fill="#22c55e" stackId="a" />)}
                      {detectedKeys.blue?.map((key, i) => <Bar key={key} dataKey={key} name="Blue" fill="#3b82f6" stackId="a" />)}
                      {detectedKeys.prox?.map((key, i) => <Bar key={key} dataKey={key} name="Proximidade" fill="hsl(var(--foreground))" />)}
                    </RBar>
                  </ResponsiveContainer>
                </Card>
              )}
              {hasData(detectedKeys.gesture) && (
                <Card className="border-primary/20 bg-card/50 p-6 backdrop-blur">
                  <h3 className="mb-4 text-lg font-semibold">Últimos Gestos</h3>
                  <div className="max-h-[300px] overflow-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="border-b border-border text-muted-foreground">
                        <tr>
                          <th className="p-2">Horário</th>
                          <th className="p-2">Gesto</th>
                        </tr>
                      </thead>
                      <tbody>
                        {chartData.slice().reverse().map((d, i) => {
                          const gestures = detectedKeys.gesture?.map(k => d[k]).filter(Boolean) || []
                          if (!gestures.length) return null
                          return gestures.map((g, j) => (
                            <tr key={`${i}-${j}`} className="border-b border-border/50 hover:bg-muted/20">
                              <td className="p-2">{d.time}</td>
                              <td className="p-2 font-medium">{String(g)}</td>
                            </tr>
                          ))
                        })}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}
            </div>
          </TabsContent>

          <TabsContent value="joystick" className="space-y-4">
            <Card className="border-primary/20 bg-card/50 p-6 backdrop-blur">
              <h3 className="mb-4 text-lg font-semibold">Joystick (Posição X/Y)</h3>
              <ResponsiveContainer width="100%" height={400}>
                <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                  <CartesianGrid />
                  <XAxis type="number" dataKey={detectedKeys.joyX?.[0]} name="X" domain={[0, 4095]} />
                  <YAxis type="number" dataKey={detectedKeys.joyY?.[0]} name="Y" domain={[0, 4095]} />
                  <ZAxis type="number" dataKey="timestamp" range={[60, 400]} name="Time" />
                  <Tooltip cursor={{ strokeDasharray: '3 3' }} contentStyle={{ backgroundColor: "hsl(var(--card))", borderColor: "hsl(var(--border))" }} />
                  <Legend />
                  <Scatter name="Posição" data={chartData} fill="hsl(var(--primary))" line />
                </ScatterChart>
              </ResponsiveContainer>
            </Card>
          </TabsContent>

          <TabsContent value="events" className="space-y-4">
            <Card className="border-primary/20 bg-card/50 p-6 backdrop-blur">
              <h3 className="mb-4 text-lg font-semibold">Log de Eventos</h3>
              <div className="max-h-[500px] overflow-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border text-muted-foreground">
                    <tr>
                      <th className="p-2">Horário</th>
                      <th className="p-2">Tipo</th>
                      <th className="p-2">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {chartData.slice().reverse().map((d, i) => {
                      const events = []
                      detectedKeys.key?.forEach(k => { if (d[k] !== undefined) events.push({ type: "Teclado", val: d[k] }) })
                      detectedKeys.ir?.forEach(k => { if (d[k] !== undefined) events.push({ type: "Infravermelho", val: d[k] }) })
                      detectedKeys.relay?.forEach(k => { if (d[k] !== undefined) events.push({ type: "Relé", val: d[k] }) })
                      detectedKeys.vibration?.forEach(k => { if (d[k] !== undefined) events.push({ type: "Vibração", val: d[k] }) })

                      if (events.length === 0) return null

                      return events.map((e, j) => (
                        <tr key={`${i}-${j}`} className="border-b border-border/50 hover:bg-muted/20">
                          <td className="p-2">{d.time}</td>
                          <td className="p-2 text-muted-foreground">{e.type}</td>
                          <td className="p-2 font-medium">{String(e.val)}</td>
                        </tr>
                      ))
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          </TabsContent>

        </Tabs>
      </div>
    </div>
  )
}
