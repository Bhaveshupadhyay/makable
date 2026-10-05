import type { TemplateMeta } from '@makable/shared'

const FONTS: Record<TemplateMeta['thumbnail']['font'], string> = {
  sans: 'ui-sans-serif, system-ui, sans-serif',
  mono: 'ui-monospace, monospace',
  serif: 'Georgia, serif',
}

/** A tiny mock of the template's layout in its colors. Stands in for real screenshots. */
export function TemplateThumbnail({ thumbnail: t }: { thumbnail: TemplateMeta['thumbnail'] }) {
  const line = (width: string, color = t.foreground, opacity = 0.25) => (
    <div className="h-1.5 rounded-full" style={{ width, background: color, opacity }} />
  )
  const card = <div className="h-6 rounded-sm border" style={{ borderColor: `${t.foreground}22`, background: `${t.foreground}08` }} />

  return (
    <div
      aria-hidden="true"
      className="flex aspect-video w-full gap-3 overflow-hidden rounded-md border p-3"
      style={{ background: t.background, color: t.foreground, fontFamily: FONTS[t.font] }}
    >
      {t.layout === 'columns' && (
        <div className="flex w-1/3 flex-col gap-1.5 border-r pr-2" style={{ borderColor: `${t.foreground}22` }}>
          <div className="size-5 rounded-full" style={{ background: t.accent, opacity: 0.7 }} />
          <span className="text-[9px] leading-none font-semibold">Aa</span>
          {line('80%', t.accent, 0.7)}
          {line('60%')}
        </div>
      )}
      <div className="flex flex-1 flex-col gap-1.5">
        {t.layout !== 'columns' && (
          <>
            <span className="text-[11px] leading-none font-bold">Aa</span>
            {line('55%', t.accent, 0.8)}
          </>
        )}
        {line('90%')}
        {line('70%')}
        <div className={t.layout === 'grid' ? 'mt-auto grid grid-cols-3 gap-1' : 'mt-auto grid grid-cols-2 gap-1'}>
          {card}
          {card}
          {t.layout === 'grid' && card}
        </div>
      </div>
    </div>
  )
}
