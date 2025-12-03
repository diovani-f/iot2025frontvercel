import type { FormEvent } from "react"
import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { Plus, Zap, Trash2, Edit3, RefreshCw } from "lucide-react"

import { API_URL } from "@/lib/api"
import { useDeviceRegistry } from "@/lib/device-registry"
import { cn } from "@/lib/utils"

type Rule = {
  _id?: string
  name: string
  deviceId: string
  targetDeviceId: string
  sensor: {
    tipo: string
    pino: number | number[]
    field: string
  }
  condition: {
    operator: ">" | "<" | ">=" | "<=" | "==" | "!=" | "between"
    value: number | string
    value2?: number | string
  }
  action: {
    tipo: string
    pino: number | number[]
    command: "ON" | "OFF" | "ON_3S" | "ON_1S"
  } | Array<{
    tipo: string
    pino: number | number[]
    command: "ON" | "OFF" | "ON_3S" | "ON_1S"
  }>
  enabled?: boolean
  description?: string
}

type RuleForm = {
  name: string
  deviceId: string
  targetDeviceId: string
  sensorTipo: string
  sensorPino: string
  sensorField: string
  operator: ">" | "<" | ">=" | "<=" | "==" | "!="
  value: string
  actionTipo: string
  actionPino: string
  actionCommand: "ON" | "OFF" | "ON_3S" | "ON_1S"
  enabled: boolean
  description: string
}

const createEmptyForm = (): RuleForm => ({
  name: "",
  deviceId: "",
  targetDeviceId: "",
  sensorTipo: "",
  sensorPino: "",
  sensorField: "",
  operator: ">",
  value: "",
  actionTipo: "",
  actionPino: "",
  actionCommand: "ON",
  enabled: true,
  description: "",
})

const parsePinInput = (value: string): number | number[] => {
  const trimmed = value.trim()
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      const parsed = JSON.parse(trimmed)
      if (Array.isArray(parsed) && parsed.every((v) => typeof v === "number")) {
        return parsed
      }
    } catch {}
  }
  const num = Number(trimmed)
  return isNaN(num) ? 0 : num
}

const SENSOR_DEFINITIONS: Record<string, { label: string; fields: string[] }> = {
  dht11: { label: "DHT11 (Temp/Umid)", fields: ["temperatura_c", "umidade_pct"] },
  ds18b20: { label: "DS18B20 (Temp)", fields: ["temperatura_c"] },
  hcsr04: { label: "HC-SR04 (Distância)", fields: ["distancia_cm"] },
  ldr: { label: "LDR (Luz)", fields: ["value"] },
  pir: { label: "PIR (Movimento)", fields: ["value"] },
  joystick: { label: "Joystick", fields: ["x", "y", "evento"] },
  mpu6050: { label: "MPU6050 (Acel/Giro)", fields: ["acelerometro.x", "acelerometro.y", "acelerometro.z", "giroscopio.x", "giroscopio.y", "giroscopio.z"] },
  apds9960: { label: "APDS9960 (Gesto/Cor)", fields: ["gesto", "proximidade", "luz_ambiente", "cor.r", "cor.g", "cor.b"] },
  keypad4x4: { label: "Teclado 4x4", fields: ["senha_completa"] },
  ir_receiver: { label: "Receptor IR", fields: ["codigo_hex"] },
  encoder: { label: "Encoder", fields: ["aberto", "pps"] },
  sensor: { label: "Sensor Genérico", fields: ["value"] },
}

const ACTUATOR_DEFINITIONS: Record<string, { label: string }> = {
  led: { label: "LED" },
  rele: { label: "Relé" },
  motor: { label: "Motor DC" },
  motor_vibracao: { label: "Motor de Vibração" },
  buzzer: { label: "Buzzer" },
  servo: { label: "Servo Motor" },
  relay: { label: "Relé" },
}

