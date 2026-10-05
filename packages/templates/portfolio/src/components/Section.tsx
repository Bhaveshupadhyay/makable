import type { ReactNode } from 'react'

export function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="space-y-6">
      <h2 className="text-sm font-semibold tracking-widest text-(--muted) uppercase">{title}</h2>
      {children}
    </section>
  )
}
