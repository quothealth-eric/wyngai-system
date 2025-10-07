import * as React from "react"

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      className={["flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm", className].filter(Boolean).join(" ")}
      ref={ref}
      {...props}
    />
  )
)
Input.displayName = "Input"

