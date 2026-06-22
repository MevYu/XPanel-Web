import { describe, it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Input } from './Input'

describe('Input', () => {
  it('renders label and input', () => {
    render(<Input label="用户名" />)
    expect(screen.getByLabelText('用户名')).toBeInTheDocument()
  })

  it('shows error message when error is set', () => {
    render(<Input label="密码" error="必填" />)
    expect(screen.getByText('必填')).toBeInTheDocument()
  })

  describe('password toggle', () => {
    it('defaults to password type and renders a toggle button', () => {
      render(<Input label="密码" type="password" />)
      const input = screen.getByLabelText('密码')
      expect(input).toHaveAttribute('type', 'password')
      expect(screen.getByRole('button', { name: '显示密码' })).toBeInTheDocument()
    })

    it('toggles input type between password and text on click', () => {
      render(<Input label="密码" type="password" />)
      const input = screen.getByLabelText('密码')
      fireEvent.click(screen.getByRole('button', { name: '显示密码' }))
      expect(input).toHaveAttribute('type', 'text')
      fireEvent.click(screen.getByRole('button', { name: '隐藏密码' }))
      expect(input).toHaveAttribute('type', 'password')
    })

    it('does not render toggle button for non-password types', () => {
      render(<Input label="用户名" type="text" />)
      expect(screen.queryByRole('button')).not.toBeInTheDocument()
    })
  })
})
