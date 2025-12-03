import { useCallback, useEffect, useMemo, useState } from "react"
import { Plus, RefreshCw, Repeat, Settings, Wifi, WifiOff, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { API_URL } from "@/lib/api"
import { useDeviceRegistry, type ComponentConfig, type Device as StoredDevice } from "@/lib/device-registry"

const pickTimestamp = (value: unknown) => {
  if (!value || typeof value !== "object") return 0
  const source = value as Record<string, unknown>
  const keys = ["timestamp", "ts", "time", "createdAt", "created_at", "date"] as const
  for (const key of keys) {
    const candidate = source[key]
    const parsed = typeof candidate === "string" ? Date.parse(candidate) : typeof candidate === "number" ? candidate : undefined
    if (Number.isFinite(parsed)) return parsed as number
  }
  return 0
}

type CompForm = {
  name?: string
  model?: string
  type?: string
  pin?: number | string | number[]
  interval?: number | string
  unit?: string
  label?: string
  config?: { min?: number | string; max?: number | string }
}

type DeviceForm = {
  name: string
  espId: string
  components: CompForm[]
}

type DeviceStatus = {
  online: boolean
  lastTs: number
}

const novoComponente = (): CompForm => ({
  name: "",
  model: "",
  type: "sensor",
  pin: 0,
  interval: 1000,
  unit: "",
  label: "",
  config: { min: "", max: "" },
})

const validar = (device: DeviceForm) => {
  if (!device.name.trim()) return "Informe um nome"
  if (!device.espId.trim()) return "Informe o espId"
  if (!device.components.length) return "Inclua ao menos um componente"
  return ""
}

const toNumber = (value: number | string | undefined, fallback: number) => {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

const parsePinInput = (value: number | string | number[] | undefined, fallback: number | number[]) => {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (Array.isArray(value)) return value
  if (typeof value === "string" && value.trim()) {
    const trimmed = value.trim()
    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed)
        if (Array.isArray(parsed) && parsed.every((v) => typeof v === "number")) {
          return parsed
        }
      } catch {
        // ignore
      }
    }
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

const formatLastSeen = (timestamp: number) => {
  if (!timestamp) return "sem leituras"
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "medium",
    }).format(new Date(timestamp))
  } catch (err) {
    console.warn("Intl formatter falhou", err)
    return new Date(timestamp).toLocaleString()
  }
}

