export interface Style {
  id: string
  name: string
  value: string
  negative?: string
  favorite: boolean
  image_filename: string | null
  image_updated_at?: number
}

export interface MixEntry {
  style_id: string
  weight: number
  enabled: boolean
}

export interface Mix {
  id: string
  name: string
  negative?: string
  favorite: boolean
  image_filename: string | null
  image_updated_at?: number
  styles: MixEntry[]
}

export interface StyleMixerData {
  styles: Style[]
  mixes: Mix[]
  current_mix_id: string | null
}

export const EMPTY_DATA: StyleMixerData = {
  styles: [],
  mixes: [],
  current_mix_id: null,
}
