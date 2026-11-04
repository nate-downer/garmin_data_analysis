import { useLocation } from 'react-router-dom'
import ActivityListPage from '../components/activity/ActivityListPage'

function PlanRoutesPage() {
  const location = useLocation()
  const initialSelectedActivityId = (location.state as { selectedActivityId?: string } | null)?.selectedActivityId

  return (
    <ActivityListPage
      isPlanned={true}
      title="Planned Routes"
      initialSelectedActivityId={initialSelectedActivityId}
    />
  )
}

export default PlanRoutesPage
