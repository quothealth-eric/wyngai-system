import * as React from "react"

export const Logo = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      className={["font-bold text-xl text-blue-600", className].filter(Boolean).join(" ")}
      ref={ref}
      {...props}
    >
      Wyng Lite
    </div>
  )
)
Logo.displayName = "Logo"

