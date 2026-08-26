import { Link } from 'react-router-dom'
import { EmptyState } from '../components/EmptyState'

export function NotFoundPage() {
  return <EmptyState title="Page not found" description="The page you requested does not exist." action={<Link to="/" className="font-bold text-emerald-300">Go home</Link>} />
}
