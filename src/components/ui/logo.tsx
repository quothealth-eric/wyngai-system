import * as React from "react"

export const Logo = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      className={["flex items-center gap-2", className].filter(Boolean).join(" ")}
      ref={ref}
      {...props}
    >
      {/* Butterfly Logo SVG */}
      <svg
        width="32"
        height="32"
        viewBox="0 0 200 200"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="flex-shrink-0"
      >
        {/* Dark circle (head) */}
        <circle cx="100" cy="60" r="20" fill="#1e3a8a" />

        {/* Left wing - gradient teal to green */}
        <defs>
          <linearGradient id="wing-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#29CC96" />
            <stop offset="50%" stopColor="#40E0D0" />
            <stop offset="100%" stopColor="#20B2AA" />
          </linearGradient>
        </defs>

        {/* Upper left wing */}
        <path
          d="M80 80 Q30 60 20 120 Q30 150 80 140 Q90 120 80 80"
          fill="url(#wing-gradient)"
          opacity="0.9"
        />

        {/* Lower left wing */}
        <path
          d="M80 120 Q40 140 30 180 Q40 210 80 200 Q90 180 80 120"
          fill="url(#wing-gradient)"
          opacity="0.8"
        />

        {/* Upper right wing */}
        <path
          d="M120 80 Q170 60 180 120 Q170 150 120 140 Q110 120 120 80"
          fill="url(#wing-gradient)"
          opacity="0.9"
        />

        {/* Lower right wing */}
        <path
          d="M120 120 Q160 140 170 180 Q160 210 120 200 Q110 180 120 120"
          fill="url(#wing-gradient)"
          opacity="0.8"
        />

        {/* Body */}
        <ellipse cx="100" cy="130" rx="6" ry="50" fill="#1e3a8a" />
      </svg>
    </div>
  )
)
Logo.displayName = "Logo"

