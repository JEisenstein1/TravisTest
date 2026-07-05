// OSM Nominatim geocoding for place/marina search. Attribution required;
// fair-use policy: low volume, debounced queries only.

import { NOMINATIM } from '../config'

export interface SearchHit {
  name: string
  lat: number
  lon: number
  kind: string
}

export async function searchPlaces(
  q: string,
  viewbox?: [number, number, number, number],
): Promise<SearchHit[]> {
  const params = new URLSearchParams({ format: 'jsonv2', q, limit: '8' })
  if (viewbox) {
    params.set('viewbox', viewbox.join(','))
    params.set('bounded', '0') // prefer viewport but allow global hits
  }
  const res = await fetch(`${NOMINATIM}?${params}`, {
    headers: { Accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`Search failed (${res.status})`)
  const data = (await res.json()) as Array<{
    display_name: string
    lat: string
    lon: string
    type: string
    category: string
  }>
  return data.map((d) => ({
    name: d.display_name,
    lat: Number(d.lat),
    lon: Number(d.lon),
    kind: `${d.category}/${d.type}`,
  }))
}
