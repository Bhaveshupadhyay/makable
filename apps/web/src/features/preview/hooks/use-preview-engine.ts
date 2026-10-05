import { useEffect, useRef, useState } from 'react'
import { isStaticProject, SandpackEngine } from '../engine/sandpack-engine'
import type { PreviewEngine, PreviewOptions, PreviewState, ProjectFiles } from '../engine/types'

/**
 * Mounts a preview engine into the returned iframe ref and keeps it in sync with `files`.
 * `options` are read once per mount.
 */
export function usePreviewEngine(files: ProjectFiles, options?: PreviewOptions) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const engineRef = useRef<PreviewEngine | null>(null)
  const filesRef = useRef(files)
  const optionsRef = useRef(options)
  const [state, setState] = useState<PreviewState>({ status: 'loading' })
  // Switching between a React and a static template needs a fresh engine.
  const isStatic = isStaticProject(files)

  // Runs before the mount effect so a remount (type switch) mounts the new files.
  useEffect(() => {
    filesRef.current = files
    engineRef.current?.update(files)
  }, [files])

  useEffect(() => {
    const engine = new SandpackEngine()
    engineRef.current = engine
    const unsubscribe = engine.subscribe(setState)
    engine.mount(iframeRef.current!, filesRef.current, optionsRef.current)
    return () => {
      unsubscribe()
      engine.destroy()
      engineRef.current = null
    }
  }, [isStatic])

  return {
    iframeRef,
    state,
    refresh: () => engineRef.current?.refresh(),
  }
}
