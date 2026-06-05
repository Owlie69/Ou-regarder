import { getAllEvents } from '@/lib/events'
import { AdminEventRow } from '@/components/AdminEventRow'

export default function AdminPage() {
  const events = getAllEvents()
  const published = events.filter((e) => e.published).length
  const drafts = events.filter((e) => !e.published).length

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 mb-1">Events</h1>
        <p className="text-sm text-gray-500">
          {events.length} total · {published} published · {drafts} drafts
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {[
          { label: 'Total', value: events.length, color: 'text-gray-700' },
          { label: 'Published', value: published, color: 'text-green-600' },
          { label: 'Drafts', value: drafts, color: 'text-amber-600' },
        ].map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl border border-gray-100 p-4">
            <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
            <p className="text-xs text-gray-500 mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Events table */}
      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {events.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <p className="text-3xl mb-2">📭</p>
            <p className="text-sm">No events yet. Create your first one.</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {events.map((event) => (
              <AdminEventRow key={event.id} event={event} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
