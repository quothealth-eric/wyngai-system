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

export const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      className={["flex flex-col space-y-1.5 p-6", className].filter(Boolean).join(" ")}
      ref={ref}
      {...props}
    />
  )
)
CardHeader.displayName = "CardHeader"

export const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3
      className={["text-2xl font-semibold leading-none tracking-tight", className].filter(Boolean).join(" ")}
      ref={ref}
      {...props}
    />
  )
)
CardTitle.displayName = "CardTitle"

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

export const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={["text-sm text-muted-foreground", className].filter(Boolean).join(" ")}
    {...props}
  />
))
CardDescription.displayName = "CardDescription"

