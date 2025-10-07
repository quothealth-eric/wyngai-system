import * as React from "react"

export const Card = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      className={["rounded-lg border bg-white shadow-sm", className].filter(Boolean).join(" ")}
      ref={ref}
      {...props}
    />
  )
)
Card.displayName = "Card"

export const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      className={["p-6 pt-0", className].filter(Boolean).join(" ")}
      ref={ref}
      {...props}
    />
  )
)
CardContent.displayName = "CardContent"

