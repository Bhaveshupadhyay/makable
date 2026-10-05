/** Repo-relative path (e.g. `src/App.tsx`) → file contents. */
export type ProjectFiles = Record<string, string>

export type PreviewError = {
  title: string
  message: string
  path?: string
  line?: number
}

export type PreviewOptions = {
  /**
   * Plain JS that runs in the preview page next to the app, without changing
   * the project's own files (e.g. the visual-edit shim).
   */
  injectedScript?: string
}

export type PreviewState = { status: 'loading' } | { status: 'ready' } | { status: 'error'; error: PreviewError }

/**
 * Renders a project in an iframe without deploying it. Sandpack is the only
 * implementation today; this seam keeps a swap to WebContainers or an
 * esbuild-wasm bundler cheap.
 */
export interface PreviewEngine {
  mount(iframe: HTMLIFrameElement, files: ProjectFiles, options?: PreviewOptions): void
  /**
   * Replace the whole file set. Unchanged files are skipped. Callers remount
   * instead when the project type changes (React ↔ static), since that changes
   * the engine's setup.
   */
  update(files: ProjectFiles): void
  /** Patch one file, e.g. from an agent `file-diff` event. */
  updateFile(path: string, code: string): void
  refresh(): void
  subscribe(listener: (state: PreviewState) => void): () => void
  destroy(): void
}
