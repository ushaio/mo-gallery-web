import assert from 'node:assert/strict'
import {
  parseMediaEmbedInfo,
  parseMediaEmbedInfoByProvider,
} from '@mo-gallery/tiptap-editor'

function runTest(name: string, callback: () => void) {
  try {
    callback()
    console.log(`PASS ${name}`)
  } catch (error) {
    console.error(`FAIL ${name}`)
    throw error
  }
}

runTest('normalizes arbitrary iframe html into a generic media embed', () => {
  const embedInfo = parseMediaEmbedInfo(
    '<iframe src="//player.bilibili.com/player.html?isOutside=true&aid=116458961116662&bvid=BV19co5BMEme&cid=37780193669&p=1" scrolling="no" border="0" frameborder="no" framespacing="0" allowfullscreen="true"></iframe>',
  )

  assert.ok(embedInfo)
  assert.equal(embedInfo.provider, undefined)
  assert.equal(
    embedInfo.src,
    'https://player.bilibili.com/player.html?isOutside=true&aid=116458961116662&bvid=BV19co5BMEme&cid=37780193669&p=1',
  )
  assert.equal(embedInfo.scrolling, 'no')
  assert.equal(embedInfo.border, '0')
  assert.equal(embedInfo.frameBorder, 'no')
  assert.equal(embedInfo.frameSpacing, '0')
  assert.equal(embedInfo.allowFullScreen, true)
})

runTest('converts spotify links into official embed data', () => {
  const embedInfo = parseMediaEmbedInfo('https://open.spotify.com/track/11dFghVXANMlKmJXsNCbNl')

  assert.ok(embedInfo)
  assert.equal(embedInfo.provider, 'spotify')
  assert.equal(embedInfo.url, 'https://open.spotify.com/track/11dFghVXANMlKmJXsNCbNl')
  assert.equal(
    embedInfo.src,
    'https://open.spotify.com/embed/track/11dFghVXANMlKmJXsNCbNl?utm_source=generator',
  )
  assert.equal(embedInfo.height, '152')
  assert.equal(embedInfo.frameBorder, '0')
  assert.equal(embedInfo.allowFullScreen, true)
})

runTest('converts netease links into official embed data', () => {
  const embedInfo = parseMediaEmbedInfo('https://music.163.com/#/song?id=191232')

  assert.ok(embedInfo)
  assert.equal(embedInfo.provider, 'netease')
  assert.equal(embedInfo.url, 'https://music.163.com/#/song?id=191232')
  assert.equal(
    embedInfo.src,
    'https://music.163.com/outchain/player?type=2&id=191232&auto=0&height=66',
  )
  assert.equal(embedInfo.height, '86')
  assert.equal(embedInfo.frameBorder, '0')
})

runTest('supports provider-specific parsing for historical provider plus url content', () => {
  const embedInfo = parseMediaEmbedInfoByProvider('spotify', 'spotify:track:11dFghVXANMlKmJXsNCbNl')

  assert.ok(embedInfo)
  assert.equal(embedInfo.provider, 'spotify')
  assert.equal(embedInfo.url, 'https://open.spotify.com/track/11dFghVXANMlKmJXsNCbNl')
  assert.equal(
    embedInfo.src,
    'https://open.spotify.com/embed/track/11dFghVXANMlKmJXsNCbNl?utm_source=generator',
  )
})
