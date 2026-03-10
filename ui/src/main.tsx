// /scripts/app.js is an external — types declared in src/comfy.d.ts,
// module resolved to ComfyUI's runtime at runtime (not bundled by Vite).
// @ts-ignore — tsc can't resolve absolute URL externals; Vite handles this correctly.
import { app } from '/scripts/app.js'
// @ts-ignore
import { api } from '/scripts/api.js'
import JSZip from 'jszip'
import React, { Suspense } from 'react'
import ReactDOM from 'react-dom/client'

const StyleMixerPanel = React.lazy(() => import('./components/StyleMixerPanel'))

async function init(): Promise<void> {

  ;(app as any).extensionManager.registerSidebarTab({
    id: 'immac-style-mixer',
    icon: 'pi pi-palette',
    title: 'Style Mixer',
    tooltip: 'Immac Style Mixer',
    type: 'custom' as const,
    render: (element: HTMLElement) => {
      const container = document.createElement('div')
      container.id = 'immac-style-mixer-root'
      container.style.position = 'absolute'
      container.style.inset = '0'
      container.style.overflow = 'hidden'
      element.style.position = 'relative'
      element.style.height = '100%'
      element.appendChild(container)

      ReactDOM.createRoot(container).render(
        <React.StrictMode>
          <Suspense fallback={<div style={{ padding: '1rem' }}>Loading…</div>}>
            <StyleMixerPanel />
          </Suspense>
        </React.StrictMode>
      )
    },
  })

  const API_URL = '/immac_style_mixer/api/data'
  type ImportMode = 'replace' | 'merge'
  type DuplicatePolicy = 'rename' | 'replace' | 'skip'

  interface RestoreSummary {
    added_styles: string[]
    added_mixes: string[]
    conflicted_styles: Array<{old_name?: string, new_name?: string, name?: string, action: string}>
    conflicted_mixes: Array<{old_name?: string, new_name?: string, name?: string, action: string}>
    total_added_styles: number
    total_added_mixes: number
    total_conflicted_styles: number
    total_conflicted_mixes: number
    ignored_duplicate_styles?: number
    ignored_duplicate_mixes?: number
  }

  function showImportCleanupToast(summary?: RestoreSummary, skippedInvalidImages?: number) {
    const ignoredStyles = Number(summary?.ignored_duplicate_styles ?? 0)
    const ignoredMixes = Number(summary?.ignored_duplicate_mixes ?? 0)
    const skippedImages = Number(skippedInvalidImages ?? 0)
    const parts: string[] = []
    if (ignoredStyles > 0) parts.push(`${ignoredStyles} duplicate style(s) ignored`)
    if (ignoredMixes > 0) parts.push(`${ignoredMixes} duplicate mix(es) ignored`)
    if (skippedImages > 0) parts.push(`${skippedImages} invalid image path(s) skipped`)
    if (parts.length === 0) return

    try {
      ;(app as any)?.toast?.add({
        severity: 'info',
        summary: 'Import Cleanup',
        detail: parts.join(' · '),
        life: 5000,
      })
    } catch (_) {
      ;(app as any)?.toast?.add({
        severity: 'info',
        summary: 'Import Cleanup',
        detail: parts.join(' · '),
        life: 5000,
      })
    }
  }

  function showRestoreConfirmation(summary: RestoreSummary, totalStyles: number, totalMixes: number, images?: number) {
    const lines: string[] = []
    
    lines.push(`✅ Restore complete!`)
    lines.push(`📊 Total: ${totalStyles} styles, ${totalMixes} mixes${images !== undefined ? `, ${images} images` : ''}`)
    lines.push('')

    if (summary.total_added_styles > 0 || summary.total_added_mixes > 0) {
      lines.push(`➕ Added:`)
      if (summary.total_added_styles > 0) {
        const shown = summary.added_styles.slice(0, 10)
        const more = summary.total_added_styles - shown.length
        lines.push(`  • ${summary.total_added_styles} style${summary.total_added_styles === 1 ? '' : 's'}${shown.length > 0 ? ': ' + shown.join(', ') : ''}${more > 0 ? ` (+${more} more)` : ''}`)
      }
      if (summary.total_added_mixes > 0) {
        const shown = summary.added_mixes.slice(0, 10)
        const more = summary.total_added_mixes - shown.length
        lines.push(`  • ${summary.total_added_mixes} mix${summary.total_added_mixes === 1 ? '' : 'es'}${shown.length > 0 ? ': ' + shown.join(', ') : ''}${more > 0 ? ` (+${more} more)` : ''}`)
      }
      lines.push('')
    }

    if (summary.total_conflicted_styles > 0 || summary.total_conflicted_mixes > 0) {
      lines.push(`⚠️ Conflicts handled:`)
      if (summary.total_conflicted_styles > 0) {
        const shown = summary.conflicted_styles.slice(0, 5)
        const more = summary.total_conflicted_styles - shown.length
        lines.push(`  • ${summary.total_conflicted_styles} style${summary.total_conflicted_styles === 1 ? '' : 's'}:`)
        shown.forEach(c => {
          if (c.action === 'renamed') {
            lines.push(`    - "${c.old_name}" → "${c.new_name}" (renamed)`)
          } else {
            lines.push(`    - "${c.name}" (${c.action})`)
          }
        })
        if (more > 0) lines.push(`    ... and ${more} more`)
      }
      if (summary.total_conflicted_mixes > 0) {
        const shown = summary.conflicted_mixes.slice(0, 5)
        const more = summary.total_conflicted_mixes - shown.length
        lines.push(`  • ${summary.total_conflicted_mixes} mix${summary.total_conflicted_mixes === 1 ? '' : 'es'}:`)
        shown.forEach(c => {
          if (c.action === 'renamed') {
            lines.push(`    - "${c.old_name}" → "${c.new_name}" (renamed)`)
          } else {
            lines.push(`    - "${c.name}" (${c.action})`)
          }
        })
        if (more > 0) lines.push(`    ... and ${more} more`)
      }
      lines.push('')
    }

    lines.push('Reload the Style Mixer panel to see changes.')

    ;(app as any)?.toast?.add({
      severity: 'info',
      summary: 'Restore Summary',
      detail: lines.join('\n'),
      life: 6000,
    })
  }

  function makeUniqueName(baseName: string, usedNames: Set<string>): string {
    if (!usedNames.has(baseName)) return baseName
    let n = 1
    while (true) {
      const candidate = `${baseName} (${n})`
      if (!usedNames.has(candidate)) return candidate
      n += 1
    }
  }

  async function resolveSmallMixCollisionChoices(parsedData: any): Promise<{ data: any, duplicatePolicy: DuplicatePolicy }> {
    const existingResp = await fetch(API_URL)
    if (!existingResp.ok) throw new Error(`Could not check current data: HTTP ${existingResp.status}`)
    const existing = await existingResp.json()

    const styleNames = new Set<string>((existing.styles ?? []).map((s: any) => String(s?.name ?? '')))
    const mixNames = new Set<string>((existing.mixes ?? []).map((m: any) => String(m?.name ?? '')))

    const data = {
      ...parsedData,
      styles: (parsedData.styles ?? []).map((s: any) => ({ ...s })),
      mixes: (parsedData.mixes ?? []).map((m: any) => ({
        ...m,
        styles: Array.isArray(m?.styles) ? m.styles.map((entry: any) => ({ ...entry })) : [],
      })),
    }

    let hasReplaceChoice = false

    for (const style of data.styles) {
      const name = String(style?.name ?? '')
      if (!name) continue
      if (styleNames.has(name)) {
        const replace = window.confirm(
          `Style "${name}" already exists.\n\nPress OK to replace the existing style, or Cancel to import it as a renamed copy.`
        )
        if (replace) {
          hasReplaceChoice = true
        } else {
          style.name = makeUniqueName(name, styleNames)
        }
      }
      styleNames.add(String(style?.name ?? name))
    }

    for (const mix of data.mixes) {
      const name = String(mix?.name ?? '')
      if (!name) continue
      if (mixNames.has(name)) {
        const replace = window.confirm(
          `Mix "${name}" already exists.\n\nPress OK to replace the existing mix, or Cancel to import it as a renamed copy.`
        )
        if (replace) {
          hasReplaceChoice = true
        } else {
          mix.name = makeUniqueName(name, mixNames)
        }
      }
      mixNames.add(String(mix?.name ?? name))
    }

    return {
      data,
      duplicatePolicy: hasReplaceChoice ? 'replace' : 'rename',
    }
  }

  async function downloadBackup() {
    const resp = await fetch(API_URL)
    if (!resp.ok) { 
      ;(app as any)?.toast?.add({
        severity: 'error',
        summary: 'Backup Export Failed',
        detail: `HTTP ${resp.status}`,
        life: 4000,
      })
      return
    }
    const data = await resp.json()
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `style_mixer_backup_${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function downloadZip() {
    const a = document.createElement('a')
    a.href = '/immac_style_mixer/api/backup.zip'
    a.download = `style_mixer_backup_${new Date().toISOString().slice(0, 10)}.zip`
    a.click()
  }

  function restoreBackup(importMode: ImportMode, duplicatePolicy: DuplicatePolicy) {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json,.zip,application/json,application/zip'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return
      const isZip = file.name.endsWith('.zip') || file.type === 'application/zip'

      if (isZip) {
        // ZIP restore — send raw bytes to the server which handles extraction
        file.arrayBuffer().then(async (buf) => {
          try {
            let finalBuf = buf
            let finalDuplicatePolicy = duplicatePolicy
            let itemCount = 0

            const zip = await JSZip.loadAsync(buf)
            const dataFile = zip.file('style_mixer_data.json')
            if (dataFile) {
              const parsed = JSON.parse(await dataFile.async('string'))
              const styleCount = Array.isArray(parsed?.styles) ? parsed.styles.length : 0
              const mixCount = Array.isArray(parsed?.mixes) ? parsed.mixes.length : 0
              itemCount = styleCount + mixCount
              if (itemCount >= 5000) {
                const proceedLarge = window.confirm(
                  `This ZIP contains ${itemCount} items (styles + mixes). Import may be slow.\n\nDo you want to continue?`
                )
                if (!proceedLarge) return
              }
              if (importMode === 'merge') {
                const isSmallMixImport = Array.isArray(parsed?.mixes) && parsed.mixes.length === 1
                if (isSmallMixImport) {
                  const resolved = await resolveSmallMixCollisionChoices(parsed)
                  finalDuplicatePolicy = resolved.duplicatePolicy
                  zip.file('style_mixer_data.json', JSON.stringify(resolved.data, null, 2))
                  finalBuf = await zip.generateAsync({ type: 'arraybuffer' })
                }
              }
            }

            const callRestore = async (imageFailureAction: 'ask' | 'continue' | 'rollback') => {
              const params = new URLSearchParams({
                import_mode: importMode,
                duplicate_policy: finalDuplicatePolicy,
                image_failure_action: imageFailureAction,
              })
              return fetch(`/immac_style_mixer/api/restore.zip?${params.toString()}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/zip' },
                body: finalBuf,
              })
            }

            let resp = await callRestore('ask')
            if (resp.status === 409) {
              const problem = await resp.json()
              const failed = Number(problem.total_failed_images ?? 0)
              const continueImport = window.confirm(
                `${failed} image(s) failed to restore.\n\nPress OK to continue without those images, or Cancel to rollback.`
              )
              if (continueImport) {
                resp = await callRestore('continue')
              } else {
                const rollbackResp = await callRestore('rollback')
                if (!rollbackResp.ok) {
                  const rollbackText = await rollbackResp.text()
                  throw new Error(`Rollback failed: HTTP ${rollbackResp.status}: ${rollbackText.slice(0, 300)}`)
                }
                ;(app as any)?.toast?.add({
                  severity: 'info',
                  summary: 'Import Cancelled',
                  detail: 'Restore rolled back. No data changes were applied.',
                  life: 4000,
                })
                return
              }
            }

            if (!resp.ok) {
              const text = await resp.text()
              throw new Error(`HTTP ${resp.status}: ${text.slice(0, 300)}`)
            }
            const result = await resp.json()
            if (result.summary) {
              showRestoreConfirmation(result.summary, result.styles, result.mixes, result.images)
              showImportCleanupToast(result.summary, result.skipped_invalid_images)
              if ((result.failed_images ?? 0) > 0 || (result.skipped_invalid_images ?? 0) > 0) {
                const notes: string[] = []
                if ((result.failed_images ?? 0) > 0) notes.push(`${result.failed_images} failed images`)
                if ((result.skipped_invalid_images ?? 0) > 0) notes.push(`${result.skipped_invalid_images} invalid image paths skipped`)
                ;(app as any)?.toast?.add({
                  severity: 'warn',
                  summary: 'Restore Completed with Warnings',
                  detail: notes.join(', '),
                  life: 5000,
                })
              }
            } else {
              try {
                ;(app as any)?.toast?.add({
                  severity: 'success',
                  summary: 'Style Mixer',
                  detail: `ZIP restored: ${result.styles} styles, ${result.mixes} mixes, ${result.images} images. Reload the Style Mixer panel to see changes.`,
                  life: 6000,
                })
              } catch (_) {
                ;(app as any)?.toast?.add({
                  severity: 'success',
                  summary: 'ZIP Restored',
                  detail: `${result.styles} styles, ${result.mixes} mixes, ${result.images} images. Reload the Style Mixer panel to see changes.`,
                  life: 5000,
                })
              }
            }
          } catch (err) {
            ;(app as any)?.toast?.add({
              severity: 'error',
              summary: 'ZIP Restore Failed',
              detail: (err as Error).message,
              life: 5000,
            })
          }
        }).catch((err) => {
          ;(app as any)?.toast?.add({
            severity: 'error',
            summary: 'File Read Failed',
            detail: (err as Error).message,
            life: 4000,
          })
        })
      } else {
        // JSON restore
        const reader = new FileReader()
        reader.onload = async (ev) => {
          try {
            const parsed = JSON.parse(ev.target?.result as string)
            if (!Array.isArray(parsed.styles) || !Array.isArray(parsed.mixes)) {
              throw new Error('Invalid backup: missing styles or mixes arrays.')
            }

            const itemCount = parsed.styles.length + parsed.mixes.length
            if (itemCount >= 5000) {
              const proceedLarge = window.confirm(
                `This backup contains ${itemCount} items (styles + mixes). Import may be slow.\n\nDo you want to continue?`
              )
              if (!proceedLarge) return
            }

            let dataToImport = parsed
            let finalDuplicatePolicy = duplicatePolicy
            if (importMode === 'merge' && parsed.mixes.length === 1) {
              const resolved = await resolveSmallMixCollisionChoices(parsed)
              dataToImport = resolved.data
              finalDuplicatePolicy = resolved.duplicatePolicy
            }

            const resp = await fetch(API_URL, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                data: dataToImport,
                import_mode: importMode,
                duplicate_policy: finalDuplicatePolicy,
              }),
            })
            if (!resp.ok) throw new Error(`Save failed: HTTP ${resp.status}`)
            const result = await resp.json()
            if (result.summary) {
              showRestoreConfirmation(result.summary, result.styles, result.mixes)
              showImportCleanupToast(result.summary, result.skipped_invalid_images)
            } else {
              try {
                ;(app as any)?.toast?.add({
                  severity: 'success',
                  summary: 'Style Mixer',
                  detail: `Backup restored: ${result.styles ?? parsed.styles.length} styles, ${result.mixes ?? parsed.mixes.length} mixes. Reload the Style Mixer panel to see changes.`,
                  life: 6000,
                })
              } catch (_) {
                ;(app as any)?.toast?.add({
                  severity: 'success',
                  summary: 'Backup Restored',
                  detail: `${result.styles} styles, ${result.mixes} mixes. Reload the Style Mixer panel to see changes.`,
                  life: 5000,
                })
              }
            }
          } catch (err) {
            ;(app as any)?.toast?.add({
              severity: 'error',
              summary: 'Backup Restore Failed',
              detail: (err as Error).message,
              life: 5000,
            })
          }
        }
        reader.readAsText(file)
      }
    }
    input.click()
  }

  ;(app as any).registerExtension({
    name: 'ImmacStyleMixer',

    settings: [
      {
        id: 'ImmacStyleMixer.BackupRestore' as any,
        name: 'Style Mixer — Backup & Restore',
        type: (_name: string, _setter: (v: unknown) => void, _value: unknown) => {
          const row = document.createElement('div')
          row.style.cssText = 'display:flex;gap:8px;align-items:center'

          const importMode = document.createElement('select')
          importMode.style.cssText = 'padding:4px 8px;border-radius:4px'
          importMode.title = 'Import behavior'
          importMode.appendChild(new Option('Replace', 'replace'))
          importMode.appendChild(new Option('Merge', 'merge'))

          const duplicatePolicy = document.createElement('select')
          duplicatePolicy.style.cssText = 'padding:4px 8px;border-radius:4px'
          duplicatePolicy.title = 'When names collide during merge'
          duplicatePolicy.appendChild(new Option('Rename duplicates', 'rename'))
          duplicatePolicy.appendChild(new Option('Replace duplicates', 'replace'))
          duplicatePolicy.appendChild(new Option('Skip duplicates', 'skip'))
          duplicatePolicy.disabled = true

          importMode.onchange = () => {
            duplicatePolicy.disabled = importMode.value !== 'merge'
          }

          const dlBtn = document.createElement('button')
          dlBtn.textContent = '⬇ Download backup (JSON)'
          dlBtn.title = 'Save all styles and mixes to a JSON file'
          dlBtn.style.cssText = 'cursor:pointer;padding:4px 10px;border-radius:4px'
          dlBtn.onclick = () => downloadBackup().catch(console.error)

          const zipBtn = document.createElement('button')
          zipBtn.textContent = '⬇ Download ZIP (with images)'
          zipBtn.title = 'Save styles, mixes and all images to a ZIP file'
          zipBtn.style.cssText = 'cursor:pointer;padding:4px 10px;border-radius:4px'
          zipBtn.onclick = () => downloadZip()

          const ulBtn = document.createElement('button')
          ulBtn.textContent = '⬆ Restore (JSON or ZIP)'
          ulBtn.title = 'Restore from a JSON or ZIP backup — auto-detected. Use mode selectors for merge behavior.'
          ulBtn.style.cssText = 'cursor:pointer;padding:4px 10px;border-radius:4px'
          ulBtn.onclick = () => restoreBackup(
            importMode.value as ImportMode,
            duplicatePolicy.value as DuplicatePolicy
          )

          row.appendChild(dlBtn)
          row.appendChild(zipBtn)
          row.appendChild(importMode)
          row.appendChild(duplicatePolicy)
          row.appendChild(ulBtn)
          return row
        },
        defaultValue: null as any,
      },
    ],

    nodeCreated(node: any) {
      if (
        node.comfyClass !== 'PickMixImmacStyleMixer' &&
        node.comfyClass !== 'PickStyleImmacStyleMixer'
      ) return

      // ── shared DOM preview widget ────────────────────────────────────────────────────────────────────
      const isPickNode = node.comfyClass === 'PickStyleImmacStyleMixer'
      const widgetName = isPickNode ? 'style' : 'mix'

      const comboWidget = node.widgets?.find((w: any) => w.name === widgetName)
      if (!comboWidget) return

      const imgEl = document.createElement('img')
      imgEl.style.cssText = 'width:100%;height:100%;display:none;object-fit:contain;border-radius:4px'
      const container = document.createElement('div')
      container.style.cssText = 'padding:4px;box-sizing:border-box'
      container.appendChild(imgEl)

      // Use closure-based callbacks so computeLayoutSize always gets the
      // current height without any CSS variable timing/ordering issues.
      let previewHeight = 0
      node.addDOMWidget('immac_preview', 'div', container, {
        serialize: false,
        getMinHeight: () => previewHeight,
        getHeight: () => previewHeight,
      })

      function applyImageSize(natW: number, natH: number) {
        const nodeWidth: number = node.size?.[0] ?? 300
        const ratio = natH / natW
        previewHeight = Math.max(80, Math.min(Math.round((nodeWidth - 8) * ratio), 600))
        const s = node.computeSize?.()
        if (s) node.setSize([Math.max(node.size[0], s[0]), Math.max(node.size[1], s[1])])
        node.onResize?.(node.size)
        node.graph?.setDirtyCanvas(true, true)
      }

      function clearImageSize() {
        previewHeight = 0
        imgEl.style.display = 'none'
        node.graph?.setDirtyCanvas(true, true)
      }

      function showUrl(url: string) {
        imgEl.onload = () => {
          imgEl.style.display = 'block'
          applyImageSize(imgEl.naturalWidth, imgEl.naturalHeight)
        }
        imgEl.onerror = () => { clearImageSize() }
        imgEl.src = url
      }

      async function updatePreview(value: string) {
        try {
          const resp = await fetch('/immac_style_mixer/api/data')
          if (!resp.ok) return
          const data = await resp.json()

          if (isPickNode) {
            const style = (data.styles ?? []).find((s: any) => s.name === value)
            if (!style?.image_filename) { clearImageSize(); return }
            const bust = style.image_updated_at ? `&t=${style.image_updated_at}` : ''
            showUrl(`/view?filename=${encodeURIComponent(style.image_filename)}&subfolder=immac_style_mixer%2Fstyles&type=input${bust}`)
          } else {
            const mix = (data.mixes ?? []).find((m: any) => m.name === value)
            let url = ''
            if (mix?.image_filename) {
              const bust = mix.image_updated_at ? `&t=${mix.image_updated_at}` : ''
              url = `/view?filename=${encodeURIComponent(mix.image_filename)}&subfolder=immac_style_mixer%2Fmixes&type=input${bust}`
            } else if (mix?.styles?.length) {
              const stylesById = Object.fromEntries((data.styles ?? []).map((s: any) => [s.id, s]))
              const first = (mix.styles as any[])
                .filter((e) => e.enabled !== false)
                .map((e) => stylesById[e.style_id])
                .find((s) => s?.image_filename)
              if (first) {
                const bust = first.image_updated_at ? `&t=${first.image_updated_at}` : ''
                url = `/view?filename=${encodeURIComponent(first.image_filename)}&subfolder=immac_style_mixer%2Fstyles&type=input${bust}`
              }
            }
            if (!url) { clearImageSize(); return }
            showUrl(url)
          }
        } catch (e) {
          console.error('[ImmacStyleMixer] Preview update failed', e)
        }
      }

      const origCallback = comboWidget.callback
      comboWidget.callback = function (...args: any[]) {
        origCallback?.apply(this, args)
        // Always read the current widget value fresh from node.widgets
        const w = node.widgets?.find((w: any) => w.name === widgetName)
        updatePreview(String(w?.value ?? ''))
      }

      // Accept an explicit value so loadedGraphNode can pass the restored value
      // directly, avoiding any closure-staleness issue. Falls back to a fresh
      // widget lookup when called without an argument (e.g. from the callback).
      node._immacUpdatePreview = (explicitVal?: string) => {
        const w = node.widgets?.find((w: any) => w.name === widgetName)
        updatePreview(explicitVal ?? String(w?.value ?? ''))
      }

      // For freshly created nodes (not restores) loadedGraphNode is never called,
      // so we schedule a deferred first-paint here. We set a flag so that if
      // loadedGraphNode fires for this node (restore path) it can cancel this.
      // Mirror ComfyUI's own pattern (useImageUploadWidget.ts): use
      // requestAnimationFrame to defer past the synchronous graph configuration
      // so the canvas render loop is alive when setDirtyCanvas fires.
      node._immacPreviewScheduled = true
      requestAnimationFrame(() => {
        if (!node._immacPreviewScheduled) return
        const w = node.widgets?.find((w: any) => w.name === widgetName)
        if (w?.value) updatePreview(String(w.value))
      })
    },

    loadedGraphNode(node: any) {
      if (typeof node._immacUpdatePreview !== 'function') return

      node._immacPreviewScheduled = false

      const isPickNode = node.comfyClass === 'PickStyleImmacStyleMixer'
      const widgetName = isPickNode ? 'style' : 'mix'
      const comboWidget = node.widgets?.find((w: any) => w.name === widgetName)
      const currentVal = String(comboWidget?.value ?? '')

      requestAnimationFrame(() => {
        if (currentVal === '(no styles saved)' || currentVal === '(no mixes saved)') {
          fetch('/immac_style_mixer/api/data')
            .then((r) => r.json())
            .then((data) => {
              const items: any[] = isPickNode ? (data.styles ?? []) : (data.mixes ?? [])
              const w = node.widgets?.find((w: any) => w.name === widgetName)
              if (items.length > 0 && w) {
                w.value = items[0].name
                if (Array.isArray(w.options?.values)) {
                  w.options.values = items.map((i: any) => i.name)
                }
              }
              node._immacUpdatePreview()
            })
            .catch(() => node._immacUpdatePreview())
        } else {
          node._immacUpdatePreview(currentVal)
        }
      })
    },
  })

  // ── Refresh previews after a workflow finishes executing ─────────────────
  // We listen on `execution_success` (fires once per completed queue item)
  // via the directly-imported `api` singleton. Any run could have updated an
  // image_filename via SaveMix / CreateStyle / ModifyStyle, so we refresh all
  // PickMix and Pick Style node previews. The image_updated_at cache-buster
  // ensures the browser fetches the new file only when it actually changed.
  function refreshAllPreviews() {
    const nodes: any[] = (app as any).graph?._nodes ?? []
    for (const n of nodes) {
      if (typeof n._immacUpdatePreview === 'function') {
        n._immacUpdatePreview()
      }
    }
  }

  api.addEventListener('execution_success', () => {
    refreshAllPreviews()
    window.dispatchEvent(new CustomEvent('immac:execution_success'))
  })
}

init().catch(console.error)
