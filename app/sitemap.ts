import type { MetadataRoute } from 'next'
import { getPublishedEvents } from '@/lib/events'

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://ou-regarder.fr'
  const events = getPublishedEvents()

  const eventUrls: MetadataRoute.Sitemap = events.map((event) => ({
    url: `${baseUrl}/events/${event.slug}`,
    lastModified: new Date(),
    changeFrequency: event.category === 'atemporel' ? 'monthly' : 'weekly',
    priority: event.category === 'bientot' ? 0.9 : 0.7,
  }))

  return [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'daily',
      priority: 1,
    },
    ...eventUrls,
  ]
}
