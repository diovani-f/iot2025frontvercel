export type ComponentConfig = {
  min?: number
  max?: number
  [key: string]: any
}

export type Component = {
  name?: string
  model?: string
  type?: string
  pin?: number | number[]
  interval?: number
  unit?: string
  label?: string
  config?: ComponentConfig
  [key: string]: any
}

export type Device = {
  name: string
  espId: string
  components: Component[]
}

export type Reading = {
  espId: string
  timestamp?: string | number
  createdAt?: string
  updatedAt?: string
  data?: Record<string, any>
  payload?: Record<string, any>
  values?: Record<string, any>
  readings?: Record<string, any>
  medidas?: Record<string, any>
  [key: string]: any
}

export type LatestReadingResponse = Reading | null
