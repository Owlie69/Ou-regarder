'use client'

import { useState } from 'react'
import { EventCard } from '@/components/EventCard'
import { cn } from '@/lib/utils'
import type { OuRegarderEvent, EventCategory } from '@/types'

const tabs: { id: EventCategory; label: string; emoji: string }[] = [
  { id: 'bientot', label: 'Bientôt', emoji: '📅' },
  { id: 'atemporel', label: 'Atemporel', emoji: '✨' },
  { id: 'passe', label: 'Passé', emoji: '📁' },
]

interface Props {
  eventsByCategory: Record<EventCategory, OuRegarderEvent[]>
}

export function TabsSection({ eventsByCategory }: Props) {
  const [active, setActive] = useState<EventCategory>('bientot')

  const events = eventsByCategory[active] || []

  return (
    <div>
      {/* Tab nav */}
      <div className="flex gap-1 bg-gray-100 rounded-xl p-1 mb-8 w-fit mx-auto md:mx-0">
        {tabs.map((tab) => {
          const count = (eventsByCategory[tab.id] || []).length
          return (
            <button
              key={tab.id}
              onClick={() => setActive(tab.id)}
              className={cn(
                'flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                active === tab.id
                  ? 'bg-white text-[#1a1a2e] shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              )}
            >
              <span>{tab.emoji}</span>
              <span>{tab.label}</span>
              {count > 0 && (
                <span
                  className={cn(
                    'text-xs px-1.5 py-0.5 rounded-full min-w-[20px] text-center',
                    active === tab.id
                      ? 'bg-[#c8a96e] text-white'
                      : 'bg-gray-200 text-gray-600'
                  )}
                >
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* Events grid */}
      {events.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-4xl mb-3">🔭</p>
          <p className="text-sm">Aucun événement dans cette catégorie pour le moment.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {events.map((event) => (
            <EventCard key={event.id} event={event} />
          ))}
        </div>
      )}
    </div>
  )
}
