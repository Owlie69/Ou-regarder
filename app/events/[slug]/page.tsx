import { notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import type { Metadata } from 'next'
import { ArrowLeft, Calendar, Clock, MapPin, Repeat, Telescope } from 'lucide-react'
import { getPublishedEventBySlug, getPublishedEvents } from '@/lib/events'
import { EventDetailClient } from '@/components/EventDetailClient'
import type { EventCategory } from '@/types'

const categoryLabel: Record<EventCategory, string> = {
  bientot: 'Bientôt',
  atemporel: 'Atemporel',
  passe: 'Passé',
}

const categoryClass: Record<EventCategory, string> = {
  bientot: 'bg-blue-100 text-blue-800',
  atemporel: 'bg-violet-100 text-violet-800',
  passe: 'bg-gray-100 text-gray-600',
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

export async function generateStaticParams() {
  const events = getPublishedEvents()
  return events.map((e) => ({ slug: e.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string }
}): Promise<Metadata> {
  const event = getPublishedEventBySlug(params.slug)
  if (!event) return {}

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://ou-regarder.fr'

  return {
    title: event.seoTitle,
    description: event.seoDescription,
    keywords: event.tags,
    openGraph: {
      title: event.seoTitle,
      description: event.seoDescription,
      images: [{ url: event.imageUrl, alt: event.name }],
      type: 'article',
      locale: 'fr_FR',
    },
    twitter: {
      card: 'summary_large_image',
      title: event.seoTitle,
      description: event.seoDescription,
      images: [event.imageUrl],
    },
    alternates: {
      canonical: `${baseUrl}/events/${event.slug}`,
    },
  }
}

export default function EventPage({ params }: { params: { slug: string } }) {
  const event = getPublishedEventBySlug(params.slug)
  if (!event) notFound()

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://ou-regarder.fr'

  // JSON-LD structured data
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Event',
    name: event.name,
    description: event.longDescription,
    image: event.imageUrl,
    url: `${baseUrl}/events/${event.slug}`,
    ...(event.date && {
      startDate: event.eventDateTime || event.date,
      endDate: event.eventDateTime || event.date,
    }),
    location: {
      '@type': 'Place',
      name: event.location.name,
      geo: {
        '@type': 'GeoCoordinates',
        latitude: event.location.lat,
        longitude: event.location.lng,
      },
      address: {
        '@type': 'PostalAddress',
        addressLocality: 'Paris',
        addressCountry: 'FR',
      },
    },
    organizer: {
      '@type': 'Organization',
      name: 'Où Regarder Paris',
      url: baseUrl,
    },
    eventStatus: event.category === 'passe'
      ? 'https://schema.org/EventScheduled'
      : 'https://schema.org/EventScheduled',
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    isAccessibleForFree: true,
    keywords: event.tags.join(', '),
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Header */}
      <header className="bg-[#0f1e3c] text-white sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <Telescope size={20} className="text-[#c8a96e]" />
            <span className="font-bold">Où Regarder</span>
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Back */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 mb-6 transition-colors"
        >
          <ArrowLeft size={16} />
          Retour aux événements
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          {/* Left column — details */}
          <div className="lg:col-span-2">
            {/* Hero image */}
            <div className="relative h-64 rounded-2xl overflow-hidden mb-6">
              <Image
                src={event.imageUrl}
                alt={event.name}
                fill
                className="object-cover"
                sizes="(max-width: 1024px) 100vw, 40vw"
                unoptimized
                priority
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
              <span
                className={`absolute top-4 left-4 text-xs font-semibold px-3 py-1 rounded-full ${categoryClass[event.category]}`}
              >
                {categoryLabel[event.category]}
              </span>
            </div>

            {/* Title & meta */}
            <h1 className="text-2xl font-bold text-[#1a1a2e] mb-3 leading-tight">
              {event.name}
            </h1>

            <div className="flex flex-wrap gap-3 mb-4 text-sm text-gray-600">
              {event.date && (
                <span className="flex items-center gap-1.5">
                  <Calendar size={14} className="text-[#c8a96e]" />
                  {formatDate(event.date)}
                </span>
              )}
              {event.time && (
                <span className="flex items-center gap-1.5">
                  <Clock size={14} className="text-[#c8a96e]" />
                  {event.time}
                </span>
              )}
              {event.recurrence && (
                <span className="flex items-center gap-1.5">
                  <Repeat size={14} className="text-[#c8a96e]" />
                  {event.recurrence}
                </span>
              )}
              <span className="flex items-center gap-1.5">
                <MapPin size={14} className="text-[#c8a96e]" />
                {event.location.name}
              </span>
            </div>

            <p className="text-gray-700 leading-relaxed text-sm mb-4">
              {event.longDescription}
            </p>

            {/* Tags */}
            {event.tags.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {event.tags.map((tag) => (
                  <span
                    key={tag}
                    className="text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Right column — interactive */}
          <div className="lg:col-span-3">
            <EventDetailClient event={event} />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 mt-16">
        <div className="max-w-6xl mx-auto px-4 py-8 flex items-center justify-between text-sm text-gray-500">
          <div className="flex items-center gap-2">
            <Telescope size={16} className="text-[#c8a96e]" />
            <span>Où Regarder Paris © {new Date().getFullYear()}</span>
          </div>
          <Link href="/" className="hover:text-gray-700 transition-colors">
            ← Retour à l'accueil
          </Link>
        </div>
      </footer>
    </>
  )
}
