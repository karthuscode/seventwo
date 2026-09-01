const PLAN_DESTINATION = /^\/plans\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

self.addEventListener('push', (event) => {
  event.waitUntil(handlePush(event))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const destination = safeDestination(event.notification.data?.destination)
  event.waitUntil(openDestination(destination))
})

async function handlePush(event) {
  const payload = readPayload(event)
  if (!payload) return

  const windows = await self.clients.matchAll({
    type: 'window',
    includeUncontrolled: true,
  })
  const visibleWindows = windows.filter((client) => client.visibilityState === 'visible')
  if (visibleWindows.length) {
    for (const client of visibleWindows) {
      client.postMessage({ type: 'SEVENTWO_PUSH', notification: payload })
    }
    return
  }

  await self.registration.showNotification(payload.title, {
    body: payload.body,
    icon: '/poker-chip.svg',
    tag: payload.tag,
    renotify: false,
    data: { destination: payload.destination },
  })
}

function readPayload(event) {
  if (!event.data) return null
  try {
    const value = event.data.json()
    const destination = safeDestination(value.destination)
    if (typeof value.title !== 'string' || typeof value.body !== 'string') return null
    return {
      title: value.title.slice(0, 120),
      body: value.body.slice(0, 240),
      destination,
      tag: typeof value.tag === 'string' ? value.tag.slice(0, 300) : destination,
    }
  } catch {
    return null
  }
}

function safeDestination(value) {
  return typeof value === 'string' && PLAN_DESTINATION.test(value) ? value : '/'
}

async function openDestination(destination) {
  const targetUrl = new URL(destination, self.location.origin).href
  const windows = await self.clients.matchAll({
    type: 'window',
    includeUncontrolled: true,
  })
  const existing = windows.find((client) => new URL(client.url).origin === self.location.origin)
  if (existing) {
    if ('navigate' in existing) await existing.navigate(targetUrl)
    return existing.focus()
  }
  return self.clients.openWindow(targetUrl)
}
