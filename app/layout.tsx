import type { Metadata } from 'next'
import './globals.css'

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://ou-regarder.fr'

export const metadata: Metadata = {
  metadataBase: new URL(baseUrl),
  title: {
    default: 'Où Regarder — Trouvez le meilleur spot pour chaque événement à Paris',
    template: '%s | Où Regarder Paris',
  },
  description:
    "Où Regarder vous aide à trouver les meilleurs endroits pour observer les événements parisiens : éclipses, feux d'artifice, défilés, levers de soleil. Spots recommandés, carte interactive et conseils pratiques.",
  keywords: [
    'où regarder Paris',
    'meilleur spot événement Paris',
    'observer éclipse Paris',
    'feux artifice 14 juillet spot',
    'lever de soleil Montmartre',
    'Tour Eiffel illuminations spot',
  ],
  openGraph: {
    type: 'website',
    locale: 'fr_FR',
    siteName: 'Où Regarder Paris',
    title: 'Où Regarder — Trouvez le meilleur spot pour chaque événement à Paris',
    description:
      'Spots recommandés, cartes interactives et conseils pratiques pour observer les grands événements parisiens.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Où Regarder Paris',
    description:
      'Trouvez les meilleurs endroits pour observer les événements parisiens.',
  },
  robots: {
    index: true,
    follow: true,
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fr">
      <body className="min-h-screen bg-[#fafaf8] text-[#1a1a2e] antialiased">
        {children}
      </body>
    </html>
  )
}
