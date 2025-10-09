'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

export function EOBAnalyzer() {
  return (
    <div className="container mx-auto p-6">
      <Card>
        <CardContent className="p-8 text-center">
          <h1 className="text-2xl font-bold mb-4">Medical Bill Analyzer</h1>
          <p className="text-gray-600 mb-6">
            Our dual-vendor OCR consensus system is being deployed. This will provide enhanced accuracy for medical bill analysis.
          </p>
          <Button onClick={() => window.location.href = '/'}>
            Return to Home
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}