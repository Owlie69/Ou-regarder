import fs from 'fs'
import path from 'path'
import type { OuRegarderEvent, EventCategory } from '@/types'

const DATA_FILE = path.join(process.cwd(), 'data', 'events.json')

export function getAllEvents(): OuRegarderEvent[] {
  const raw = fs.readFileSync(DATA_FILE, 'utf-8')
  return JSON.parse(raw) as OuRegarderEvent[]
}

export function getPublishedEvents(): OuRegarderEvent[] {
  return getAllEvents().filter((e) => e.published)
}

export function getEventsByCategory(category: EventCategory): OuRegarderEvent[] {
  return getPublishedEvents().filter((e) => e.category === category)
}

export function getEventBySlug(slug: string): OuRegarderEvent | undefined {
  return getAllEvents().find((e) => e.slug === slug)
}

export function getPublishedEventBySlug(slug: string): OuRegarderEvent | undefined {
  return getPublishedEvents().find((e) => e.slug === slug)
}

export function saveEvents(events: OuRegarderEvent[]): void {
  fs.writeFileSync(DATA_FILE, JSON.stringify(events, null, 2), 'utf-8')
}

export function createEvent(event: OuRegarderEvent): void {
  const events = getAllEvents()
  events.push(event)
  saveEvents(events)
}

export function updateEvent(id: string, updates: Partial<OuRegarderEvent>): OuRegarderEvent | null {
  const events = getAllEvents()
  const idx = events.findIndex((e) => e.id === id)
  if (idx === -1) return null
  events[idx] = { ...events[idx], ...updates }
  saveEvents(events)
  return events[idx]
}

export function deleteEvent(id: string): boolean {
  const events = getAllEvents()
  const idx = events.findIndex((e) => e.id === id)
  if (idx === -1) return false
  events.splice(idx, 1)
  saveEvents(events)
  return true
}

export function togglePublished(id: string): OuRegarderEvent | null {
  const events = getAllEvents()
  const idx = events.findIndex((e) => e.id === id)
  if (idx === -1) return null
  events[idx].published = !events[idx].published
  saveEvents(events)
  return events[idx]
}
