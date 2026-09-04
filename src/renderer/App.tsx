import React, { useEffect, useMemo, useRef, useState } from 'react'
import { CAMPAIGN_PRESETS, campaignPresetById, defaultParameters, pruneTweaks, validateParameters } from '../generator'
import type { DungeonParameters, PlayerTweaks } from '../generator'
import type { AppSettings, GenerateResponse } from '../shared/ipc'
import { ParameterForm } from './components/ParameterForm'
import { PlayerForm } from './components/PlayerForm'
import { LobbyForm } from './components/LobbyForm'
import { BossForm } from './components/BossForm'
import { FloorOrderEditor } from './components/FloorOrderEditor'
import { LevelPreview } from './components/LevelPreview'
import { LoadoutSheet } from './components/LoadoutSheet'
import { OutputPanel } from './components/OutputPanel'

interface Toast {
  kind: 'ok' | 'error' | 'info'
  text: string
}

export function App() {
  const [params, setParams] = useState<DungeonParameters>(defaultParameters)
  const [settings, setSettings] = useState<AppSettings>({ hammerwatchPath: '', cleanupFiles: true })
  const [seedInput, setSeedInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<GenerateResponse | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  // the lobby is where a run starts, so it is where the app opens; the dungeon
  // and player passes are the optional ones
  const [leftTab, setLeftTab] = useState<'lobby' | 'dungeon' | 'boss' | 'order' | 'player'>('lobby')
  const [rightTab, setRightTab] = useState<'preview' | 'loadout'>('preview')
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const validation = useMemo(() => validateParameters(params), [params])
  const tweakCount = useMemo(
    () => Object.keys(pruneTweaks(params.playerTweaks ?? {})).length,
    [params.playerTweaks]
  )

  const showToast = (kind: Toast['kind'], text: string) => {
    setToast({ kind, text })
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 6000)
  }

  useEffect(() => {
    window.api.getInitialState().then((initial) => {
      setParams(initial.params)
      setSettings(initial.settings)
      if (initial.paramsSource === 'parameters.txt override') {
        const unknown =
          initial.unknownKeys.length > 0 ? ` (ignored unknown keys: ${initial.unknownKeys.join(', ')})` : ''
        showToast('info', `Loaded defaults from parameters.txt override${unknown}`)
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const persistSettings = (next: AppSettings) => {
    setSettings(next)
    void window.api.saveSettings(next)
  }

  const generate = async () => {
    if (!validation.valid) return
    let seed: number | undefined
    if (seedInput.trim() !== '') {
      seed = Number(seedInput.trim())
      if (!Number.isSafeInteger(seed)) {
        showToast('error', 'Seed must be a whole number.')
        return
      }
    }
    setBusy(true)
    try {
      const response = await window.api.generate(params, seed)
      if (response.ok) {
        setResult(response)
        setSeedInput(String(response.seed))
        showToast('ok', `Generated ${response.levels.length} levels (seed ${response.seed}).`)
      } else {
        setResult(null)
        showToast('error', response.errors.join(' '))
      }
    } finally {
      setBusy(false)
    }
  }

  const rerollSeed = () => {
    setSeedInput(String(Math.floor(Math.random() * 2 ** 31)))
  }

  const setTweaks = (playerTweaks: PlayerTweaks) => {
    setParams({ ...params, playerTweaks })
  }

  /** Resets whichever tab you are looking at, leaving the others alone. */
  const resetDefaults = () => {
    if (leftTab === 'player') {
      setParams({ ...params, playerTweaks: {} })
      showToast('info', 'Player tweaks cleared — no tweak files will be written.')
      return
    }
    if (leftTab === 'lobby') {
      setParams({ ...params, lobbies: defaultParameters().lobbies })
      showToast('info', 'Lobbies reset to defaults.')
      return
    }
    if (leftTab === 'boss') {
      setParams({ ...params, boss: defaultParameters().boss })
      showToast('info', 'Boss tab reset to defaults.')
      return
    }
    if (leftTab === 'order') {
      // Absent IS the default order, so resetting means dropping the key.
      const next = { ...params }
      delete next.levelOrder
      setParams(next)
      showToast('info', 'Floor order reset — every floor, then every boss fight.')
      return
    }
    setParams({ ...defaultParameters(), playerTweaks: params.playerTweaks, lobbies: params.lobbies, boss: params.boss })
    showToast('info', 'Dungeon parameters reset to defaults.')
  }

  /**
   * Presets are a full parameter baseline, not a patch: picking one replaces
   * everything on the Dungeon, Player and Lobby tabs. The dropdown snaps back to
   * its placeholder rather than showing the chosen preset, because the very next
   * edit to any field would make that label a lie.
   */
  const applyPreset = (id: string) => {
    const preset = campaignPresetById(id)
    if (preset === undefined) return
    const next = preset.build()
    setParams(next)
    const lost = tweakCount > 0 ? ' Player tweaks were cleared.' : ''
    showToast('ok', `Loaded the ${preset.label} preset — ${next.levels} floors.${lost}`)
  }

  const importParams = async () => {
    const imported = await window.api.importParametersTxt()
    if (imported === null) return
    if (!imported.ok || !imported.params) {
      showToast('error', imported.message)
      return
    }
    setParams(imported.params)
    if (imported.hammerwatchPath !== undefined || imported.cleanupFiles !== undefined) {
      persistSettings({
        hammerwatchPath: imported.hammerwatchPath ?? settings.hammerwatchPath,
        cleanupFiles: imported.cleanupFiles ?? settings.cleanupFiles
      })
    }
    const unknown =
      imported.unknownKeys && imported.unknownKeys.length > 0
        ? ` Ignored unknown keys: ${imported.unknownKeys.join(', ')}.`
        : ''
    showToast('ok', `${imported.message}.${unknown}`)
  }

  const exportParams = async () => {
    const exported = await window.api.exportParametersTxt(params)
    showToast(exported.ok ? 'ok' : 'info', exported.message)
  }

  const runAction = async (action: () => Promise<{ ok: boolean; message: string }>) => {
    setBusy(true)
    try {
      const actionResult = await action()
      showToast(actionResult.ok ? 'ok' : 'error', actionResult.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <h1>Hammerwatch Dungeon Generator</h1>
          <p className="subtitle">Rogue-like campaign generator — remake of the classic forum tool</p>
        </div>
        <div className="header-actions">
          <label className="preset-picker">
            <span className="field-label">Preset</span>
            <select
              value=""
              disabled={busy}
              onChange={(e) => {
                applyPreset(e.target.value)
                e.target.value = ''
              }}
            >
              <option value="">Load a preset…</option>
              {CAMPAIGN_PRESETS.map((preset) => (
                <option key={preset.id} value={preset.id} title={preset.description}>
                  {preset.label}
                </option>
              ))}
            </select>
          </label>
          <button onClick={importParams} disabled={busy}>Import parameters.txt</button>
          <button onClick={exportParams} disabled={busy}>Export parameters.txt</button>
          <button onClick={resetDefaults} disabled={busy}>
            {leftTab === 'player'
              ? 'Reset player tweaks'
              : leftTab === 'lobby'
                ? 'Reset lobbies'
                : leftTab === 'boss'
                  ? 'Reset boss tab'
                  : leftTab === 'order'
                    ? 'Reset floor order'
                    : 'Reset defaults'}
          </button>
        </div>
      </header>

      <div className="app-body">
        <aside className="left-panel">
          <div className="panel-tabs">
            <button
              className={leftTab === 'lobby' ? 'tab active' : 'tab'}
              onClick={() => setLeftTab('lobby')}
            >
              Lobby
              {params.lobbies.length > 0 && <span className="tab-count">on</span>}
            </button>
            <button
              className={leftTab === 'dungeon' ? 'tab active' : 'tab'}
              onClick={() => setLeftTab('dungeon')}
            >
              Dungeon
            </button>
            <button
              className={leftTab === 'boss' ? 'tab active' : 'tab'}
              onClick={() => setLeftTab('boss')}
            >
              Boss
              <span className="tab-count">
                {!params.boss.enabled
                  ? 'off'
                  : (params.boss.fights?.length ?? 0) > 1
                    ? `${params.boss.fights.length} fights`
                    : 'on'}
              </span>
            </button>
            <button
              className={leftTab === 'order' ? 'tab active' : 'tab'}
              onClick={() => setLeftTab('order')}
            >
              Floor order
              {params.levelOrder !== undefined && <span className="tab-count">custom</span>}
            </button>
            <button
              className={leftTab === 'player' ? 'tab active' : 'tab'}
              onClick={() => setLeftTab('player')}
            >
              Player
              {tweakCount > 0 && <span className="tab-count">{tweakCount}</span>}
            </button>
          </div>

          {leftTab === 'dungeon' && (
            <ParameterForm params={params} issues={validation.errors} onChange={setParams} />
          )}
          {leftTab === 'player' && (
            <PlayerForm
              tweaks={params.playerTweaks ?? {}}
              issues={validation.errors}
              onChange={setTweaks}
            />
          )}
          {leftTab === 'lobby' && (
            <LobbyForm params={params} issues={validation.errors} onChange={setParams} />
          )}
          {leftTab === 'boss' && (
            <BossForm params={params} issues={validation.errors} onChange={setParams} />
          )}
          {leftTab === 'order' && (
            <FloorOrderEditor params={params} issues={validation.errors} onChange={setParams} />
          )}
        </aside>

        <main className="right-panel">
          <div className="generate-bar">
            <label className="seed-field">
              <span className="field-label">Seed (blank = random)</span>
              <div className="path-row">
                <input
                  type="text"
                  placeholder="random"
                  value={seedInput}
                  onChange={(e) => setSeedInput(e.target.value)}
                />
                <button onClick={rerollSeed} title="Roll a new random seed">🎲</button>
              </div>
            </label>
            <button className="primary generate-button" disabled={busy || !validation.valid} onClick={generate}>
              {busy ? 'Working…' : 'Generate dungeon'}
            </button>
          </div>

          {validation.errors.length > 0 && (
            <div className="banner banner-error">
              <strong>Fix before generating:</strong>
              <ul>
                {validation.errors.map((e, i) => (
                  <li key={i}>{e.message}</li>
                ))}
              </ul>
            </div>
          )}
          {validation.errors.length === 0 && validation.warnings.length > 0 && (
            <div className="banner banner-warning">
              <ul>
                {validation.warnings.map((warning, i) => (
                  <li key={i}>{warning.message}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="panel-tabs">
            <button
              className={rightTab === 'preview' ? 'tab active' : 'tab'}
              onClick={() => setRightTab('preview')}
            >
              Dungeon preview
            </button>
            <button
              className={rightTab === 'loadout' ? 'tab active' : 'tab'}
              onClick={() => setRightTab('loadout')}
            >
              Loadout
              {tweakCount > 0 && <span className="tab-count">{tweakCount}</span>}
            </button>
          </div>

          {rightTab === 'preview' ? (
            <LevelPreview levels={result?.levels ?? []} seed={result?.seed ?? null} />
          ) : (
            <LoadoutSheet tweaks={params.playerTweaks ?? {}} />
          )}

          <OutputPanel
            settings={settings}
            hasResult={result !== null}
            busy={busy}
            onSettingsChange={persistSettings}
            onPickPath={async () => {
              const picked = await window.api.pickHammerwatchPath()
              if (picked !== null) persistSettings({ ...settings, hammerwatchPath: picked })
            }}
            onInstall={() => runAction(() => window.api.installToHammerwatch())}
            onExportFolder={() => runAction(() => window.api.exportFolder())}
            onExportZip={() => runAction(() => window.api.exportZip())}
          />
        </main>
      </div>

      {toast && <div className={`toast toast-${toast.kind}`}>{toast.text}</div>}
    </div>
  )
}
