interface Toast {
  id: number
  text: string
}

interface Props {
  toasts: Toast[]
}

export function ToastStack({ toasts }: Props) {
  if (toasts.length === 0) {
    return null
  }
  return (
    <div
      className="pointer-events-none fixed bottom-6 right-6 z-50 flex max-w-sm flex-col gap-2"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="pointer-events-auto rounded-lg border border-sky-800/80 bg-slate-900/95 px-4 py-2 text-sm text-sky-100 shadow-lg shadow-black/40"
        >
          {t.text}
        </div>
      ))}
    </div>
  )
}
