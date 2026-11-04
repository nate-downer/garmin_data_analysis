import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import UploadActivityModal from '../activity/UploadActivityModal'

interface HeaderProps {
  onActivityUploaded?: () => void
}

const NAV_ITEMS = [
  { label: 'Edit Activities', path: '/' },
  { label: 'View Analysis', path: '/analysis' },
  { label: 'Build Models', path: '/build-model' },
  { label: 'Plan Routes', path: '/plan-routes' },
]

function Header({ onActivityUploaded }: HeaderProps) {
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  const handleUploadSuccess = ({ activityId, isPlanned }: { activityId: string; isPlanned: boolean }) => {
    if (onActivityUploaded) {
      onActivityUploaded()
    }
    navigate(isPlanned ? '/plan-routes' : '/', { state: { selectedActivityId: activityId } })
  }

  return (
    <>
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Mountain G.O.A.T.</h1>
              <p className="mt-1 text-sm text-gray-500">Generative Outdoor Activity Tracker</p>
            </div>

            {/* Action Buttons */}
            <div className="flex space-x-4">
              <button
                className="btn-primary"
                onClick={() => setIsUploadModalOpen(true)}
              >
                Add Activity
              </button>
              {NAV_ITEMS.map((item) => (
                <button
                  key={item.path}
                  className={location.pathname === item.path ? 'btn-nav-active' : 'btn-nav'}
                  onClick={() => navigate(item.path)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      <UploadActivityModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onSuccess={handleUploadSuccess}
      />
    </>
  )
}

export default Header
