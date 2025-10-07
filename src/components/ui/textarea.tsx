import * as React from "react"

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      className={["flex min-h-[80px] w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm", className].filter(Boolean).join(" ")}
      ref={ref}
      {...props}
    />
  )
)
Textarea.displayName = "Textarea"

