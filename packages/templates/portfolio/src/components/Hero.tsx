import { MapPin } from 'lucide-react'
import type { Portfolio } from '../content/types'

export function Hero({ profile }: { profile: Portfolio['profile'] }) {
  return (
    <header className="flex flex-col-reverse gap-8 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-4">
        <h1 data-content="profile.name" className="text-4xl font-bold tracking-tight sm:text-5xl">
          {profile.name}
        </h1>
        <p data-content="profile.headline" className="text-xl text-(--accent)">
          {profile.headline}
        </p>
        {profile.location && (
          <p className="flex items-center gap-1.5 text-sm text-(--muted)">
            <MapPin className="size-4" />
            <span data-content="profile.location">{profile.location}</span>
          </p>
        )}
      </div>
      {profile.avatarUrl && (
        <img
          src={profile.avatarUrl}
          alt={profile.name}
          className="size-28 rounded-(--radius) border border-(--border) object-cover sm:size-32"
        />
      )}
    </header>
  )
}
