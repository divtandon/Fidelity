type LogoMarkProps = { className?: string };

export function LogoMark({ className }: LogoMarkProps) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="18" cy="18" r="16.25" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8.5 18h19" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M13.2 10.2v15.6M22.8 10.2v15.6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="18" cy="18" r="3.25" fill="currentColor" />
      <path d="m26.8 13.2 3.4-2M5.8 24.8l3.4-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}
