import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

describe('Renderer test setup', () => {
  it('can render React components', () => {
    render(<div data-testid="test">Hello</div>)
    expect(screen.getByTestId('test')).toHaveTextContent('Hello')
  })

  it('has window.api mock available', () => {
    expect(window.api).toBeDefined()
    expect(window.api.loadProjectConfig).toBeDefined()
  })
})
