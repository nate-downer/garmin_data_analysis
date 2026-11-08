import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import UploadActivityModal from '../activity/UploadActivityModal'
import { useAuth } from '../../context/AuthContext'

interface HeaderProps {
  onActivityUploaded?: () => void
}

const NAV_ITEMS = [
  { label: 'Edit Activities', path: '/app' },
  { label: 'View Analysis', path: '/analysis' },
  { label: 'Build Models', path: '/build-model' },
  { label: 'Plan Routes', path: '/plan-routes' },
]

const CONTACT_EMAIL = 'iinn.nate.down@gmail.com'

function Header({ onActivityUploaded }: HeaderProps) {
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const { isAdmin, logout } = useAuth()

  const handleLogout = async () => {
    await logout()
    navigate('/')
  }

  const handleCopyEmail = async () => {
    await navigator.clipboard.writeText(CONTACT_EMAIL)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleUploadSuccess = ({ activityId, isPlanned }: { activityId: string; isPlanned: boolean }) => {
    if (onActivityUploaded) {
      onActivityUploaded()
    }
    navigate(isPlanned ? '/plan-routes' : '/app', { state: { selectedActivityId: activityId } })
  }

  return (
    <>
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <button className="text-left cursor-pointer" onClick={() => navigate('/')}>
              <h1 className="text-3xl font-bold text-gray-900">Mountain G.O.A.T.</h1>
              <p className="mt-1 text-sm text-gray-500">Generative Outdoor Activity Tracker</p>
            </button>

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
              {isAdmin && (
                <button className="btn-nav" onClick={handleLogout}>
                  Log Out
                </button>
              )}
            </div>
          </div>
        </div>
      </header>

      {!isAdmin && (
        <div className="bg-accent-600 text-white text-sm py-2">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
            <span>You are in Viewer Mode, some functionality is disabled.</span>
            <span className="flex items-center gap-2 flex-shrink-0">
              For a full demo contact Nate Downer
              <button
                onClick={handleCopyEmail}
                className="px-2 py-0.5 bg-white text-accent-600 rounded font-medium hover:bg-gray-100"
              >
                {copied ? 'Email Copied' : 'Contact'}
              </button>
            </span>
          </div>
        </div>
      )}

      <UploadActivityModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onSuccess={handleUploadSuccess}
      />
    </>
  )
}

export default Header
