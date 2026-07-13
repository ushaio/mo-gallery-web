import assert from 'node:assert/strict'

import {
  loadSafeRemoteImage,
  type SafeRemoteImageFetch,
  type SafeRemoteImageResolver,
} from './safe-remote-image'

const PUBLIC_ADDRESS = '93.184.216.34'

function resolverFor(addressesByHost: Record<string, string[]>): SafeRemoteImageResolver {
  return async (hostname) => {
    const addresses = addressesByHost[hostname]
    if (!addresses) throw new Error(`Unexpected DNS lookup: ${hostname}`)
    return addresses.map((address) => ({
      address,
      family: address.includes(':') ? 6 as const : 4 as const,
    }))
  }
}

async function testRejectsNonHttpsUrlsBeforeDnsOrFetch() {
  let resolves = 0
  let fetches = 0
  const resolver: SafeRemoteImageResolver = async () => {
    resolves += 1
    return [{ address: PUBLIC_ADDRESS, family: 4 }]
  }
  const fetch: SafeRemoteImageFetch = async () => {
    fetches += 1
    return new Response()
  }

  await assert.rejects(
    loadSafeRemoteImage('http://images.example/photo.png', { maxBytes: 100, resolver, fetch }),
    /HTTPS/,
  )
  assert.equal(resolves, 0)
  assert.equal(fetches, 0)
}

async function testRejectsUnsafeLiteralAndResolvedAddresses() {
  const unsafeAddresses = [
    '0.0.0.0',
    '10.0.0.1',
    '100.64.0.1',
    '127.0.0.1',
    '169.254.169.254',
    '172.16.0.1',
    '192.0.2.1',
    '192.168.1.1',
    '198.18.0.1',
    '198.51.100.1',
    '203.0.113.1',
    '224.0.0.1',
    '240.0.0.1',
    '::',
    '::1',
    '::ffff:127.0.0.1',
    '::ffff:169.254.169.254',
    '100::1',
    '2001:db8::1',
    '3fff::1',
    '3fff:0fff:ffff:ffff:ffff:ffff:ffff:ffff',
    'fc00::1',
    'fe80::1',
    'ff02::1',
  ]

  for (const address of unsafeAddresses) {
    const literalUrl = `https://${address.includes(':') ? `[${address}]` : address}/photo.png`
    await assert.rejects(
      loadSafeRemoteImage(literalUrl, {
        maxBytes: 100,
        resolver: async () => { throw new Error('literal addresses must not use DNS') },
        fetch: async () => { throw new Error('unsafe address reached fetch') },
      }),
      /public IP address/,
      `literal ${address}`,
    )

    await assert.rejects(
      loadSafeRemoteImage('https://images.example/photo.png', {
        maxBytes: 100,
        resolver: resolverFor({ 'images.example': [PUBLIC_ADDRESS, address] }),
        fetch: async () => { throw new Error('unsafe DNS answer reached fetch') },
      }),
      /public IP address/,
      `resolved ${address}`,
    )
  }
}

async function testValidatesEveryRedirectDestination() {
  let fetches = 0
  await assert.rejects(
    loadSafeRemoteImage('https://images.example/photo.png', {
      maxBytes: 100,
      resolver: resolverFor({
        'images.example': [PUBLIC_ADDRESS],
        'metadata.internal': ['169.254.169.254'],
      }),
      fetch: async () => {
        fetches += 1
        return new Response(null, {
          status: 302,
          headers: { location: 'https://metadata.internal/latest/meta-data' },
        })
      },
    }),
    /public IP address/,
  )
  assert.equal(fetches, 1)
}

async function testCancelsOversizedChunkedBodies() {
  let cancelled = false
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(6))
      controller.enqueue(new Uint8Array(6))
    },
    cancel() {
      cancelled = true
    },
  })

  await assert.rejects(
    loadSafeRemoteImage('https://images.example/photo.png', {
      maxBytes: 10,
      resolver: resolverFor({ 'images.example': [PUBLIC_ADDRESS] }),
      fetch: async () => new Response(body, { headers: { 'content-type': 'image/png' } }),
    }),
    /exceeds 10 bytes/,
  )
  assert.equal(cancelled, true)
}

async function testRejectsDeclaredOversizeAndNonImagesBeforeReading() {
  let cancellations = 0
  const unreadBody = () => new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(new Uint8Array([1]))
    },
    cancel() {
      cancellations += 1
    },
  })
  const resolver = resolverFor({ 'images.example': [PUBLIC_ADDRESS] })

  await assert.rejects(
    loadSafeRemoteImage('https://images.example/large.png', {
      maxBytes: 10,
      resolver,
      fetch: async () => new Response(unreadBody(), {
        headers: { 'content-type': 'image/png', 'content-length': '11' },
      }),
    }),
    /exceeds 10 bytes/,
  )
  await assert.rejects(
    loadSafeRemoteImage('https://images.example/not-image', {
      maxBytes: 10,
      resolver,
      fetch: async () => new Response(unreadBody(), {
        headers: { 'content-type': 'text/plain' },
      }),
    }),
    /image content type/,
  )
  assert.equal(cancellations, 2)
}

async function testReturnsPublicImageAndPassesVerifiedAddressesToFetch() {
  let receivedAddresses: string[] = []
  const result = await loadSafeRemoteImage('https://images.example/photo.png', {
    maxBytes: 100,
    resolver: resolverFor({ 'images.example': [PUBLIC_ADDRESS] }),
    fetch: async (_url, options) => {
      receivedAddresses = options.addresses.map(({ address }) => address)
      assert.equal(options.redirect, 'manual')
      return new Response(new Uint8Array([1, 2, 3]), {
        headers: { 'content-type': 'image/png; charset=binary' },
      })
    },
  })

  assert.deepEqual(receivedAddresses, [PUBLIC_ADDRESS])
  assert.deepEqual(result, {
    buffer: Buffer.from([1, 2, 3]),
    contentType: 'image/png',
    finalUrl: 'https://images.example/photo.png',
  })
}

async function testDoesNotExpandDocumentationRangePast3fffPrefix() {
  let fetches = 0
  await loadSafeRemoteImage('https://[3fff:1000::1]/photo.png', {
    maxBytes: 100,
    resolver: async () => { throw new Error('literal addresses must not use DNS') },
    fetch: async () => {
      fetches += 1
      return new Response(new Uint8Array([1]), {
        headers: { 'content-type': 'image/png' },
      })
    },
  })
  assert.equal(fetches, 1)
}

async function main() {
  await testRejectsNonHttpsUrlsBeforeDnsOrFetch()
  await testRejectsUnsafeLiteralAndResolvedAddresses()
  await testValidatesEveryRedirectDestination()
  await testCancelsOversizedChunkedBodies()
  await testRejectsDeclaredOversizeAndNonImagesBeforeReading()
  await testReturnsPublicImageAndPassesVerifiedAddressesToFetch()
  await testDoesNotExpandDocumentationRangePast3fffPrefix()
  console.log('safe remote image runtime tests passed')
}

void main()
