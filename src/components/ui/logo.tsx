interface LogoProps {
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

export function Logo({ className = '', size = 'md' }: LogoProps) {
  const sizeClasses = {
    sm: 'h-6 w-auto',
    md: 'h-8 w-auto',
    lg: 'h-12 w-auto'
  }

  return (
    <img
      src="/images/wyng-logo.png"
      alt="Wyng"
      className={`${sizeClasses[size]} ${className}`}
    />
  )
}