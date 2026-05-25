type Props = { className?: string; withWordmark?: boolean };

export function Logo({ className = "h-6 w-6", withWordmark = false }: Props) {
  return (
    <div className="flex items-center gap-2">
      <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
        {/* Stylized sieve / wheat — minimal geometric */}
        <path d="M4 8h16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M6 8l1.2 5a3 3 0 0 0 2.95 2.4h3.7A3 3 0 0 0 16.8 13L18 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="9" cy="11" r="0.9" fill="currentColor" />
        <circle cx="12" cy="12" r="0.9" fill="currentColor" />
        <circle cx="15" cy="11" r="0.9" fill="currentColor" />
        <path d="M12 15.5V21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M10 21h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      {withWordmark && (
        <span className="font-display text-[1.35rem] leading-none tracking-tight">Chaff</span>
      )}
    </div>
  );
}
