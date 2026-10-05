import type { Portfolio } from '@makable/shared'
import { useMemo } from 'react'
import { buildProjectFiles, PreviewPane, usePreviewEngine } from '@/features/preview'
import { EDIT_SHIM, useVisualEdit, VisualEditBanner, VisualEditControls } from '@/features/visual-edit'

type BuilderPreviewProps = {
  portfolio: Portfolio
  onChange: (portfolio: Portfolio) => void
}

/** Live preview of the portfolio with click-to-edit text. */
export function BuilderPreview({ portfolio, onChange }: BuilderPreviewProps) {
  const files = useMemo(() => buildProjectFiles(portfolio), [portfolio])
  const preview = usePreviewEngine(files, { injectedScript: EDIT_SHIM })
  const edit = useVisualEdit({ iframeRef: preview.iframeRef, portfolio, onChange })

  return (
    <PreviewPane preview={preview} actions={<VisualEditControls edit={edit} />} banner={<VisualEditBanner edit={edit} />} />
  )
}
