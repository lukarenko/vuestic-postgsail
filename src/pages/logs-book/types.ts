import { JSONObject } from './../../data/types'

export type Log = {
  id: number
  name: string
  from: string
  to: string
  started: string
  ended: string
  fromTime: string
  toTime: string
  distance: number
  duration: string
  distance_format: string
  duration_format: string
  _from_moorage_id: number
  _to_moorage_id: number
}

export type Trip = {
  id: number
  name: string
  from: string
  fromTime: string
  started: string
  to: string
  toTime: string
  ended: string
  distance: number
  duration: string
  notes: string
  geojson: JSONObject
  avg_speed: number
  max_speed: number
  max_wind_speed: number
  extra: JSONObject
  from_moorage_id: number
  to_moorage_id: number
  seaState: number
  cloudCoverage: number
  visibility: number
}

export type Pagination = {
  page: number
  perPage: number
  total: number
}

export type FormData = {
  isValid: boolean
  name: string
  notes: string
}
