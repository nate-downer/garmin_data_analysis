import { useState } from 'react'
import { gpxAPI, userSegmentsAPI } from '../../services/api'

interface UploadActivityModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

function UploadActivityModal({ isOpen, onClose, onSuccess }: UploadActivityModalProps) {
  const [file, setFile] = useState<File | null>(null)
  const [isPlanned, setIsPlanned] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      if (!selectedFile.name.toLowerCase().endsWith('.gpx')) {
        setError('Please select a .gpx file')
        setFile(null)
        return
      }
      setFile(selectedFile)
      setError(null)
    }
  }

  const handleUpload = async () => {
    if (!file) {
      setError('Please select a file')
      return
    }

    try {
      setUploading(true)
      setError(null)

      const result = await gpxAPI.upload(file, isPlanned)

      // Auto-generate segments for actual activities (not planned routes)
      if (!isPlanned) {
        try {
          const genResult = await userSegmentsAPI.generate(result.activity_id, false)
          // Success with auto-generation
          alert(`Activity uploaded! Generated ${genResult.segments_created} segments (${genResult.rest_segments} rest periods). Detected ${genResult.inactive_points}/${genResult.total_points} inactive points.`)
        } catch (segErr: any) {
          console.error('Segment generation failed:', segErr)
          alert('Activity uploaded successfully, but segment generation failed. You can generate segments manually.')
        }
      } else {
        alert('Planned route uploaded successfully!')
      }

      // Reset form and close
      setFile(null)
      setIsPlanned(false)
      onSuccess()
      onClose()
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to upload activity')
      console.error('Upload error:', err)
    } finally {
      setUploading(false)
    }
  }

  const handleClose = () => {
    if (!uploading) {
      setFile(null)
      setIsPlanned(false)
      setError(null)
      onClose()
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-900">Upload Activity</h2>
          <button
            onClick={handleClose}
            disabled={uploading}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="space-y-4">
          {/* File Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              GPX File
            </label>
            <input
              type="file"
              accept=".gpx"
              onChange={handleFileChange}
              disabled={uploading}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-accent-500 disabled:opacity-50"
            />
            {file && (
              <p className="mt-1 text-sm text-gray-600">
                Selected: {file.name}
              </p>
            )}
          </div>

          {/* Activity Type Radio Buttons */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Activity Type
            </label>
            <div className="space-y-2">
              <label className="flex items-center">
                <input
                  type="radio"
                  name="activityType"
                  checked={!isPlanned}
                  onChange={() => setIsPlanned(false)}
                  disabled={uploading}
                  className="mr-2 focus:ring-accent-500"
                />
                <span className="text-sm text-gray-700">Actual Activity</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  name="activityType"
                  checked={isPlanned}
                  onChange={() => setIsPlanned(true)}
                  disabled={uploading}
                  className="mr-2 focus:ring-accent-500"
                />
                <span className="text-sm text-gray-700">Planned Route</span>
              </label>
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-3">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex space-x-3 pt-2">
            <button
              onClick={handleClose}
              disabled={uploading}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleUpload}
              disabled={uploading || !file}
              className="flex-1 btn-primary disabled:opacity-50"
            >
              {uploading ? 'Uploading...' : 'Upload'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default UploadActivityModal
