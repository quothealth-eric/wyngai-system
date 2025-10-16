'use client'

import { useState } from 'react'

export function MigrationButton() {
  const [isRunning, setIsRunning] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  const runMigration = async () => {
    setIsRunning(true)
    setError(null)
    setResult(null)

    try {
      const response = await fetch('/api/admin/migrate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      })

      const data = await response.json()

      if (response.ok) {
        setResult(data)
      } else {
        setError(data.error || 'Migration failed')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <div className="p-4 border rounded-lg bg-gray-50">
      <h3 className="text-lg font-semibold mb-2">Database Migration</h3>
      <p className="text-sm text-gray-600 mb-4">
        Run this once to create the missing case_reports table and indexes.
      </p>

      <button
        onClick={runMigration}
        disabled={isRunning}
        className={`px-4 py-2 rounded text-white font-medium ${
          isRunning
            ? 'bg-gray-400 cursor-not-allowed'
            : 'bg-blue-600 hover:bg-blue-700'
        }`}
      >
        {isRunning ? 'Running Migration...' : 'Run Database Migration'}
      </button>

      {result && (
        <div className="mt-4 p-3 bg-green-100 border border-green-400 rounded">
          <h4 className="font-semibold text-green-800">Migration Successful!</h4>
          <pre className="text-sm text-green-700 mt-2">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}

      {error && (
        <div className="mt-4 p-3 bg-red-100 border border-red-400 rounded">
          <h4 className="font-semibold text-red-800">Migration Failed</h4>
          <p className="text-sm text-red-700 mt-2">{error}</p>
          <p className="text-xs text-red-600 mt-2">
            If this fails, you may need to manually run the SQL from
            supabase/migrations/001_admin_workbench_schema.sql in your Supabase dashboard.
          </p>
        </div>
      )}
    </div>
  )
}