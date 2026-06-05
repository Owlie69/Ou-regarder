import { Telescope } from 'lucide-react'
import { getPublishedEvents } from '@/lib/events'
import { TabsSection } from '@/components/TabsSection'
import type { EventCategory, OuRegarderEvent } from '@/types'

export default function HomePage() {
  const events = getPublishedEvents()

  const eventsByCategory: Record<EventCategory, OuRegarderEvent[]> = {
    bientot: events.filter((e) => e.category === 'bientot'),
    atemporel: events.filter((e) => e.category === 'atemporel'),
    passe: events.filter((e) => e.category === 'passe'),
  }

  return (
    <>
      {/* Header */}
      <header className="bg-[#0f1e3c] text-white">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Telescope size={22} className="text-[#c8a96e]" />
            <span className="font-bold text-lg tracking-tight">Où Regarder</span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm text-gray-300">
            <a href="/" className="hover:text-white transition-colors">Accueil</a>
            <a href="#bientot" className="hover:text-white transition-colors">Événements</a>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="bg-[#0f1e3c] text-white pb-16 pt-12">
        <div className="max-w-6xl mx-auto px-4">
          <p className="text-[#c8a96e] text-sm font-semibold uppercase tracking-widest mb-3">
            Guide de visionnage parisien
          </p>
          <h1 className="text-4xl md:text-5xl font-bold leading-tight max-w-2xl mb-4">
            Trouvez le meilleur endroit pour chaque événement à Paris
          </h1>
          <p className="text-gray-300 text-lg max-w-xl leading-relaxed">
            Éclipses, feux d'artifice, défilés, levers de soleil : nous analysons la géographie,
            les hauteurs et la position du soleil pour vous recommander les meilleurs spots.
          </p>
        </div>
      </section>

      {/* Main content */}
      <main className="max-w-6xl mx-auto px-4 py-12" id="bientot">
        <TabsSection eventsByCategory={eventsByCategory} />
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 mt-16">
        <div className="max-w-6xl mx-auto px-4 py-8 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-gray-500">
          <div className="flex items-center gap-2">
            <Telescope size={16} className="text-[#c8a96e]" />
            <span>Où Regarder Paris © {new Date().getFullYear()}</span>
          </div>
          <div className="flex items-center gap-4">
            <a href="/sitemap.xml" className="hover:text-gray-700 transition-colors">Sitemap</a>
            <a href="/llms.txt" className="hover:text-gray-700 transition-colors">llms.txt</a>
            <a href="/admin" className="hover:text-gray-700 transition-colors">Admin</a>
          </div>
        </div>
      </footer>
    </>
  )
}
