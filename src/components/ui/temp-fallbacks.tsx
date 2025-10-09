// Temporary UI component fallbacks for build compatibility

export const Button = ({ children, onClick, disabled, className, variant, size, ...props }: any) =>
  <button
    onClick={onClick}
    disabled={disabled}
    className={`px-4 py-2 rounded font-medium ${
      variant === 'outline' ? 'border border-gray-300' : 'bg-blue-600 text-white'
    } ${disabled ? 'opacity-50' : ''} ${className}`}
    {...props}
  >
    {children}
  </button>

export const Input = ({ value, onChange, placeholder, className, type = 'text', ...props }: any) =>
  <input
    type={type}
    value={value}
    onChange={onChange}
    placeholder={placeholder}
    className={`border rounded p-2 w-full ${className}`}
    {...props}
  />

export const Label = ({ children, className, ...props }: any) =>
  <label className={`block text-sm font-medium ${className}`} {...props}>{children}</label>

export const Textarea = ({ value, onChange, placeholder, className, ...props }: any) =>
  <textarea
    value={value}
    onChange={onChange}
    placeholder={placeholder}
    className={`border rounded p-2 w-full ${className}`}
    {...props}
  />

export const Checkbox = ({ checked, onChange, className, ...props }: any) =>
  <input type="checkbox" checked={checked} onChange={onChange} className={className} {...props} />

export const Card = ({ children, className, ...props }: any) =>
  <div className={`border rounded-lg shadow-sm ${className}`} {...props}>{children}</div>

export const CardContent = ({ children, className, ...props }: any) =>
  <div className={`p-6 ${className}`} {...props}>{children}</div>

export const CardHeader = ({ children, className, ...props }: any) =>
  <div className={`p-6 pb-2 ${className}`} {...props}>{children}</div>

export const CardTitle = ({ children, className, ...props }: any) =>
  <h3 className={`text-lg font-semibold ${className}`} {...props}>{children}</h3>

export const CardDescription = ({ children, className, ...props }: any) =>
  <p className={`text-sm text-gray-600 ${className}`} {...props}>{children}</p>

export const ScrollArea = ({ children, className, ...props }: any) =>
  <div className={`overflow-auto ${className}`} {...props}>{children}</div>

export const Progress = ({ value, className, ...props }: any) =>
  <div className={`w-full bg-gray-200 rounded-full h-2 ${className}`} {...props}>
    <div
      className="bg-blue-600 h-2 rounded-full"
      style={{ width: `${value || 0}%` }}
    />
  </div>

// Accordion components
export const Accordion = ({ children, className, ...props }: any) =>
  <div className={className} {...props}>{children}</div>

export const AccordionItem = ({ children, className, ...props }: any) =>
  <div className={`border-b ${className}`} {...props}>{children}</div>

export const AccordionTrigger = ({ children, className, ...props }: any) =>
  <button className={`w-full text-left p-4 hover:bg-gray-50 ${className}`} {...props}>
    {children}
  </button>

export const AccordionContent = ({ children, className, ...props }: any) =>
  <div className={`p-4 pt-0 ${className}`} {...props}>{children}</div>

export const Logo = ({ className, ...props }: any) =>
  <div className={`font-bold text-xl text-blue-600 ${className}`} {...props}>Wyng</div>

// Dialog components
export const Dialog = ({ children, open, onOpenChange, ...props }: any) =>
  open ? <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => onOpenChange?.(false)}>{children}</div> : null

export const DialogContent = ({ children, className, ...props }: any) =>
  <div className={`bg-white rounded-lg p-6 max-w-md mx-4 ${className}`} onClick={e => e.stopPropagation()} {...props}>
    {children}
  </div>

export const DialogHeader = ({ children, className, ...props }: any) =>
  <div className={`mb-4 ${className}`} {...props}>{children}</div>

export const DialogTitle = ({ children, className, ...props }: any) =>
  <h2 className={`text-lg font-semibold ${className}`} {...props}>{children}</h2>

export const DialogDescription = ({ children, className, ...props }: any) =>
  <p className={`text-sm text-gray-600 ${className}`} {...props}>{children}</p>

// Select components
export const Select = ({ children, value, onValueChange, ...props }: any) =>
  <div className="relative" {...props}>{children}</div>

export const SelectTrigger = ({ children, className, ...props }: any) =>
  <button className={`border rounded p-2 w-full text-left ${className}`} {...props}>
    {children}
  </button>

export const SelectContent = ({ children, className, ...props }: any) =>
  <div className={`absolute top-full left-0 right-0 border rounded bg-white shadow-lg z-10 ${className}`} {...props}>
    {children}
  </div>

export const SelectItem = ({ children, value, className, ...props }: any) =>
  <div className={`p-2 hover:bg-gray-50 cursor-pointer ${className}`} {...props}>
    {children}
  </div>

export const SelectValue = ({ placeholder, className, ...props }: any) =>
  <span className={`text-gray-500 ${className}`} {...props}>{placeholder}</span>