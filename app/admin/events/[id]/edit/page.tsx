import { notFound } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ExternalLink } from 'lucide-react'
import { getAllEvents } from '@/lib/events'
import { EventForm } from '@/components/EventForm'
import { updateEventAction } from '@/app/admin/actions'

interface Props {
  params: { id: string }
}

export async function generateStaticParams() {
  const events = getAllEvents()
  return events.map((e) => ({ id: e.id }))
}

export default function EditEventPage({ params }: Props) {
  const events = getAllEvents()
  const event = events.find((e) => e.id === params.id)
  if (!event) notFound()

  if (process.env.STATIC_EXPORT === 'true') {
    return (
      <div className="text-center py-16 text-gray-400">
        <p className="text-3xl mb-3">🛠️</p>
        <p className="font-medium">Admin CRUD unavailable on static deployment</p>
        <p className="text-sm mt-1">Run the app locally to create or edit events.</p>
      </div>
    )
  }

  const boundAction = updateEventAction.bind(null, event.id)

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <Link
          href="/admin"
          className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
        >
          <ArrowLeft size={14} />
          Back to events
        </Link>

        <Link
          href={`/events/${event.slug}`}
          target="_blank"
          className="inline-flex items-center gap-1.5 text-sm text-[#c8a96e] hover:text-amber-700 transition-colors"
        >
          <ExternalLink size={14} />
          Preview
        </Link>
      </div>

      <h1 className="text-xl font-bold text-gray-900 mb-2">Edit Event</h1>
      <p className="text-sm text-gray-500 mb-6">{event.name}</p>

      <EventForm event={event} action={boundAction} submitLabel="Save Changes" />
    </div>
  )
}
