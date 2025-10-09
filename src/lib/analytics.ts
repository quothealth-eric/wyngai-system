// Temporary analytics fallback
export const trackEvent = (event: string, data?: any) => {
  console.log('Analytics:', event, data)
}