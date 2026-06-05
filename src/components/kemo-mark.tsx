"use client";

export function KemoMark({ className = "" }: { className?: string }) {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 512 512"
      aria-hidden="true"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="kemoInk" x1="72" y1="64" x2="440" y2="448" gradientUnits="userSpaceOnUse">
          <stop stopColor="#000610" />
          <stop offset="1" stopColor="#000320" />
        </linearGradient>
        <linearGradient id="kemoSignal" x1="130" y1="126" x2="395" y2="394" gradientUnits="userSpaceOnUse">
          <stop stopColor="#4FACFF" />
          <stop offset="0.48" stopColor="#3838FF" />
          <stop offset="1" stopColor="#001361" />
        </linearGradient>
        <filter id="kemoSoftSignal" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>
      <rect width="512" height="512" rx="96" fill="url(#kemoInk)" />
      <path d="M116 132C116 112.1 132.1 96 152 96H356C375.9 96 392 112.1 392 132V384C392 403.9 375.9 420 356 420H152C132.1 420 116 403.9 116 384V132Z" fill="#F8F9FA" fillOpacity="0.06" />
      <path d="M170 132H226V245L326 132H394L281 257L404 388H330L226 272V388H170V132Z" fill="url(#kemoSignal)" filter="url(#kemoSoftSignal)" />
      <path d="M226 245L326 132H394L281 257L404 388H330L226 272V245Z" fill="#4FACFF" fillOpacity="0.28" />
      <path d="M140 140H188V388H140V140Z" fill="#F8F9FA" fillOpacity="0.88" />
      <circle cx="392" cy="132" r="15" fill="#4FACFF" />
      <circle cx="404" cy="388" r="12" fill="#10B981" />
      <circle cx="140" cy="140" r="10" fill="#F8F9FA" />
      <path d="M114 448H398" stroke="#4FACFF" strokeWidth="10" strokeLinecap="round" strokeOpacity="0.24" />
    </svg>
  );
}
