import * as React from "react"

export interface InsuranceModalProps {
  isOpen?: boolean
  onClose?: () => void
  children?: React.ReactNode
}

export const InsuranceModal: React.FC<InsuranceModalProps> = ({ isOpen, onClose, children }) => {
  if (!isOpen) return null
  
  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg p-6 max-w-md w-full">
        <button onClick={onClose} className="float-right text-gray-500 hover:text-gray-700">
          ×
        </button>
        {children}
      </div>
    </div>
  )
}