export default function Devices() {
  const { devices, loading, upsertDevice, removeDevice, refresh } = useDeviceRegistry()
  const [statusMap, setStatusMap] = useState<Record<string, DeviceStatus>>({})
  const [loadingStatus, setLoadingStatus] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")

  const [openForm, setOpenForm] = useState(false)
  const [mode, setMode] = useState<"create" | "edit">("create")
  const [originalEspId, setOriginalEspId] = useState("")
  const [form, setForm] = useState<DeviceForm>({ name: "", espId: "", components: [novoComponente()] })

  const totalSensores = useMemo(
    () => devices.reduce((acc, current) => acc + (current.components?.length || 0), 0),
    [devices]
  )

  const refreshStatus = useCallback(async () => {
    if (!devices.length) {
      setStatusMap({})
      return
    }
    setLoadingStatus(true)
    try {
      const now = Date.now()
      const results = await Promise.all(
        devices.map(async (device) => {
          try {
            const response = await fetch(`${API_URL}/api/readings/${encodeURIComponent(device.espId)}/latest`)
            if (!response.ok) return [device.espId, { online: false, lastTs: 0 }] as const
            const data = await response.json()
            const ts = pickTimestamp(data)
            const online = !!(ts && now - ts < 60_000)
            return [device.espId, { online, lastTs: ts }] as const
          } catch {
            return [device.espId, { online: false, lastTs: 0 }] as const
          }
        })
      )
      const map: Record<string, DeviceStatus> = {}
      for (const [espId, status] of results) map[espId] = status
      setStatusMap(map)
    } finally {
      setLoadingStatus(false)
    }
  }, [devices])

  useEffect(() => {
    refreshStatus()
  }, [refreshStatus])

  const setCampo = (key: keyof DeviceForm, value: string) => setForm((prev) => ({ ...prev, [key]: value }))

  const addComponente = () => setForm((prev) => ({ ...prev, components: [...prev.components, novoComponente()] }))

  const removerComponente = (index: number) =>
    setForm((prev) => ({ ...prev, components: prev.components.filter((_, idx) => idx !== index) }))

  const setCompCampo = (index: number, key: keyof CompForm, value: string | number) =>
    setForm((prev) => {
      const next = [...prev.components]
      next[index] = { ...next[index], [key]: value }
      return { ...prev, components: next }
    })

  const setCompConfig = (index: number, key: "min" | "max", value: string | number) =>
    setForm((prev) => {
      const next = [...prev.components]
      const config = { ...(next[index].config || {}) }
      config[key] = value
      next[index] = { ...next[index], config }
      return { ...prev, components: next }
    })

  const salvar = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError("")
    setMessage("")

    const invalid = validar(form)
    if (invalid) {
      setError(invalid)
      return
    }

    const payload: StoredDevice = {
      name: form.name.trim(),
      espId: form.espId.trim(),
      components: form.components.map<ComponentConfig>((component) => {
        const minRaw = component.config?.min
        const maxRaw = component.config?.max
        const minValue = typeof minRaw !== "undefined" && minRaw !== "" ? Number(minRaw) : undefined
        const maxValue = typeof maxRaw !== "undefined" && maxRaw !== "" ? Number(maxRaw) : undefined

        return {
          name: (component.name || "").trim(),
          model: (component.model || "").trim(),
          type: (component.type || "sensor").trim() || "sensor",
          pin: parsePinInput(component.pin, 0),
          interval: toNumber(component.interval, 1000),
          unit: (component.unit || "").trim() || undefined,
          label: (component.label || "").trim(),
          config:
            (typeof minValue === "number" && Number.isFinite(minValue)) ||
              (typeof maxValue === "number" && Number.isFinite(maxValue))
              ? {
                min: typeof minValue === "number" && Number.isFinite(minValue) ? minValue : undefined,
                max: typeof maxValue === "number" && Number.isFinite(maxValue) ? maxValue : undefined,
              }
              : undefined,
        }
      }),
    }

    // Save locally first
    upsertDevice(payload, mode === "edit" ? originalEspId : undefined)

    // Send to backend
    try {
      const response = await fetch(`${API_URL}/api/configure`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        throw new Error(`Falha ao enviar configuração: ${response.status}`)
      }

      const result = await response.json()
      setMessage(result.message || "Dispositivo configurado e enviado ao backend com sucesso!")
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Erro ao enviar configuração ao backend"
      setError(errorMsg)
      // Keep local save even if backend fails
      setMessage("Dispositivo salvo localmente (erro ao sincronizar com backend)")
    }

    setMode("create")
    setOriginalEspId("")
    setForm({ name: "", espId: "", components: [novoComponente()] })
    setOpenForm(false)
    refreshStatus()
    setTimeout(() => {
      setMessage("")
      setError("")
    }, 5000)
  }

  const editar = (device: StoredDevice) => {
    setMode("edit")
    setOriginalEspId(device.espId)
    setForm({
      name: device.name || "",
      espId: device.espId || "",
      components: (device.components || []).map((component) => ({
        name: component.name || "",
        model: component.model || "",
        type: component.type || "sensor",
        pin: Array.isArray(component.pin) ? JSON.stringify(component.pin) : component.pin ?? 0,
        interval: component.interval ?? 1000,
        unit: component.unit || "",
        label: component.label || "",
        config: {
          min: typeof component.config?.min === "number" ? component.config?.min : "",
          max: typeof component.config?.max === "number" ? component.config?.max : "",
        },
      })),
    })
    setOpenForm(true)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const remover = (device: StoredDevice) => {
    if (!window.confirm(`Remover dispositivo ${device.name || device.espId}?`)) return
    removeDevice(device.espId)
    setMessage("Dispositivo removido")
    refreshStatus()
    setTimeout(() => setMessage(""), 2500)
  }

  const reenviarConfig = async (device: StoredDevice) => {
    setError("")
    setMessage("")
    try {
      const response = await fetch(`${API_URL}/api/device/${encodeURIComponent(device.espId)}/resend`, {
        method: "POST",
      })
      if (!response.ok) throw new Error(`Falha ao reenviar configuração: ${response.status}`)
      setMessage(`Configuração reenviada para ${device.espId}`)
      setTimeout(() => setMessage(""), 2500)
    } catch (err) {
      const fallback = err instanceof Error ? err.message : "Erro ao reenviar configuração"
      setError(fallback)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <div className="container mx-auto space-y-6 p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-4xl font-bold text-transparent">
              Dispositivos IoT
            </h1>
            <p className="mt-2 text-muted-foreground">Gerencie localmente os dispositivos conhecidos pelo frontend</p>
          </div>
          <div className="flex flex-col items-stretch gap-2 sm:flex-row">
            <Button
              variant="outline"
              className="gap-2"
              onClick={async () => {
                setMessage("")
                setError("")
                try {
                  await refresh()
                  setMessage("Dispositivos sincronizados com backend")
                  setTimeout(() => setMessage(""), 2500)
                } catch (err) {
                  setError("Erro ao sincronizar dispositivos")
                }
              }}
              disabled={loading}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Sincronizar com backend
            </Button>
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => refreshStatus()}
              disabled={loadingStatus}
            >
              <RefreshCw className={`h-4 w-4 ${loadingStatus ? "animate-spin" : ""}`} />
              Atualizar status
            </Button>
            <Button className="gap-2" onClick={() => setOpenForm((prev) => !prev)}>
              <Plus className="h-4 w-4" />
              {openForm ? "Fechar formulário" : "Adicionar dispositivo"}
            </Button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Card className="border-border/60 bg-card/60 p-4 backdrop-blur">
            <div className="text-sm text-muted-foreground">Dispositivos cadastrados</div>
            <div className="text-3xl font-semibold">{devices.length}</div>
          </Card>
          <Card className="border-border/60 bg-card/60 p-4 backdrop-blur">
            <div className="text-sm text-muted-foreground">Sensores/atuadores</div>
            <div className="text-3xl font-semibold">{totalSensores}</div>
          </Card>
          <Card className="border-border/60 bg-card/60 p-4 backdrop-blur">
            <div className="text-sm text-muted-foreground">Dispositivos online</div>
            <div className="text-3xl font-semibold">
              {devices.reduce((acc, device) => (statusMap[device.espId]?.online ? acc + 1 : acc), 0)}
            </div>
          </Card>
        </div>

        {!!error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-destructive">{error}</div>
        )}
        {!!message && (
          <div className="rounded-lg border border-emerald-300/40 bg-emerald-200/20 p-3 text-emerald-700">{message}</div>
        )}

        {openForm && (
          <Card className="border-border/60 bg-card/60 backdrop-blur">
            <form className="space-y-5 p-6" onSubmit={salvar}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-muted-foreground">
                    {mode === "edit" ? `Editando ${originalEspId}` : "Novo dispositivo"}
                  </div>
                  <div className="text-xl font-bold">{mode === "edit" ? "Editar dispositivo" : "Cadastrar dispositivo"}</div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2"
                  onClick={() => {
                    setOpenForm(false)
                    setMode("create")
                    setOriginalEspId("")
                    setForm({ name: "", espId: "", components: [novoComponente()] })
                  }}
                >
                  <X className="h-4 w-4" />
                  Fechar
                </Button>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-xs font-semibold text-muted-foreground">Nome</span>
                  <input
                    className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                    placeholder="ex.: esp32 sala"
                    value={form.name}
                    onChange={(event) => setCampo("name", event.target.value)}
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold text-muted-foreground">espId</span>
                  <input
                    className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                    placeholder="ex.: esp32_sala_01"
                    value={form.espId}
                    onChange={(event) => setCampo("espId", event.target.value)}
                    disabled={mode === "edit"}
                  />
                </label>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                    <Settings className="h-4 w-4" />
                    Componentes
                  </div>
                  <Button type="button" variant="outline" className="gap-2" onClick={addComponente}>
                    <Plus className="h-4 w-4" />
                    Adicionar componente
                  </Button>
                </div>

                <div className="space-y-3">
                  {form.components.map((component, index) => (
                    <Card key={index} className="border-border/70 bg-muted/40 p-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="flex-1 space-y-3">
                          <div className="grid gap-3 md:grid-cols-2">
                            <label className="space-y-1">
                              <span className="text-xs font-semibold text-muted-foreground">Nome</span>
                              <input
                                className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                                value={component.name || ""}
                                onChange={(event) => setCompCampo(index, "name", event.target.value)}
                              />
                            </label>
                            <label className="space-y-1">
                              <span className="text-xs font-semibold text-muted-foreground">Label</span>
                              <input
                                className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                                value={component.label || ""}
                                onChange={(event) => setCompCampo(index, "label", event.target.value)}
                              />
                            </label>
                            <label className="space-y-1">
                              <span className="text-xs font-semibold text-muted-foreground">Modelo</span>
                              <Select
                                value={component.model || ""}
                                onValueChange={(value) => setCompCampo(index, "model", value)}
                              >
                                <SelectTrigger className="h-9 w-full">
                                  <SelectValue placeholder="Selecione o modelo" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="botao">Botão</SelectItem>
                                  <SelectItem value="encoder">Encoder</SelectItem>
                                  <SelectItem value="hcsr04">Ultrassônico (HC-SR04)</SelectItem>
                                  <SelectItem value="mpu6050">Acelerômetro (MPU6050)</SelectItem>
                                  <SelectItem value="apds9960">Gestos/Cor (APDS9960)</SelectItem>
                                  <SelectItem value="ir_receiver">Receptor IR</SelectItem>
                                  <SelectItem value="dht11">Temp/Umid (DHT11)</SelectItem>
                                  <SelectItem value="dht22">Temp/Umid (DHT22)</SelectItem>
                                  <SelectItem value="ds18b20">Temp (DS18B20)</SelectItem>
                                  <SelectItem value="joystick_ky023">Joystick (KY-023)</SelectItem>
                                  <SelectItem value="keypad4x4">Teclado 4x4</SelectItem>
                                  <SelectItem value="motor_vibracao">Motor Vibratório</SelectItem>
                                  <SelectItem value="rele">Relé</SelectItem>
                                  <SelectItem value="led">LED</SelectItem>
                                </SelectContent>
                              </Select>
                            </label>
                            <label className="space-y-1">
                              <span className="text-xs font-semibold text-muted-foreground">Tipo</span>
                              <Select
                                value={component.type || "sensor"}
                                onValueChange={(value) => setCompCampo(index, "type", value)}
                              >
                                <SelectTrigger className="h-9 w-full">
                                  <SelectValue placeholder="Selecione o tipo" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="sensor">Sensor</SelectItem>
                                  <SelectItem value="atuador">Atuador</SelectItem>
                                </SelectContent>
                              </Select>
                            </label>
                          </div>

                          <div className="grid gap-3 md:grid-cols-4">
                            <label className="space-y-1">
                              <span className="text-xs font-semibold text-muted-foreground">Pino</span>
                              <input
                                className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                                value={
                                  typeof component.pin === "object"
                                    ? JSON.stringify(component.pin)
                                    : component.pin ?? ""
                                }
                                onChange={(event) => setCompCampo(index, "pin", event.target.value)}
                              />
                            </label>
                            <label className="space-y-1">
                              <span className="text-xs font-semibold text-muted-foreground">Intervalo (ms)</span>
                              <input
                                className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                                value={component.interval ?? ""}
                                onChange={(event) => setCompCampo(index, "interval", event.target.value)}
                              />
                            </label>
                            <label className="space-y-1">
                              <span className="text-xs font-semibold text-muted-foreground">Unidade</span>
                              <input
                                className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                                value={component.unit || ""}
                                onChange={(event) => setCompCampo(index, "unit", event.target.value)}
                              />
                            </label>
                            <div className="grid grid-cols-2 gap-2">
                              <label className="space-y-1">
                                <span className="text-xs font-semibold text-muted-foreground">Mín.</span>
                                <input
                                  className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                                  value={component.config?.min ?? ""}
                                  onChange={(event) => setCompConfig(index, "min", event.target.value)}
                                />
                              </label>
                              <label className="space-y-1">
                                <span className="text-xs font-semibold text-muted-foreground">Máx.</span>
                                <input
                                  className="h-9 w-full rounded-md border border-border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
                                  value={component.config?.max ?? ""}
                                  onChange={(event) => setCompConfig(index, "max", event.target.value)}
                                />
                              </label>
                            </div>
                          </div>
                        </div>
                        <Button type="button" variant="destructive" onClick={() => removerComponente(index)}>
                          Remover
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>

              <div className="flex justify-end">
                <Button type="submit" className="gap-2">
                  <Settings className="h-4 w-4" />
                  {mode === "edit" ? "Salvar alterações" : "Cadastrar dispositivo"}
                </Button>
              </div>
            </form>
          </Card>
        )}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {devices.map((device) => {
            const status = statusMap[device.espId]
            const online = status?.online ?? false
            const lastTs = status?.lastTs ?? 0

            return (
              <Card key={device.espId} className="flex h-full flex-col justify-between border-border/60 bg-card/50 p-5 backdrop-blur">
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold text-muted-foreground">{device.espId}</div>
                      <div className="text-xl font-bold">{device.name || device.espId}</div>
                    </div>
                    <Badge variant={online ? "default" : "secondary"} className={online ? "bg-emerald-500" : "bg-muted"}>
                      {online ? "online" : "offline"}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    {online ? <Wifi className="h-4 w-4 text-emerald-500" /> : <WifiOff className="h-4 w-4 text-muted-foreground" />}
                    <span>{formatLastSeen(lastTs)}</span>
                  </div>

                  <div className="space-y-2">
                    <div className="text-sm font-semibold text-muted-foreground">Componentes</div>
                    <div className="space-y-2">
                      {device.components?.map((component, index) => (
                        <div key={`${device.espId}-${index}`} className="rounded-md border border-border/60 bg-muted/30 p-3">
                          <div className="flex items-center justify-between">
                            <div className="text-sm font-semibold">{component.label || component.name || `Componente ${index + 1}`}</div>
                            <Badge variant="outline">{component.type || "sensor"}</Badge>
                          </div>
                          <div className="mt-2 grid gap-1 text-xs text-muted-foreground">
                            <span>Modelo: {component.model || "-"}</span>
                            <span>Pino: {Array.isArray(component.pin) ? JSON.stringify(component.pin) : component.pin ?? "-"}</span>
                            <span>Intervalo: {component.interval ?? "-"} ms</span>
                            {component.unit ? <span>Unidade: {component.unit}</span> : null}
                            {component.config?.min !== undefined || component.config?.max !== undefined ? (
                              <span>
                                Faixa: {component.config?.min ?? "-"} {"->"}  {component.config?.max ?? "-"}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mt-6 flex flex-wrap gap-2">
                  <Button variant="secondary" className="gap-2" onClick={() => editar(device)}>
                    Editar
                  </Button>
                  <Button variant="outline" className="gap-2" onClick={() => reenviarConfig(device)}>
                    <Repeat className="h-4 w-4" />
                    Reenviar configuração
                  </Button>
                  <Button variant="destructive" className="gap-2" onClick={() => remover(device)}>
                    Remover
                  </Button>
                </div>
              </Card>
            )
          })}
        </div>

        {!devices.length && (
          <Card className="border-dashed border-border/60 bg-card/50 p-8 text-center text-muted-foreground">
            Nenhum dispositivo cadastrado. Clique em "Adicionar dispositivo" para começar.
          </Card>
        )}
      </div>
    </div>
  )
}
