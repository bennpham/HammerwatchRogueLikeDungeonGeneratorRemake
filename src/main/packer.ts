import { execFile } from 'child_process'
import { existsSync } from 'fs'
import { mkdir, rename, rm, writeFile } from 'fs/promises'
import { dirname, join } from 'path'
import type { GeneratedFile } from '../generator'
import type { ActionResult } from '../shared/ipc'

/** Write the campaign files into a target folder, creating subfolders. */
export async function writeCampaign(targetDir: string, files: GeneratedFile[]): Promise<void> {
  for (const file of files) {
    const fullPath = join(targetDir, file.path)
    await mkdir(dirname(fullPath), { recursive: true })
    await writeFile(fullPath, file.content, 'utf-8')
  }
}

/**
 * The original pipeline: write the campaign into <hw>/editor/<name>/, run
 * <hw>/editor/LevelPacker.exe on it, then move the produced .hwm into
 * <hw>/levels/. LevelPacker is a Windows tool shipped with the game.
 */
export async function installCampaign(
  hammerwatchPath: string,
  campaignName: string,
  files: GeneratedFile[],
  cleanupFiles: boolean
): Promise<ActionResult> {
  if (!hammerwatchPath) {
    return { ok: false, message: 'Set your Hammerwatch install folder first.' }
  }
  if (!existsSync(hammerwatchPath)) {
    return { ok: false, message: `Hammerwatch folder not found: ${hammerwatchPath}` }
  }

  const packerPath = join(hammerwatchPath, 'editor', 'LevelPacker.exe')
  if (!existsSync(packerPath)) {
    return {
      ok: false,
      message:
        `LevelPacker.exe not found at ${packerPath}. ` +
        'Check that this is a Hammerwatch install with the editor tools, or use "Export folder" and pack manually.'
    }
  }

  const campaignDir = join(hammerwatchPath, 'editor', campaignName)
  await writeCampaign(campaignDir, files)

  // LevelPacker is a Windows executable; on Linux/Mac try wine as a courtesy
  const isWindows = process.platform === 'win32'
  const command = isWindows ? packerPath : 'wine'
  const args = isWindows ? [campaignDir] : [packerPath, campaignDir]

  const packResult = await new Promise<{ ok: boolean; message: string }>((resolve) => {
    execFile(command, args, { timeout: 120_000 }, (error) => {
      if (error) {
        const hint = isWindows
          ? ''
          : ' (LevelPacker.exe is a Windows tool — install wine, or use "Export folder" and pack on Windows)'
        resolve({ ok: false, message: `LevelPacker failed: ${error.message}${hint}` })
      } else {
        resolve({ ok: true, message: 'packed' })
      }
    })
  })

  if (!packResult.ok) {
    return { ok: false, message: `${packResult.message}. The unpacked campaign was left at ${campaignDir}.` }
  }

  const producedHwm = join(hammerwatchPath, 'editor', `${campaignName}.hwm`)
  const targetHwm = join(hammerwatchPath, 'levels', `${campaignName}.hwm`)
  if (!existsSync(producedHwm)) {
    return {
      ok: false,
      message: `LevelPacker ran but ${campaignName}.hwm was not produced. The campaign folder is at ${campaignDir}.`
    }
  }
  await mkdir(dirname(targetHwm), { recursive: true })
  await rename(producedHwm, targetHwm)

  if (cleanupFiles) {
    await rm(campaignDir, { recursive: true, force: true })
  }

  return {
    ok: true,
    message: `Installed ${campaignName}.hwm — pick it from the level list in Hammerwatch.`,
    outputPath: targetHwm
  }
}
