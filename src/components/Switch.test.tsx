import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Switch } from './Switch'

describe('Switch', () => {
  it('renders with role=switch', () => {
    render(<Switch checked={false} onChange={() => {}} aria-label="开关" />)
    expect(screen.getByRole('switch')).toBeInTheDocument()
  })

  it('reflects checked state via aria-checked', () => {
    const { rerender } = render(
      <Switch checked={false} onChange={() => {}} aria-label="开关" />,
    )
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false')
    rerender(<Switch checked onChange={() => {}} aria-label="开关" />)
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true')
  })

  it('fires onChange with toggled value on click', () => {
    const onChange = vi.fn()
    render(<Switch checked={false} onChange={onChange} aria-label="开关" />)
    fireEvent.click(screen.getByRole('switch'))
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('toggles via Space key', () => {
    const onChange = vi.fn()
    render(<Switch checked onChange={onChange} aria-label="开关" />)
    fireEvent.keyDown(screen.getByRole('switch'), { key: ' ' })
    expect(onChange).toHaveBeenCalledWith(false)
  })

  it('does not fire onChange when disabled', () => {
    const onChange = vi.fn()
    render(<Switch checked={false} onChange={onChange} disabled aria-label="开关" />)
    fireEvent.click(screen.getByRole('switch'))
    expect(onChange).not.toHaveBeenCalled()
  })
})
