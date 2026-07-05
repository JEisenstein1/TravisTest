import { createServer } from './app.ts'

const port = Number(process.env.PORT ?? 8787)
const dbPath = process.env.SOUNDLINE_DB ?? new URL('../data/soundline.sqlite', import.meta.url).pathname

const app = createServer(dbPath)
app.listen(port, () => {
  console.log(`Soundline sync server on http://localhost:${port} (db: ${dbPath})`)
})
