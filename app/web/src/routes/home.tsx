import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'
import { useUiStore } from '../stores/ui-store'

export function HomeRoute() {
  const hydrated = useUiStore((s) => s.hydrated)
  const setHydrated = useUiStore((s) => s.setHydrated)

  const { data: bootstrap } = useQuery({
    queryKey: ['bootstrap'],
    queryFn: async () => ({ status: 'ok' as const }),
  })

  useEffect(() => {
    setHydrated(true)
  }, [setHydrated])

  return (
    <main>
      <h1>Tabletop RPG</h1>
      <p>React · Vite · TanStack Router · TanStack Query · Zustand</p>
      <dl>
        <dt>Query</dt>
        <dd>{bootstrap?.status ?? '…'}</dd>
        <dt>UI store</dt>
        <dd>{hydrated ? 'hydrated' : 'pending'}</dd>
      </dl>
    </main>
  )
}
