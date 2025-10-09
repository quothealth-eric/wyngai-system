import * as React from "react"

export const Checkbox = React.forwardRef<HTMLInputElement, Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">>(
  ({ className, ...props }, ref) => (
    <input
      type="checkbox"
      className={["h-4 w-4 rounded border-gray-300 text-blue-600", className].filter(Boolean).join(" ")}
      ref={ref}
      {...props}
    />
  )
)
Checkbox.displayName = "Checkbox"

