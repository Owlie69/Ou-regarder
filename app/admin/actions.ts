'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import {
  createEvent,
  updateEvent,
  deleteEvent,
  togglePublished,
} from '@/lib/events'
import type { OuRegarderEvent, EventCategory, ViewingSpot } from '@/types'

function slugify(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function parseSpots(formData: FormData): ViewingSpot[] {
  const spots: ViewingSpot[] = []
  let i = 0
  while (formData.has(`spot_${i}_name`)) {
    spots.push({
      id: (formData.get(`spot_${i}_id`) as string) || slugify(formData.get(`spot_${i}_name`) as string),
      name: formData.get(`spot_${i}_name`) as string,
      rank: (formData.get(`spot_${i}_rank`) as ViewingSpot['rank']) || 'good',
      lat: parseFloat(formData.get(`spot_${i}_lat`) as string) || 0,
      lng: parseFloat(formData.get(`spot_${i}_lng`) as string) || 0,
      direction: formData.get(`spot_${i}_direction`) as string,
      distance: formData.get(`spot_${i}_distance`) as string,
      notes: formData.get(`spot_${i}_notes`) as string,
    })
    i++
  }
  return spots
}

export async function createEventAction(formData: FormData) {
  const name = formData.get('name') as string
  const id = slugify(name) + '-' + Date.now()
  const slug = slugify(name)

  const event: OuRegarderEvent = {
    id,
    slug,
    name,
    shortDescription: formData.get('shortDescription') as string,
    longDescription: formData.get('longDescription') as string,
    category: formData.get('category') as EventCategory,
    published: formData.get('published') === 'true',
    date: (formData.get('date') as string) || null,
    time: (formData.get('time') as string) || null,
    recurrence: (formData.get('recurrence') as string) || null,
    imageUrl: formData.get('imageUrl') as string,
    location: {
      lat: parseFloat(formData.get('locationLat') as string) || 48.8566,
      lng: parseFloat(formData.get('locationLng') as string) || 2.3522,
      name: formData.get('locationName') as string,
    },
    viewingSpots: parseSpots(formData),
    sunEvent: formData.get('sunEvent') === 'true',
    eventDateTime: (formData.get('eventDateTime') as string) || null,
    viewingTips: ((formData.get('viewingTips') as string) || '')
      .split('\n')
      .map((t) => t.trim())
      .filter(Boolean),
    seoTitle: formData.get('seoTitle') as string,
    seoDescription: formData.get('seoDescription') as string,
    tags: ((formData.get('tags') as string) || '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
  }

  createEvent(event)
  revalidatePath('/')
  revalidatePath('/admin')
  redirect('/admin')
}

export async function updateEventAction(id: string, formData: FormData) {
  const updates: Partial<OuRegarderEvent> = {
    name: formData.get('name') as string,
    shortDescription: formData.get('shortDescription') as string,
    longDescription: formData.get('longDescription') as string,
    category: formData.get('category') as EventCategory,
    published: formData.get('published') === 'true',
    date: (formData.get('date') as string) || null,
    time: (formData.get('time') as string) || null,
    recurrence: (formData.get('recurrence') as string) || null,
    imageUrl: formData.get('imageUrl') as string,
    location: {
      lat: parseFloat(formData.get('locationLat') as string) || 48.8566,
      lng: parseFloat(formData.get('locationLng') as string) || 2.3522,
      name: formData.get('locationName') as string,
    },
    viewingSpots: parseSpots(formData),
    sunEvent: formData.get('sunEvent') === 'true',
    eventDateTime: (formData.get('eventDateTime') as string) || null,
    viewingTips: ((formData.get('viewingTips') as string) || '')
      .split('\n')
      .map((t) => t.trim())
      .filter(Boolean),
    seoTitle: formData.get('seoTitle') as string,
    seoDescription: formData.get('seoDescription') as string,
    tags: ((formData.get('tags') as string) || '')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
  }

  updateEvent(id, updates)
  revalidatePath('/')
  revalidatePath('/admin')
  revalidatePath(`/events/${updates.slug || id}`)
  redirect('/admin')
}

export async function deleteEventAction(id: string) {
  deleteEvent(id)
  revalidatePath('/')
  revalidatePath('/admin')
}

export async function togglePublishedAction(id: string) {
  togglePublished(id)
  revalidatePath('/')
  revalidatePath('/admin')
}
