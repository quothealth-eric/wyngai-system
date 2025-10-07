import * as React from "react"

export interface LeadCaptureProps {
  isOpen?: boolean
  onClose?: () => void
  onSubmit?: (data: any) => void
}

export const LeadCapture: React.FC<LeadCaptureProps> = ({ isOpen, onClose, onSubmit }) => {
  if (!isOpen) return null
  
  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg p-6 max-w-md w-full">
        <h2 className="text-lg font-semibold mb-4">Lead Capture</h2>
        <button onClick={onClose} className="float-right text-gray-500 hover:text-gray-700">
          ×
        </button>
        <p>Lead capture form would go here</p>
      </div>
    </div>
  )
}

