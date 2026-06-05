'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Edit, Trash2, Eye, EyeOff, ExternalLink } from 'lucide-react'
import { cn } from '@/lib/utils'
import { deleteEventAction, togglePublishedAction } from '@/app/admin/actions'
import type { OuRegarderEvent, EventCategory } from '@/types'

const categoryLabels: Record<EventCategory, string> = {
  bientot: 'Bientôt',
  atemporel: 'Atemporel',
  passe: 'Passé',
}

const categoryClass: Record<EventCategory, string> = {
  bientot: 'bg-blue-100 text-blue-700',
  atemporel: 'bg-violet-100 text-violet-700',
  passe: 'bg-gray-100 text-gray-600',
}

export function AdminEventRow({ event }: { event: OuRegarderEvent }) {
  const [, startTransition] = useTransition()
  const [deleting, setDeleting] = useState(false)

  function handleDelete() {
    if (!confirm(`Delete "${event.name}"?`)) return
    setDeleting(true)
    startTransition(() => {
      deleteEventAction(event.id)
    })
  }

  function handleToggle() {
    startTransition(() => {
      togglePublishedAction(event.id)
    })
  }

  if (deleting) return null

  return (
    <div className="flex items-center gap-4 p-4 hover:bg-gray-50 transition-colors">
      {/* Image */}
      <div className="relative w-16 h-12 rounded-lg overflow-hidden shrink-0">
        <Image
          src={event.imageUrl}
          alt={event.name}
          fill
          className="object-cover"
          sizes="64px"
          unoptimized
        />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className="font-medium text-gray-900 text-sm truncate">{event.name}</span>
          <span
            className={cn(
              'shrink-0 text-xs px-2 py-0.5 rounded-full font-medium',
              categoryClass[event.category]
            )}
          >
            {categoryLabels[event.category]}
          </span>
        </div>
        <p className="text-xs text-gray-400 truncate">{event.shortDescription}</p>
        <p className="text-xs text-gray-400 mt-0.5">
          {event.date || event.recurrence || 'Date inconnue'} · {event.viewingSpots.length} spot(s)
        </p>
      </div>

      {/* Status */}
      <div className="shrink-0">
        <span
          className={cn(
            'text-xs font-semibold px-2.5 py-1 rounded-full',
            event.published ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
          )}
        >
          {event.published ? 'Published' : 'Draft'}
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        <Link
          href={`/events/${event.slug}`}
          target="_blank"
          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          title="Preview"
        >
          <ExternalLink size={15} />
        </Link>

        <button
          onClick={handleToggle}
          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          title={event.published ? 'Unpublish' : 'Publish'}
        >
          {event.published ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>

        <Link
          href={`/admin/events/${event.id}/edit`}
          className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
          title="Edit"
        >
          <Edit size={15} />
        </Link>

        <button
          onClick={handleDelete}
          className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          title="Delete"
        >
          <Trash2 size={15} />
        </button>
      </div>
    </div>
  )
}
