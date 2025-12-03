import type { Component, Device } from "@/types/iot"

const mapModelToTipo = (model: string): string => {
  const value = (model || "").toUpperCase().trim()
  switch (value) {
    case "KY-023":
      return "joystick"
    case "DHT11":
      return "dht11"
    case "DHT22":
      return "dht22"
    case "DS18B20":
    case "DS18B20SENSOR":
    case "DS18B20_SENSOR":
    case "DS18B20-SENSOR":
      return "ds18b20"
    case "HCSR04":
      return "hcsr04"
    case "MPU6050":
      return "mpu6050"
    case "APDS9960":
      return "apds9960"
    case "KEYPAD":
    case "KEYPAD4X4":
      return "keypad4x4"
    case "ENCODER":
      return "encoder"
    case "LED":
      return "led"
    case "RELE":
    case "RELÉ":
      return "rele"
    case "MOTOR_VIBRACAO":
    case "MOTOR VIBRACAO":
    case "MOTOR-VIBRACAO":
    case "VIB":
    case "VIBRACAO":
      return "motor_vibracao"
    case "IR RECEIVER":
    case "IR_RECEIVER":
      return "ir_receiver"
    default:
      return value.toLowerCase()
  }
}

export const resolveComponentKey = (component: Component, index: number): string => {
  const base = component.label || component.name || component.model || component.type
  if (base) return `${base}`
  return `comp_${index}`
}

export const resolveSensorId = (component: Component, index = 0): string | null => {
  if (typeof component.pin !== "number" && !Array.isArray(component.pin)) return null
  const tipo = mapModelToTipo(component.model || component.label || component.name || component.type || "")
  if (!tipo) return null
  const pinStr = Array.isArray(component.pin) ? component.pin.join("_") : component.pin
  return `${tipo}_${pinStr}`
}

export const describeComponent = (component: Component, index: number): string => {
  const pieces = [component.label, component.name, component.model, component.type]
    .filter(Boolean)
    .map((s) => String(s))
  if (typeof component.pin === "number") pieces.push(`pino ${component.pin}`)
  if (Array.isArray(component.pin)) pieces.push(`pinos ${JSON.stringify(component.pin)}`)
  return pieces.length ? pieces.join(" · ") : `Componente ${index + 1}`
}

export const mergeDeviceLists = (primary: Device[], fallback: Device[]): Device[] => {
  if (!primary.length && !fallback.length) return []
  const map = new Map<string, Device>()
  for (const d of fallback) map.set(d.espId, d)
  for (const d of primary) map.set(d.espId, d)
  return Array.from(map.values())
}
