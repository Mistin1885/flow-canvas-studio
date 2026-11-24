import { createRoot } from 'react-dom/client'
import BackupAdmin from './admin/BackupAdmin'
import App from './App'
import './styles/index.css'

createRoot(document.getElementById('root')!).render(
  location.pathname.replace(/\/$/, '') === '/admin' ? <BackupAdmin /> : <App />,
)
