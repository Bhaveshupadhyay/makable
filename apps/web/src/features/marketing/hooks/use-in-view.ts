import { type RefObject, useEffect, useState } from 'react'

/** True once the element has scrolled into view; stays true so entrance animations run once. */
export function useInView(ref: RefObject<Element | null>, threshold = 0.25) {
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || inView) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) setInView(true)
      },
      { threshold },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref, threshold, inView])
  return inView
}
