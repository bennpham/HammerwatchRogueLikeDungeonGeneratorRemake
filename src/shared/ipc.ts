import type { DungeonError, DungeonParameters, LevelPreview } from '../generator'

/** App-level settings persisted in the Electron userData folder. */
export interface AppSettings {
  /** Hammerwatch install folder (contains editor/ and levels/) */
  hammerwatchPath: string
  /** remove the intermediate editor folder after packing, like the original */
  cleanupFiles: boolean
}

/** What the renderer gets back from a generate call (files stay cached in main). */
export interface GenerateResponse {
  ok: true
  seed: number
  campaignName: string
  levels: LevelPreview[]
}

export interface InitialState {
  params: DungeonParameters
  settings: AppSettings
  /** where the startup parameters came from */
  paramsSource: 'defaults' | 'parameters.txt override'
  /** unknown keys found in the override file, if any */
  unknownKeys: string[]
}

export interface ActionResult {
  ok: boolean
  message: string
  /** path of whatever was written, when ok */
  outputPath?: string
}

export interface ImportParamsResult {
  ok: boolean
  message: string
  params?: DungeonParameters
  hammerwatchPath?: string
  cleanupFiles?: boolean
  unknownKeys?: string[]
}

/** The API exposed to the renderer through the preload bridge. */
export interface RendererApi {
  getInitialState(): Promise<InitialState>
  generate(params: DungeonParameters, seed?: number): Promise<GenerateResponse | DungeonError>
  installToHammerwatch(): Promise<ActionResult>
  exportFolder(): Promise<ActionResult>
  exportZip(): Promise<ActionResult>
  pickHammerwatchPath(): Promise<string | null>
  saveSettings(settings: AppSettings): Promise<void>
  importParametersTxt(): Promise<ImportParamsResult | null>
  exportParametersTxt(params: DungeonParameters): Promise<ActionResult>
}
