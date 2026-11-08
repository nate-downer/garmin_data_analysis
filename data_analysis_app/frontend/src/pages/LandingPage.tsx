import { useNavigate } from 'react-router-dom'

interface Feature {
  title: string
  image: string
  body: string[]
  cta?: { label: string; path: string }
}

const FEATURES: Feature[] = [
  {
    title: 'Create Plans Based on Real GPS Traces',
    image: 'planned_routes_01.png',
    body: [
      'Evaluates real GPS traces from past climbs. User can upload data from any past activity, and use it to generate a custom prediction based on their own data.',
    ],
    cta: { label: 'Plan Routes', path: '/plan-routes' },
  },
  {
    title: 'Generate Predicted Activity Times',
    image: 'time_prediction_01.png',
    body: [
      "Simulates a range of possible route times based on the user's real activity data. Outputs highlight how likely the user is to summit in a safe window, and get back before dark (based on a selected start date and time).",
      'Mountaineering is inherently unpredictable, so the models use a Bayesian framework to realistically represent the level of uncertainty in its predictions.',
    ],
  },
  {
    title: 'Get Detailed Reviews of Model Accuracy',
    image: 'model_view_02.png',
    body: [
      'Custom models are trained for different segments of each activity, allowing for a higher degree of accuracy.',
      'Technical climbing models use a complex set of inputs including difficulty, pitch count, and familiarity with the route. All models factor in time of day, effort already exerted in the activity, and impact of pack weight.',
    ],
    cta: { label: 'Build Models', path: '/build-model' },
  },
  {
    title: 'Explore Trends in Activity Data',
    image: 'trend_analysis_01.png',
    body: [
      'Rich analysis of past activities identifies key trends that underlie the time prediction models. Analysis is interactive, making it easy to identify outliers and understand what is driving trends in past activities.',
    ],
    cta: { label: 'View Analysis', path: '/analysis' },
  },
  {
    title: 'Tag Activities with Key Route Details',
    image: 'route_segments_01.png',
    body: [
      'Segments are automatically generated from the activity, but can be edited by the user to an incredible level of detail.',
      'Key context about the route (including technical difficulty, terrain type, and pack weight) can be edited on a segment by segment basis, allowing for the most accurate possible models.',
    ],
  },
  {
    title: 'Clean Inacurate Waypoints',
    image: 'route_edit_01.png',
    body: [
      'Messy GPS data can lead to inflated distances and bad predictions. The user is able to clean traces on a point by point basis to ensure good data is flowing into the model.',
    ],
  },
  {
    title: 'Compile Activities from Any Source',
    image: 'activity_editor_01.png',
    body: [
      'Collects activities from multiple sources and organizes them for easy data cleaning, and context rich tagging. The user is also able to run predictions on any past activity, making planning for future routes easier.',
    ],
    cta: { label: 'Edit Activities', path: '/app' },
  },
]

