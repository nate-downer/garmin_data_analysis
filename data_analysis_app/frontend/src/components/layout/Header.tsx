function Header() {
  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Garmin Data Analysis</h1>
            <p className="mt-1 text-sm text-gray-500">GPS Trace Viewer & Editor</p>
          </div>

          {/* Action Buttons */}
          <div className="flex space-x-4">
            <button className="btn-primary">
              Add Activities
            </button>
            <button className="btn-secondary">
              View Analysis
            </button>
            <button className="btn-secondary">
              Build Model
            </button>
            <button className="btn-secondary">
              Plan Activity
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}

export default Header
