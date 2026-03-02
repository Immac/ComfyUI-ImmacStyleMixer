export interface Style {
  id: string
  name: string
  value: string
  favorite: boolean
  image_filename: string | null
}

export interface MixEntry {
  style_id: string
  weight: number
  enabled: boolean
}

export interface Mix {
  id: string
  name: string
  favorite: boolean
  image_filename: string | null
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
