import Link from 'next/link'
import Image from 'next/image'
import { Calendar, Clock, Repeat } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { OuRegarderEvent, EventCategory } from '@/types'

const categoryConfig: Record<EventCategory, { label: string; className: string }> = {
  bientot: {
    label: 'Bientôt',
    className: 'bg-blue-100 text-blue-800 border border-blue-200',
  },
  atemporel: {
    label: 'Atemporel',
    className: 'bg-violet-100 text-violet-800 border border-violet-200',
  },
  passe: {
    label: 'Passé',
    className: 'bg-gray-100 text-gray-600 border border-gray-200',
  },
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

interface Props {
  event: OuRegarderEvent
  showCategory?: boolean
}

export function EventCard({ event, showCategory = false }: Props) {
  const cat = categoryConfig[event.category]

  return (
    <Link
      href={`/events/${event.slug}`}
      className="group block bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-200 border border-gray-100"
    >
      <div className="relative h-48 overflow-hidden">
        <Image
          src={event.imageUrl}
          alt={event.name}
          fill
          className="object-cover group-hover:scale-105 transition-transform duration-300"
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          unoptimized
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
        {showCategory && (
          <span
            className={cn(
              'absolute top-3 left-3 text-xs font-semibold px-2.5 py-1 rounded-full',
              cat.className
            )}
          >
            {cat.label}
          </span>
        )}
      </div>

      <div className="p-5">
        <div className="flex items-start justify-between gap-2 mb-2">
          <h3 className="font-semibold text-[#1a1a2e] text-base leading-snug group-hover:text-navy-700 transition-colors">
            {event.name}
          </h3>
          {!showCategory && (
            <span
              className={cn(
                'shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full',
                cat.className
              )}
            >
              {cat.label}
            </span>
          )}
        </div>

        <p className="text-sm text-gray-600 leading-relaxed mb-4 line-clamp-2">
          {event.shortDescription}
        </p>

        <div className="flex items-center gap-4 text-xs text-gray-500">
          {event.date ? (
            <span className="flex items-center gap-1">
              <Calendar size={12} />
              {formatDate(event.date)}
            </span>
          ) : event.recurrence ? (
            <span className="flex items-center gap-1">
              <Repeat size={12} />
              {event.recurrence}
            </span>
          ) : null}
          {event.time && (
            <span className="flex items-center gap-1">
              <Clock size={12} />
              {event.time}
            </span>
          )}
        </div>
      </div>
    </Link>
  )
}
