import * as React from "react"
import { useState } from "react"

export interface EmailCaptureProps {
  onSubmit?: (email: string) => void
}

export const EmailCapture: React.FC<EmailCaptureProps> = ({ onSubmit }) => {
  const [email, setEmail] = useState("")
  
  return (
    <div className="p-4 bg-gray-50 rounded-lg">
      <h3 className="text-lg font-semibold mb-2">Email Capture</h3>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Enter your email"
        className="w-full p-2 border rounded mb-2"
      />
      <button
        onClick={() => onSubmit?.(email)}
        className="w-full bg-blue-600 text-white p-2 rounded hover:bg-blue-700"
      >
        Submit
      </button>
    </div>
  )
}

export const useEmailCapture = () => {
  const [hasEmail, setHasEmail] = useState(false)
  const [userEmail, setUserEmail] = useState("")
  
  const handleEmailSubmit = (email: string) => {
    setUserEmail(email)
    setHasEmail(true)
  }
  
  return {
    hasEmail,
    userEmail,
    handleEmailSubmit
  }
}

