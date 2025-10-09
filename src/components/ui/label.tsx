import * as React from "react"

export const Label = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => (
    <label
      className={["text-sm font-medium leading-none", className].filter(Boolean).join(" ")}
      ref={ref}
      {...props}
    />
  )
)
Label.displayName = "Label"

