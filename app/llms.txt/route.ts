import { NextResponse } from 'next/server'
import { getPublishedEvents } from '@/lib/events'

export async function GET() {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://ou-regarder.fr'
  const events = getPublishedEvents()

  const lines: string[] = [
    '# Où Regarder Paris — Guide de visionnage des événements parisiens',
    '',
    '> Où Regarder est un guide pratique pour trouver les meilleurs endroits',
    '> pour observer les grands événements parisiens : éclipses, feux d\'artifice,',
    '> défilés militaires, levers de soleil, illuminations de la Tour Eiffel.',
    '> Le site propose des spots recommandés avec carte interactive, position du soleil,',
    '> et conseils pratiques en français.',
    '',
    `URL: ${baseUrl}`,
    '',
    '---',
    '',
    '## Événements disponibles',
    '',
  ]

  const bientot = events.filter((e) => e.category === 'bientot')
  const atemporel = events.filter((e) => e.category === 'atemporel')
  const passe = events.filter((e) => e.category === 'passe')

  if (bientot.length > 0) {
    lines.push('### Bientôt (upcoming events)')
    lines.push('')
    bientot.forEach((event) => {
      lines.push(`#### ${event.name}`)
      lines.push(`URL: ${baseUrl}/events/${event.slug}`)
      lines.push(`Date: ${event.date || event.recurrence || 'Variable'}`)
      lines.push(`Description: ${event.shortDescription}`)
      lines.push(
        `Spots recommandés: ${event.viewingSpots.map((s) => s.name).join(', ')}`
      )
      lines.push(`Tags: ${event.tags.join(', ')}`)
      lines.push('')
    })
  }

  if (atemporel.length > 0) {
    lines.push('### Atemporel (timeless events)')
    lines.push('')
    atemporel.forEach((event) => {
      lines.push(`#### ${event.name}`)
      lines.push(`URL: ${baseUrl}/events/${event.slug}`)
      lines.push(`Récurrence: ${event.recurrence || 'Permanent'}`)
      lines.push(`Description: ${event.shortDescription}`)
      lines.push(
        `Spots recommandés: ${event.viewingSpots.map((s) => s.name).join(', ')}`
      )
      lines.push(`Tags: ${event.tags.join(', ')}`)
      lines.push('')
    })
  }

  if (passe.length > 0) {
    lines.push('### Passé (past events)')
    lines.push('')
    passe.forEach((event) => {
      lines.push(`#### ${event.name}`)
      lines.push(`URL: ${baseUrl}/events/${event.slug}`)
      lines.push(`Date: ${event.date || 'Inconnu'}`)
      lines.push(`Description: ${event.shortDescription}`)
      lines.push('')
    })
  }

  lines.push('---')
  lines.push('')
  lines.push('## À propos du site')
  lines.push('')
  lines.push(
    'Où Regarder utilise la géographie de Paris, les hauteurs des bâtiments, et la position'
  )
  lines.push(
    'du soleil (via SunCalc) pour recommander les meilleurs spots d\'observation.'
  )
  lines.push('La carte interactive (OpenStreetMap + Leaflet) montre chaque spot avec un code couleur :')
  lines.push('🟢 Meilleur spot  🔵 Bon spot  🟡 Acceptable')
  lines.push('')
  lines.push('Toutes les informations sont en français et ciblées pour un public parisien.')

  const text = lines.join('\n')

  return new NextResponse(text, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