export default function Automation() {
  const { devices, refreshDevices } = useDeviceRegistry()
  const [rules, setRules] = useState<Rule[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [message, setMessage] = useState("")
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<RuleForm>(createEmptyForm())
  const [availableFields, setAvailableFields] = useState<string[]>([])
  const [loadingFields, setLoadingFields] = useState(false)

  useEffect(() => {
    if (!form.deviceId || !form.sensorTipo) {
      setAvailableFields([])
      return
    }

    const fetchFields = async () => {
      setLoadingFields(true)
      try {
        const response = await fetch(`${API_URL}/api/readings/${encodeURIComponent(form.deviceId)}/latest`)
        if (response.ok) {
          const data = await response.json()
          const fields: string[] = []
          const extractFields = (obj: any, prefix = "") => {
            for (const key in obj) {
              if (typeof obj[key] === "number") {
                fields.push(key)
              } else if (typeof obj[key] === "object" && obj[key] !== null && !Array.isArray(obj[key])) {
                extractFields(obj[key], prefix ? `${prefix}.${key}` : key)
              }
            }
          }
          extractFields(data)
          setAvailableFields(fields)
        }
      } catch (err) {
        console.warn("Erro ao buscar campos:", err)
      } finally {
        setLoadingFields(false)
      }
    }

    const def = SENSOR_DEFINITIONS[form.sensorTipo.toLowerCase()]
    if (def) {
      setAvailableFields(def.fields)
      return
    }

    fetchFields()
  }, [form.deviceId, form.sensorTipo])

  const loadRules = async () => {
    setLoading(true)
    try {
      const response = await fetch(`${API_URL}/api/rules`)
      if (response.ok) {
        const data = await response.json()
        setRules(data)
      } else {
        setError("Erro ao carregar regras")
      }
    } catch (err) {
      console.error("Erro ao carregar regras:", err)
      setError("Erro ao carregar regras")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadRules()
    const interval = setInterval(() => {
      refreshDevices()
    }, 5000)
    return () => clearInterval(interval)
  }, [])

  const openNew = () => {
    setForm(createEmptyForm())
    setEditingId(null)
    setShowForm(true)
    setError("")
    setMessage("")
  }

  const edit = (rule: Rule) => {
    const action = Array.isArray(rule.action) ? rule.action[0] : rule.action
    setForm({
      name: rule.name,
      deviceId: rule.deviceId,
      targetDeviceId: rule.targetDeviceId || rule.deviceId,
      sensorTipo: rule.sensor.tipo,
      sensorPino: Array.isArray(rule.sensor.pino) ? JSON.stringify(rule.sensor.pino) : String(rule.sensor.pino),
      sensorField: rule.sensor.field,
      operator: rule.condition.operator as any,
      value: String(rule.condition.value),
      actionTipo: action.tipo,
      actionPino: Array.isArray(action.pino) ? JSON.stringify(action.pino) : String(action.pino),
      actionCommand: action.command,
      enabled: rule.enabled !== false,
      description: rule.description || "",
    })
    setEditingId(rule._id || null)
    setShowForm(true)
    setError("")
    setMessage("")
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const remove = async (rule: Rule) => {
    if (!window.confirm(`Remover regra "${rule.name}"?`)) return

    try {
      const response = await fetch(`${API_URL}/api/rules/${rule._id}`, {
        method: "DELETE",
      })
      if (response.ok) {
        setMessage("Regra removida com sucesso")
        loadRules()
      } else {
        setError("Erro ao remover regra")
      }
    } catch (err) {
      console.error("Erro ao remover regra:", err)
      setError("Erro ao remover regra")
    }

    setTimeout(() => {
      setMessage("")
      setError("")
    }, 3000)
  }

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError("")
    setMessage("")

    if (!form.name.trim()) return setError("Informe um nome")
    if (!form.deviceId.trim()) return setError("Selecione um dispositivo gatilho")
    if (!form.targetDeviceId.trim()) return setError("Selecione um dispositivo alvo")
    if (!form.sensorTipo.trim()) return setError("Informe o tipo do sensor")
    if (!form.sensorPino.trim()) return setError("Informe o pino do sensor")
    if (!form.sensorField.trim()) return setError("Informe o campo do sensor")
    if (!form.value.trim()) return setError("Informe o valor de condição")
    if (!form.actionTipo.trim()) return setError("Informe o tipo da ação")
    if (!form.actionPino.trim()) return setError("Informe o pino da ação")

    const payload: Omit<Rule, "_id"> = {
      name: form.name.trim(),
      deviceId: form.deviceId.trim(),
      targetDeviceId: form.targetDeviceId.trim(),
      sensor: {
        tipo: form.sensorTipo.trim(),
        pino: parsePinInput(form.sensorPino),
        field: form.sensorField.trim(),
      },
      condition: {
        operator: form.operator,
        value: isNaN(Number(form.value)) ? form.value : Number(form.value),
      },
      action: {
        tipo: form.actionTipo.trim(),
        pino: parsePinInput(form.actionPino),
        command: form.actionCommand,
      },
      enabled: form.enabled,
      description: form.description.trim(),
    }

    try {
      let response
      if (editingId) {
        response = await fetch(`${API_URL}/api/rules/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      } else {
        response = await fetch(`${API_URL}/api/rules`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        })
      }

      if (response.ok) {
        const result = await response.json()
        setMessage(result.message || "Regra salva com sucesso")
        setShowForm(false)
        setEditingId(null)
        loadRules()
      } else {
        const errorData = await response.json()
        setError(errorData.error || "Erro ao salvar regra")
      }
    } catch (err) {
      console.error("Erro ao salvar regra:", err)
      setError("Erro ao salvar regra")
    }

    setTimeout(() => {
      setMessage("")
      setError("")
    }, 5000)
  }

  const sensorOptions: Array<{ tipo: string; pino: number | number[]; label: string }> = []
  const actuatorOptions: Array<{ tipo: string; pino: number | number[]; label: string }> = []

  if (form.deviceId) {
    const device = devices.find((d) => d.espId === form.deviceId)
    if (device) {
      device.components?.forEach((comp) => {
        const label = `${comp.label || comp.name || comp.model} (pino ${comp.pin})`
        const tipo = (comp.type || "").toLowerCase()
        const modelo = (comp.model || "").toLowerCase()

        const modelosSensores = ["dht11", "dht22", "ds18b20", "hcsr04", "mpu6050", "apds9960", "bmp280", "ldr", "pir", "joystick"]
        const isSensorPorModelo = modelosSensores.some(m => modelo.includes(m))
        const isSensor = tipo === "sensor" || isSensorPorModelo

        if (isSensor) {
          sensorOptions.push({
            tipo: comp.model || "",
            pino: comp.pin || 0,
            label,
          })
        }
      })
    }
  }

  if (form.targetDeviceId) {
    const device = devices.find((d) => d.espId === form.targetDeviceId)
    if (device) {
      device.components?.forEach((comp) => {
        const label = `${comp.label || comp.name || comp.model} (pino ${comp.pin})`
        const tipo = (comp.type || "").toLowerCase()
        const modelo = (comp.model || "").toLowerCase()

        const modelosAtuadores = ["led", "rele", "motor", "motor_vibracao", "buzzer", "servo", "relay"]
        const isAtuadorPorModelo = modelosAtuadores.some(m => modelo.includes(m))

        const isAtuador =
          tipo === "atuador" ||
          tipo === "actuator" ||
          tipo === "led" ||
          tipo === "rele" ||
          tipo === "motor" ||
          tipo === "motor_vibracao" ||
          isAtuadorPorModelo

        if (isAtuador) {
          actuatorOptions.push({
            tipo: comp.model || "",
            pino: comp.pin || 0,
            label,
          })
        }
      })
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <div className="container mx-auto space-y-6 p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="bg-gradient-to-r from-primary via-accent to-secondary bg-clip-text text-4xl font-bold text-transparent">
              Configurações e Automação
            </h1>
            <p className="mt-2 text-muted-foreground">Crie regras de automação para seus dispositivos IoT</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="gap-2" onClick={loadRules} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
            <Button className="gap-2" onClick={openNew} disabled={!devices.length}>
              <Plus className="h-4 w-4" />
              Nova Regra
            </Button>
          </div>
        </div>

        {!!error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-destructive">{error}</div>
        )}
        {!!message && (
          <div className="rounded-lg border border-emerald-300/40 bg-emerald-200/20 p-3 text-emerald-700">{message}</div>
        )}
        {!devices.length && (
          <div className="rounded-lg border border-dashed p-4 text-center text-muted-foreground">
            Cadastre ao menos um dispositivo para configurar automações.
          </div>
        )}

        {showForm && (
          <Card className="border-primary/30 bg-card/60 p-6 backdrop-blur">
            <form onSubmit={save} className="space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-semibold text-muted-foreground">
                    {editingId ? "Editar regra" : "Nova regra"}
                  </div>
                  <div className="text-xl font-bold">{form.name || "Sem título"}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground">Ativa</span>
                  <Switch
                    checked={form.enabled}
                    onCheckedChange={(value) => setForm((prev) => ({ ...prev, enabled: value }))}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground">Dispositivo Gatilho (Sensor)</label>
                  <select
                    className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                    value={form.deviceId}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        deviceId: e.target.value,
                        sensorTipo: "",
                        sensorPino: "",
                      }))
                    }
                  >
                    <option value="">Selecione</option>
                    {devices.map((device) => (
                      <option key={device.espId} value={device.espId}>
                        {device.status === 'online' ? '🟢' : '🔴'} {device.name} - {device.espId}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground">Nome da Regra</label>
                  <input
                    className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                    placeholder="ex.: Ligar LED acima de 15°C"
                    value={form.name}
                    onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                  />
                </div>
              </div>

              {/* Sensor Section */}
              <div className="space-y-3 rounded-lg border border-border/60 bg-muted/30 p-4">
                <h3 className="flex items-center gap-2 font-semibold">
                  <Zap className="h-4 w-4 text-accent" />
                  Sensor (Condição)
                </h3>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground">Tipo do Sensor</label>
                    <select
                      className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                      value={(() => {
                        const idx = sensorOptions.findIndex(
                          (s) =>
                            s.tipo === form.sensorTipo &&
                            (Array.isArray(s.pino)
                              ? JSON.stringify(s.pino) === form.sensorPino
                              : String(s.pino) === form.sensorPino)
                        )
                        return idx === -1 ? "" : idx
                      })()}
                      onChange={(e) => {
                        const idx = Number(e.target.value)
                        const selected = sensorOptions[idx]
                        if (selected) {
                          setForm((prev) => ({
                            ...prev,
                            sensorTipo: selected.tipo,
                            sensorPino: Array.isArray(selected.pino)
                              ? JSON.stringify(selected.pino)
                              : String(selected.pino),
                          }))
                        } else {
                          setForm((prev) => ({ ...prev, sensorTipo: "" }))
                        }
                      }}
                      disabled={!form.deviceId}
                    >
                      <option value="">Selecione</option>
                      {sensorOptions.map((sensor, idx) => (
                        <option key={idx} value={idx}>
                          {sensor.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground">Pino do Sensor</label>
                    <input
                      className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                      placeholder="ex.: 33 ou [32, 33]"
                      value={form.sensorPino}
                      onChange={(e) => setForm((prev) => ({ ...prev, sensorPino: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground">
                      Campo (field)
                    </label>
                    <select
                      className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                      value={form.sensorField}
                      onChange={(e) => setForm((prev) => ({ ...prev, sensorField: e.target.value }))}
                    >
                      <option value="">Selecione</option>
                      {availableFields.map((field) => (
                        <option key={field} value={field}>
                          {field}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              
              {/* Condition Section */}
              <div className="space-y-3 rounded-lg border border-border/60 bg-muted/30 p-4">
                <h3 className="font-semibold">Condição</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground">Operador</label>
                    <select
                      className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                      value={form.operator}
                      onChange={(e) => setForm((prev) => ({ ...prev, operator: e.target.value as any }))}
                    >
                      <option value=">">&gt;</option>
                      <option value="<">&lt;</option>
                      <option value=">=">&gt;=</option>
                      <option value="<=">&lt;=</option>
                      <option value="==">==</option>
                      <option value="!=">!=</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground">Valor</label>
                    <input
                      type="text"
                      className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                      placeholder="ex.: 15 ou UP"
                      value={form.value}
                      onChange={(e) => setForm((prev) => ({ ...prev, value: e.target.value }))}
                    />
                  </div>
                </div>
              </div>
              
              {/* Action Section */}
              <div className="space-y-3 rounded-lg border border-border/60 bg-muted/30 p-4">
                <h3 className="flex items-center gap-2 font-semibold">
                  <Zap className="h-4 w-4 text-primary" />
                  Ação
                </h3>
                <div className="grid gap-4 md:grid-cols-2 mb-4">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground">Dispositivo Alvo (Atuador)</label>
                    <select
                      className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                      value={form.targetDeviceId}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          targetDeviceId: e.target.value,
                          actionTipo: "",
                          actionPino: "",
                        }))
                      }
                    >
                      <option value="">Selecione</option>
                      {devices.map((device) => (
                        <option key={device.espId} value={device.espId}>
                          {device.status === 'online' ? '🟢' : '🔴'} {device.name} - {device.espId}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground">Tipo do Atuador</label>
                    <select
                      className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                      value={(() => {
                        const idx = actuatorOptions.findIndex(
                          (a) =>
                            a.tipo === form.actionTipo &&
                            (Array.isArray(a.pino)
                              ? JSON.stringify(a.pino) === form.actionPino
                              : String(a.pino) === form.actionPino)
                        )
                        return idx === -1 ? "" : idx
                      })()}
                      onChange={(e) => {
                        const idx = Number(e.target.value)
                        const selected = actuatorOptions[idx]
                        if (selected) {
                          setForm((prev) => ({
                            ...prev,
                            actionTipo: selected.tipo,
                            actionPino: Array.isArray(selected.pino)
                              ? JSON.stringify(selected.pino)
                              : String(selected.pino),
                          }))
                        } else {
                          setForm((prev) => ({ ...prev, actionTipo: "" }))
                        }
                      }}
                      disabled={!form.targetDeviceId}
                    >
                      <option value="">Selecione</option>
                      {actuatorOptions.map((actuator, idx) => (
                        <option key={idx} value={idx}>
                          {actuator.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground">Pino do Atuador</label>
                    <input
                      className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                      placeholder="ex.: 32 ou [32, 33]"
                      value={form.actionPino}
                      onChange={(e) => setForm((prev) => ({ ...prev, actionPino: e.target.value }))}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-semibold text-muted-foreground">Comando</label>
                    <select
                      className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                      value={form.actionCommand}
                      onChange={(e) => setForm((prev) => ({ ...prev, actionCommand: e.target.value as "ON" | "OFF" | "ON_3S" | "ON_1S" }))}
                    >
                      <option value="ON">ON</option>
                      <option value="OFF">OFF</option>
                      <option value="ON_1S">ON 1s</option>
                      <option value="ON_3S">ON 3s</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground">Descrição</label>
                <textarea
                  className="min-h-[80px] w-full rounded-md border border-border bg-background p-3 text-sm outline-none focus:ring-2 focus:ring-ring"
                  placeholder="Descrição opcional da regra"
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                />
              </div>

              <div className="flex gap-2">
                <Button type="submit">{editingId ? "Salvar Alterações" : "Criar Regra"}</Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowForm(false)
                    setEditingId(null)
                  }}
                >
                  Cancelar
                </Button>
              </div>
            </form>
          </Card>
        )}

        <Card className="border-primary/20 bg-card/50 p-6 backdrop-blur">
          <div className="mb-4 flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            <h2 className="text-xl font-semibold">Regras de Automação</h2>
            <Badge variant="outline">{rules.length}</Badge>
          </div>
          <div className="space-y-3">
            {rules.map((rule) => {
              const action = Array.isArray(rule.action) ? rule.action[0] : rule.action
              return (
                <div key={rule._id} className="rounded-lg border border-border/50 p-4 transition-all hover:border-primary/40">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <div className="mb-1 flex items-center gap-2">
                        <h3 className="font-semibold">{rule.name}</h3>
                        <Badge variant={rule.enabled ? "default" : "secondary"} className="text-xs">
                          {rule.enabled ? "ativa" : "inativa"}
                        </Badge>
                      </div>
                      <p className="mb-2 text-sm text-muted-foreground">{rule.description || "-"}</p>
                      <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                        <span>Gatilho: {rule.deviceId}</span>
                        <span>→</span>
                        <span>Alvo: {rule.targetDeviceId || rule.deviceId}</span>
                        <span>•</span>
                        <span>
                          SE {rule.sensor.tipo} (pino {Array.isArray(rule.sensor.pino) ? JSON.stringify(rule.sensor.pino) : rule.sensor.pino}) {rule.condition.operator} {rule.condition.value}
                        </span>
                        <span>•</span>
                        <span>
                          ENTÃO {action.tipo} (pino {Array.isArray(action.pino) ? JSON.stringify(action.pino) : action.pino}) = {action.command}
                        </span>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="outline" size="sm" className="gap-1" onClick={() => edit(rule)}>
                        <Edit3 className="h-4 w-4" />
                        Editar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1 border-destructive/40 text-destructive hover:bg-destructive/10"
                        onClick={() => remove(rule)}
                      >
                        <Trash2 className="h-4 w-4" />
                        Remover
                      </Button>
                    </div>
                  </div>
                </div>
              )
            })}
            {!rules.length && (
              <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">
                Nenhuma regra criada
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  )
}
