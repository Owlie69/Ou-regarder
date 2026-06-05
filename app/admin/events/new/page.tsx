import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { EventForm } from '@/components/EventForm'
import { createEventAction } from '@/app/admin/actions'

export default function NewEventPage() {
  if (process.env.STATIC_EXPORT === 'true') {
    return (
      <div className="text-center py-16 text-gray-400">
        <p className="text-3xl mb-3">🛠️</p>
        <p className="font-medium">Admin CRUD unavailable on static deployment</p>
        <p className="text-sm mt-1">Run the app locally to create or edit events.</p>
      </div>
    )
  }

  return (
    <div>
      <Link
        href="/admin"
        className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-6 transition-colors"
      >
        <ArrowLeft size={14} />
        Back to events
      </Link>

      <h1 className="text-xl font-bold text-gray-900 mb-6">Create New Event</h1>

      <EventForm action={createEventAction} submitLabel="Create Event" />
    </div>
  )
}
