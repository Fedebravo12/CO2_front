import { Moon, Sun } from 'lucide-react'
import { useTheme } from '../context/ThemeContext'

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const label = theme === 'dark' ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'
  return (
    <button type="button" className="ghost theme-toggle" onClick={toggleTheme} title={label} aria-label={label}>
      {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
      <span>{theme === 'dark' ? 'Tema claro' : 'Tema oscuro'}</span>
    </button>
  )
}
