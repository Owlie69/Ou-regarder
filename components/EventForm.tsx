'use client'

import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import type { OuRegarderEvent, ViewingSpot, EventCategory, SpotRank } from '@/types'

const inputClass =
  'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#c8a96e] focus:border-transparent'

const labelClass = 'block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5'

interface Props {
  event?: Partial<OuRegarderEvent>
  action: (formData: FormData) => Promise<void>
  submitLabel: string
}

function emptySpot(index: number): ViewingSpot & { _index: number } {
  return {
    _index: index,
    id: '',
    name: '',
    rank: 'good',
    lat: 48.8566,
    lng: 2.3522,
    direction: '',
    distance: '',
    notes: '',
  }
}

export function EventForm({ event, action, submitLabel }: Props) {
  const [spots, setSpots] = useState<(ViewingSpot & { _index: number })[]>(
    (event?.viewingSpots || []).map((s, i) => ({ ...s, _index: i })) ||
      [emptySpot(0)]
  )
  const [nextIndex, setNextIndex] = useState(
    (event?.viewingSpots?.length || 1)
  )

  function addSpot() {
    setSpots((prev) => [...prev, emptySpot(nextIndex)])
    setNextIndex((n) => n + 1)
  }

  function removeSpot(idx: number) {
    setSpots((prev) => prev.filter((s) => s._index !== idx))
  }

  return (
    <form action={action} className="space-y-8">
      {/* Basic info */}
      <section className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
        <h2 className="font-semibold text-gray-900 text-sm uppercase tracking-wide">Basic Information</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className={labelClass}>Event Name *</label>
            <input name="name" defaultValue={event?.name || ''} required className={inputClass} placeholder="Défilé du 14 Juillet" />
          </div>

          <div>
            <label className={labelClass}>Category *</label>
            <select name="category" defaultValue={event?.category || 'bientot'} className={inputClass}>
              <option value="bientot">Bientôt (upcoming)</option>
              <option value="atemporel">Atemporel (timeless)</option>
              <option value="passe">Passé (past)</option>
            </select>
          </div>

          <div>
            <label className={labelClass}>Published</label>
            <select name="published" defaultValue={event?.published ? 'true' : 'false'} className={inputClass}>
              <option value="false">Draft</option>
              <option value="true">Published</option>
            </select>
          </div>

          <div>
            <label className={labelClass}>Date</label>
            <input name="date" type="date" defaultValue={event?.date || ''} className={inputClass} />
          </div>

          <div>
            <label className={labelClass}>Time</label>
            <input name="time" type="time" defaultValue={event?.time || ''} className={inputClass} />
          </div>

          <div className="md:col-span-2">
            <label className={labelClass}>Recurrence (if applicable)</label>
            <input name="recurrence" defaultValue={event?.recurrence || ''} className={inputClass} placeholder="Chaque 14 juillet" />
          </div>

          <div className="md:col-span-2">
            <label className={labelClass}>Image URL *</label>
            <input name="imageUrl" defaultValue={event?.imageUrl || ''} required className={inputClass} placeholder="https://images.unsplash.com/..." />
          </div>
        </div>

        <div>
          <label className={labelClass}>Short Description *</label>
          <input name="shortDescription" defaultValue={event?.shortDescription || ''} required className={inputClass} placeholder="Une phrase courte pour la carte" />
        </div>

        <div>
          <label className={labelClass}>Long Description *</label>
          <textarea
            name="longDescription"
            defaultValue={event?.longDescription || ''}
            required
            rows={5}
            className={inputClass}
            placeholder="Description détaillée de l'événement…"
          />
        </div>
      </section>

      {/* Location */}
      <section className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
        <h2 className="font-semibold text-gray-900 text-sm uppercase tracking-wide">Location</h2>

        <div>
          <label className={labelClass}>Location Name *</label>
          <input name="locationName" defaultValue={event?.location?.name || ''} required className={inputClass} placeholder="Tour Eiffel, Paris" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Latitude *</label>
            <input name="locationLat" type="number" step="any" defaultValue={event?.location?.lat || 48.8566} required className={inputClass} />
          </div>
          <div>
            <label className={labelClass}>Longitude *</label>
            <input name="locationLng" type="number" step="any" defaultValue={event?.location?.lng || 2.3522} required className={inputClass} />
          </div>
        </div>
      </section>

      {/* Sun event */}
      <section className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
        <h2 className="font-semibold text-gray-900 text-sm uppercase tracking-wide">Sun / Solar Event</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className={labelClass}>Is Sun Event?</label>
            <select name="sunEvent" defaultValue={event?.sunEvent ? 'true' : 'false'} className={inputClass}>
              <option value="false">No</option>
              <option value="true">Yes (solar event)</option>
            </select>
          </div>

          <div>
            <label className={labelClass}>Event DateTime (for sun calc)</label>
            <input
              name="eventDateTime"
              type="datetime-local"
              defaultValue={event?.eventDateTime?.slice(0, 16) || ''}
              className={inputClass}
            />
          </div>
        </div>
      </section>

      {/* Viewing spots */}
      <section className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-gray-900 text-sm uppercase tracking-wide">Viewing Spots</h2>
          <button
            type="button"
            onClick={addSpot}
            className="flex items-center gap-1.5 text-sm text-[#c8a96e] hover:text-amber-700 font-medium"
          >
            <Plus size={14} />
            Add Spot
          </button>
        </div>

        {spots.map((spot, displayIndex) => (
          <div key={spot._index} className="border border-gray-100 rounded-xl p-4 space-y-3 relative">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Spot #{displayIndex + 1}
              </span>
              {spots.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeSpot(spot._index)}
                  className="text-red-400 hover:text-red-600"
                >
                  <Trash2 size={14} />
                </button>
              )}
            </div>

            <input type="hidden" name={`spot_${displayIndex}_id`} value={spot.id} />

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className={labelClass}>Name *</label>
                <input
                  name={`spot_${displayIndex}_name`}
                  defaultValue={spot.name}
                  required
                  className={inputClass}
                  placeholder="Trocadéro"
                />
              </div>

              <div>
                <label className={labelClass}>Rank *</label>
                <select name={`spot_${displayIndex}_rank`} defaultValue={spot.rank} className={inputClass}>
                  <option value="best">Best</option>
                  <option value="good">Good</option>
                  <option value="acceptable">Acceptable</option>
                </select>
              </div>

              <div>
                <label className={labelClass}>Latitude *</label>
                <input name={`spot_${displayIndex}_lat`} type="number" step="any" defaultValue={spot.lat} required className={inputClass} />
              </div>

              <div>
                <label className={labelClass}>Longitude *</label>
                <input name={`spot_${displayIndex}_lng`} type="number" step="any" defaultValue={spot.lng} required className={inputClass} />
              </div>

              <div>
                <label className={labelClass}>Direction</label>
                <input name={`spot_${displayIndex}_direction`} defaultValue={spot.direction} className={inputClass} placeholder="Sud-est (azimut ~150°)" />
              </div>

              <div>
                <label className={labelClass}>Distance</label>
                <input name={`spot_${displayIndex}_distance`} defaultValue={spot.distance} className={inputClass} placeholder="700 m de la Tour Eiffel" />
              </div>
            </div>

            <div>
              <label className={labelClass}>Notes</label>
              <textarea
                name={`spot_${displayIndex}_notes`}
                defaultValue={spot.notes}
                rows={2}
                className={inputClass}
                placeholder="Pourquoi ce spot est bon, ce qu'il faut savoir…"
              />
            </div>
          </div>
        ))}
      </section>

      {/* Tips */}
      <section className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
        <h2 className="font-semibold text-gray-900 text-sm uppercase tracking-wide">Viewing Tips</h2>
        <div>
          <label className={labelClass}>One tip per line</label>
          <textarea
            name="viewingTips"
            defaultValue={(event?.viewingTips || []).join('\n')}
            rows={5}
            className={inputClass}
            placeholder={`Arrivez 30 min avant\nApportez de l'eau\nÉvitez les jours de pluie`}
          />
        </div>
      </section>

      {/* SEO */}
      <section className="bg-white rounded-xl border border-gray-100 p-6 space-y-4">
        <h2 className="font-semibold text-gray-900 text-sm uppercase tracking-wide">SEO</h2>

        <div>
          <label className={labelClass}>SEO Title *</label>
          <input name="seoTitle" defaultValue={event?.seoTitle || ''} required className={inputClass} placeholder="Où regarder le défilé du 14 juillet à Paris" />
        </div>

        <div>
          <label className={labelClass}>Meta Description *</label>
          <textarea
            name="seoDescription"
            defaultValue={event?.seoDescription || ''}
            required
            rows={2}
            className={inputClass}
            placeholder="Description pour les moteurs de recherche (150-160 caractères)"
          />
        </div>

        <div>
          <label className={labelClass}>Tags (comma-separated)</label>
          <input name="tags" defaultValue={(event?.tags || []).join(', ')} className={inputClass} placeholder="14 juillet, défilé, Champs-Élysées" />
        </div>
      </section>

      <button
        type="submit"
        className="w-full bg-[#0f1e3c] text-white py-3 px-6 rounded-xl font-semibold text-sm hover:bg-navy-700 transition-colors"
      >
        {submitLabel}
      </button>
    </form>
  )
}
