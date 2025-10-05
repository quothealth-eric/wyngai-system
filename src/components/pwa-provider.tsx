'use client'

import { useEffect } from 'react'

export function PWAProvider() {
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      // Register service worker
      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          console.log('SW registered:', registration)

          // Handle updates
          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing
            if (newWorker) {
              newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                  // New content is available
                  console.log('New content available, reload to update')

                  // You could show a user notification here
                  if (confirm('A new version is available. Reload to update?')) {
                    window.location.reload()
                  }
                }
              })
            }
          })
        })
        .catch((error) => {
          console.error('SW registration failed:', error)
        })

      // Handle app install prompt
      let deferredPrompt: any = null

      window.addEventListener('beforeinstallprompt', (e) => {
        console.log('Install prompt available')
        e.preventDefault()
        deferredPrompt = e

        // You could show a custom install button here
        showInstallButton()
      })

      window.addEventListener('appinstalled', () => {
        console.log('App installed successfully')
        deferredPrompt = null
        hideInstallButton()
      })

      const showInstallButton = () => {
        // Create and show install button
        const installButton = document.createElement('button')
        installButton.id = 'install-button'
        installButton.textContent = 'Install Wyng Lite'
        installButton.style.cssText = `
          position: fixed;
          bottom: 20px;
          right: 20px;
          background: #3b82f6;
          color: white;
          padding: 12px 20px;
          border: none;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
          box-shadow: 0 4px 12px rgba(59, 130, 246, 0.3);
          z-index: 1000;
          font-family: inherit;
        `

        installButton.addEventListener('click', async () => {
          if (deferredPrompt) {
            deferredPrompt.prompt()
            const { outcome } = await deferredPrompt.userChoice
            console.log('Install prompt outcome:', outcome)
            deferredPrompt = null
            hideInstallButton()
          }
        })

        // Only show if not already added
        if (!document.getElementById('install-button')) {
          document.body.appendChild(installButton)
        }
      }

      const hideInstallButton = () => {
        const button = document.getElementById('install-button')
        if (button) {
          button.remove()
        }
      }

      // Check if already installed
      if (window.matchMedia('(display-mode: standalone)').matches) {
        console.log('App is running in standalone mode')
      }
    }
  }, [])

  return null
}