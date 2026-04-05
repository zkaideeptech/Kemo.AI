"use client";

export function KemoMark({ className = "" }: { className?: string }) {
  return (
    <svg 
      viewBox="0 0 512 512" 
      aria-hidden="true"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {/* 品牌主赛博绿渐变 */}
        <linearGradient id="kemoNeon" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#39FF14" />
          <stop offset="100%" stopColor="#086B00" />
        </linearGradient>

        {/* 亮色发光态渐变 */}
        <linearGradient id="kemoLight" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#39FF14" />
          <stop offset="100%" stopColor="#C2FFAB" />
        </linearGradient>
        
        {/* 发光滤镜 */}
        <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="8" result="blur" />
          <feComposite in="SourceGraphic" in2="blur" operator="over" />
        </filter>
      </defs>

      {/* 夜空深邃的背景底板 */}
      <rect width="512" height="512" fill="#040711" rx="100" />
      
      <g transform="translate(10, 0)">
        {/* 垂直主干 (K的左边) */}
        <rect x="150" y="130" width="45" height="252" rx="22.5" fill="url(#kemoNeon)" filter="url(#glow)"/>

        {/* 右上方的折角支脉 (K的右上方) */}
        <path d="M 215 260 L 325 145 C 335 134 350 134 360 145 L 370 155 C 380 165 380 180 370 190 L 255 305 Z" fill="url(#kemoNeon)" />

        {/* 右下方的折角支脉 (K的右下方) */}
        <path d="M 205 240 L 350 375 C 360 385 360 400 350 410 L 340 420 C 330 430 315 430 305 420 L 165 285 Z" fill="url(#kemoLight)" filter="url(#glow)" />

        {/* 象征AI与神经网络计算的节点圆点 */}
        <circle cx="365" cy="140" r="16" fill="#ffffff" filter="url(#glow)" />
        <circle cx="330" cy="400" r="12" fill="#39FF14" filter="url(#glow)"/>
        <circle cx="172.5" cy="100" r="12" fill="#39FF14" filter="url(#glow)"/>
      </g>
    </svg>
  );
}
