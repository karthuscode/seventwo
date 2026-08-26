import { mkdir, writeFile } from 'node:fs/promises'

const worker = `export default {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request)

    if (
      response.status === 404 &&
      request.method === 'GET' &&
      request.headers.get('accept')?.includes('text/html')
    ) {
      const indexRequest = new Request(new URL('/index.html', request.url), request)
      return env.ASSETS.fetch(indexRequest)
    }

    return response
  },
}
`

await mkdir(new URL('../dist/server/', import.meta.url), { recursive: true })
await writeFile(new URL('../dist/server/index.js', import.meta.url), worker)
