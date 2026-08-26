import { useEffect, type PropsWithChildren } from 'react'

interface ModalProps {
  title: string
  onClose: () => void
}

export function Modal({ title, onClose, children }: PropsWithChildren<ModalProps>) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/80 p-0 backdrop-blur-sm sm:items-center sm:p-6"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose()
      }}
    >
      <section
        aria-modal="true"
        role="dialog"
        aria-labelledby="modal-title"
        className="max-h-[90svh] w-full overflow-y-auto rounded-t-3xl border border-slate-700 bg-slate-900 p-5 shadow-2xl sm:max-w-lg sm:rounded-3xl sm:p-6"
      >
        <div className="mb-5 flex items-center justify-between">
          <h2 id="modal-title" className="text-xl font-bold text-white">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex size-11 items-center justify-center rounded-full text-xl text-slate-400 hover:bg-slate-800 hover:text-white"
            aria-label="Close dialog"
          >
            ×
          </button>
        </div>
        {children}
      </section>
    </div>
  )
}
