'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Upload, FileText, Loader2, CheckCircle, AlertCircle } from 'lucide-react'

interface ExplainerBullet {
  title: string
  text: string
}

interface ExplainerResult {
  bullets: ExplainerBullet[]
  citations: Array<{ authority: string; title: string }>
  link?: { text: string; url: string }
}

interface ExplainerLiteProps {
  threadId: string
  onComplete?: (result: ExplainerResult) => void
}

export function ExplainerLite({ threadId, onComplete }: ExplainerLiteProps) {
  const [mode, setMode] = useState<'text' | 'image' | 'pdf'>('text')
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ExplainerResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    if (mode === 'text' && !text.trim()) {
      setError('Please enter some text to explain')
      return
    }

    if ((mode === 'image' || mode === 'pdf') && !file) {
      setError('Please select a file to analyze')
      return
    }

    try {
      setLoading(true)
      setError(null)

      const formData = new FormData()
      formData.append('threadId', threadId)
      formData.append('mode', mode)

      if (mode === 'text') {
        formData.append('text', text)
      } else {
        formData.append('file', file!)
      }

      const response = await fetch('/api/explainer/lite', {
        method: 'POST',
        body: formData
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to generate explanation')
      }

      const explainerResult = {
        bullets: data.bullets,
        citations: data.citations,
        link: data.link
      }

      setResult(explainerResult)
      onComplete?.(explainerResult)

    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate explanation')
    } finally {
      setLoading(false)
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      setFile(selectedFile)
      setError(null)
    }
  }

  const reset = () => {
    setText('')
    setFile(null)
    setResult(null)
    setError(null)
    setMode('text')
  }

  if (result) {
    return (
      <Card className="w-full">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center space-x-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              <span>Quick Explanation</span>
            </CardTitle>
            <Button variant="outline" size="sm" onClick={reset}>
              Explain Another
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {result.bullets.map((bullet, index) => (
              <div key={index} className="border-l-4 border-primary pl-4">
                <h4 className="font-semibold text-gray-900">{bullet.title}</h4>
                <p className="text-gray-700 mt-1">{bullet.text}</p>
              </div>
            ))}

            {result.citations.length > 0 && (
              <>
                <Separator />
                <div>
                  <h5 className="font-medium text-gray-900 mb-2">Sources</h5>
                  <div className="flex flex-wrap gap-2">
                    {result.citations.map((citation, index) => (
                      <Badge key={index} variant="secondary">
                        {citation.authority}: {citation.title}
                      </Badge>
                    ))}
                  </div>
                </div>
              </>
            )}

            {result.link && (
              <>
                <Separator />
                <div>
                  <a
                    href={result.link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    {result.link.text} →
                  </a>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center space-x-2">
          <FileText className="h-5 w-5" />
          <span>Quick Explainer (Lite)</span>
        </CardTitle>
        <p className="text-sm text-gray-600">
          Get instant 3-bullet insights from billing text or documents
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Mode Selection */}
          <div className="flex space-x-2">
            <Button
              variant={mode === 'text' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setMode('text')}
            >
              Text Input
            </Button>
            <Button
              variant={mode === 'image' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setMode('image')}
            >
              Image
            </Button>
            <Button
              variant={mode === 'pdf' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setMode('pdf')}
            >
              PDF
            </Button>
          </div>

          {/* Input */}
          {mode === 'text' ? (
            <div>
              <Textarea
                placeholder="Paste billing text here (e.g., 'CPT 36415 venipuncture $72')"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={3}
                className="w-full"
              />
            </div>
          ) : (
            <div>
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                <Upload className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                <p className="text-sm text-gray-600 mb-2">
                  Upload {mode === 'image' ? 'an image' : 'a PDF'} of your bill or EOB
                </p>
                <input
                  type="file"
                  accept={mode === 'image' ? 'image/*' : '.pdf'}
                  onChange={handleFileChange}
                  className="hidden"
                  id="file-upload"
                />
                <label
                  htmlFor="file-upload"
                  className="inline-flex items-center justify-center rounded-md text-sm font-medium border border-gray-300 bg-background hover:bg-gray-50 h-10 px-4 py-2 cursor-pointer"
                >
                  Choose File
                </label>
                {file && (
                  <p className="text-sm text-gray-600 mt-2">
                    Selected: {file.name}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-center space-x-2 text-red-600">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm">{error}</span>
            </div>
          )}

          {/* Submit */}
          <Button
            onClick={handleSubmit}
            disabled={loading || (mode === 'text' && !text.trim()) || ((mode === 'image' || mode === 'pdf') && !file)}
            className="w-full"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {mode === 'text' ? 'Analyzing...' : 'Extracting & Analyzing...'}
              </>
            ) : (
              'Get Quick Explanation'
            )}
          </Button>

          <p className="text-xs text-gray-500 text-center">
            Fast insights in under 10 seconds. For detailed analysis, use the full analyzer.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}