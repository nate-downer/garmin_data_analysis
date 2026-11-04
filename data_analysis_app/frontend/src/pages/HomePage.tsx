import { useLocation } from 'react-router-dom'
import ActivityListPage from '../components/activity/ActivityListPage'

function HomePage() {
  const location = useLocation()
  const initialSelectedActivityId = (location.state as { selectedActivityId?: string } | null)?.selectedActivityId

  return (
    <ActivityListPage
      isPlanned={false}
      title="Activities"
      initialSelectedActivityId={initialSelectedActivityId}
    />
  )
}

export default HomePage
