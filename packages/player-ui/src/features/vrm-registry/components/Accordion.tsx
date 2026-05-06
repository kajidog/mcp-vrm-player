import { ChevronDownIcon } from '~/icons'

interface AccordionProps {
  title: string
  open: boolean
  onToggle: () => void
  children: React.ReactNode
  badge?: React.ReactNode
}

export function Accordion({ title, open, onToggle, children, badge }: AccordionProps) {
  return (
    <div className="overflow-hidden rounded-xl border border-[var(--ui-border)] bg-[var(--ui-surface)]">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-[var(--ui-tag-bg)]"
      >
        <span className="flex items-center gap-2 text-xs font-semibold text-[var(--ui-text)]">
          {title}
          {badge}
        </span>
        <span
          className={`flex h-5 w-5 items-center justify-center text-[var(--ui-text-secondary)] transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        >
          <ChevronDownIcon />
        </span>
      </button>
      {open ? <div className="border-t border-[var(--ui-border)] p-3">{children}</div> : null}
    </div>
  )
}
