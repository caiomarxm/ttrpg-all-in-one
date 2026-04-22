import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { HomeRoute } from '../home'

describe('HomeRoute', () => {
  it('renders the app title', async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
        },
      },
    })

    render(
      <QueryClientProvider client={queryClient}>
        <HomeRoute />
      </QueryClientProvider>,
    )

    expect(screen.getByRole('heading', { name: /tabletop rpg/i })).toBeInTheDocument()

    await waitFor(() => {
      expect(screen.getByText('hydrated')).toBeInTheDocument()
    })
  })
})
