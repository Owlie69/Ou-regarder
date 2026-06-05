import Link from 'next/link'
import { Telescope, LogOut, Plus } from 'lucide-react'

async function LogoutButton() {
  return (
    <form action="/api/admin/logout" method="POST">
      <button
        type="submit"
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors px-3 py-1.5 rounded-lg hover:bg-gray-100"
      >
        <LogOut size={14} />
        Sign out
      </button>
    </form>
  )
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="flex items-center gap-2 text-[#0f1e3c]">
              <Telescope size={18} className="text-[#c8a96e]" />
              <span className="font-bold text-sm">Où Regarder</span>
            </Link>
            <span className="text-gray-300 text-lg">|</span>
            <Link href="/admin" className="text-sm font-semibold text-gray-700 hover:text-gray-900">
              Admin Panel
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/admin/events/new"
              className="flex items-center gap-1.5 bg-[#0f1e3c] text-white text-sm px-3 py-1.5 rounded-lg hover:bg-navy-700 transition-colors font-medium"
            >
              <Plus size={14} />
              New Event
            </Link>
            <LogoutButton />
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {children}
      </main>
    </div>
  )
}
