import netlify from '@netlify/vite-plugin'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // `@netlify/dev` ne lit pas les fichiers .env : en local il ne connaît que les variables d'un
  // site Netlify lié. Les fonctions émulées héritant du `process.env` de ce processus, on y injecte
  // le .env nous-mêmes pour que `Netlify.env.get()` les voie pendant `npm run dev`.
  // En production, les variables viennent de Netlify et rien de tout ceci ne s'exécute.
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''))

  return {
    // Le plugin Netlify émule les Functions (et les autres primitives) pendant `npm run dev`.
    plugins: [react(), netlify()],
  }
})