function LandingPage() {
  const navigate = useNavigate()

  return (
    <div>
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Mountain G.O.A.T.</h1>
              <p className="mt-1 text-sm text-gray-500">Generative Outdoor Activity Tracker</p>
            </div>

            <div className="flex space-x-4">
              <button className="btn-primary" onClick={() => navigate('/plan-routes')}>
                Explore the App
              </button>
              <button className="btn-nav" onClick={() => navigate('/login')}>
                Admin Login
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-28 text-center">
        <h2 className="text-7xl font-bold text-accent-600">Plan Expeditions with Analytically Rigorous Activity Tracking</h2>
        <p className="mt-4 text-lg text-gray-500">See Nate Downer's advanced analysis</p>
      </div>

      {/* Connects straight into the box's own center line below - keep this and the
          box's line flush (no top/bottom padding between them) so the orange line
          reads as one continuous piece from here through the whole feature list. */}
      <div className="w-1 h-20 bg-accent-500 mx-auto mt-6" />

      {/* Same container width convention as AnalysisPage.tsx's <main>. */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        <div className="bg-white rounded-lg shadow-md p-6 relative">
          <div className="absolute left-1/2 top-0 bottom-0 w-1 -translate-x-1/2 bg-accent-500" />

          <div className="space-y-12">
            {FEATURES.map((feature, index) => {
              const reversed = index % 2 === 1

              const imageEl = (alignClass: string) => (
                <div className={`max-w-[34rem] ${alignClass} rounded-lg shadow-md overflow-hidden`}>
                  <img src={`/demo_images/${feature.image}`} alt={feature.title} className="w-full h-auto" />
                </div>
              )

              const textEl = (alignClass: string) => (
                <div className={`max-w-[24rem] ${alignClass}`}>
                  <h3 className="text-gray-800 mb-3">{feature.title}</h3>
                  {feature.body.map((paragraph, i) => (
                    <p key={i} className="text-gray-700 mb-3 last:mb-0">
                      {paragraph}
                    </p>
                  ))}
                  {feature.cta && (
                    <button className="btn-primary mt-2" onClick={() => navigate(feature.cta!.path)}>
                      {feature.cta.label}
                    </button>
                  )}
                </div>
              )

              return (
                <div key={feature.title} className="relative grid grid-cols-2 gap-8 items-center">
                  <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-accent-600 border-4 border-white shadow z-10" />

                  {/* Each row's left/right slot always hugs the center line (ml-auto in
                      column 1, mr-auto in column 2) - alternate which content (image vs
                      text) sits in which column so the layout zigzags row to row. */}
                  {reversed ? (
                    <>
                      {textEl('ml-auto')}
                      {imageEl('mr-auto')}
                    </>
                  ) : (
                    <>
                      {imageEl('ml-auto')}
                      {textEl('mr-auto')}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Same connector style as the one above the first box - keeps the orange
            line reading as one continuous piece across both white boxes. */}
        <div className="w-1 h-20 bg-accent-500 mx-auto" />

        <div className="bg-white rounded-lg shadow-md px-6 py-12 relative">
          <div className="absolute left-1/2 top-0 bottom-0 w-1 -translate-x-1/2 bg-accent-500" />

          <div className="space-y-12">
            {/* About the Analyst - text left, image right */}
            <div className="relative grid grid-cols-2 gap-8 items-center">
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-accent-600 border-4 border-white shadow z-10" />

              <div className="max-w-[24rem] ml-auto">
                <h3 className="text-gray-800 mb-3">About the Analyst</h3>
                <p className="text-gray-700 mb-3">
                  Nate Downer is an avid rock climber and data scientist, who loves finding new ways to use data to help make better decisions in the mountains.
                </p>
                <p className="text-gray-700 mb-3">
                  After tracking his own mountain adventures for years, Nate realized he was lacking a tool to use that data to its full potential; so he built one!
                </p>
                <p className="text-gray-700">
                  Professionally, Nate specializes in marketing analytics, and has four years of experience as a consultant for top automotive brands. He is based near Boulder Colorado.
                </p>
              </div>

              <div className="max-w-[27.2rem] mr-auto">
                <div className="rounded-lg shadow-md overflow-hidden">
                  <img src="/demo_images/nate_downer.jpg" alt="Nate Downer" className="w-full h-auto" />
                </div>
                <p className="mt-2 text-sm text-gray-400 text-center">
                  From a Recon Hike before climbing Pedraforca in Northern Spain.
                </p>
              </div>
            </div>

            {/* Methodology - image left, text right (alternates with the row above) */}
            <div className="relative grid grid-cols-2 gap-8 items-center">
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-accent-600 border-4 border-white shadow z-10" />

              <div className="max-w-[34rem] ml-auto">
                <div className="rounded-lg shadow-md overflow-hidden">
                  <img src="/demo_images/methodology_01.jpg" alt="Methodology" className="w-full h-auto" />
                </div>
                <p className="mt-2 text-sm text-gray-400 text-center">
                  Leading the beautiful 3rd Pitch of the Cara Este of Aguja de le'S in Patagonia.
                </p>
              </div>

              <div className="max-w-[24rem] mr-auto">
                <h3 className="text-gray-800 mb-3">Methodology</h3>
                <p className="text-gray-700 mb-3">
                  This app was designed and tested by Nate Downer; developed with assistance from Claude Code.
                </p>
                <p className="text-gray-700 mb-3">
                  The project came about after Nate realized the level of data cleaning needed to build reliable predictive models for outdoor activities went beyond what he could achieve in R and Python alone. The ability to comprehensively clean and tag the activity data in an intuitive and visual way emerged as a requirement from the fundamental analytical work.
                </p>
                <p className="text-gray-700 mb-3">
                  Since Nate is not a web developer, Claude Code was used to implement the app as seen here, based on his design and specifications.
                </p>
                <p className="text-gray-700 mb-3">
                  Note: Using Claude Code to build a planning tool (and validating the performance of that tool before trusting it) is very differnt than simply asking an AI to plan your route for you. Please seek out qualified recomendations from experienced climbers, and don't use an AI to do your planning for you!
                </p>
              </div>
            </div>

            {/* Other Projects - text left, image right (alternates with Methodology above) */}
            <div className="relative grid grid-cols-2 gap-8 items-center">
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-accent-600 border-4 border-white shadow z-10" />

              <div className="max-w-[24rem] ml-auto">
                <h3 className="text-gray-800 mb-3">More Climbing Analysis</h3>
                <p className="text-gray-700">
                  Check out Nate's past analysis visualizing 38 years of accident data from the AAC to help climbers understand what risks are the most pertinent to their region or style of climbing.
                </p>
                <div className="mt-3 flex flex-col gap-2">
                  <a
                    href="https://public.tableau.com/app/profile/nate.downer/viz/MostCommonAccidentCausebyState/Dashboard12#1"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-nav block text-center"
                  >
                    Risk Factors by State
                  </a>
                  <a
                    href="https://public.tableau.com/app/profile/nate.downer/viz/CausesofRockClimbingAccidents/MyRiskFactors"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-nav block text-center"
                  >
                    Risk Factors by Climbing Style
                  </a>
                </div>
              </div>

              <div className="max-w-[34rem] mr-auto">
                <div className="rounded-lg shadow-md overflow-hidden">
                  <img src="/demo_images/other_projects_01.jpg" alt="Other Projects" className="w-full h-auto" />
                </div>
                <p className="mt-2 text-sm text-gray-400 text-center">
                  Play hard and be smart!
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

export default LandingPage
