export const DEFAULT_ZINE_FONT_FAMILY = 'sans-serif'
export const DEFAULT_ZINE_TEXT_FONT_FAMILY = 'serif'

interface ZineFontInfo {
  found: boolean
  family: string
  postscriptName: string
  url: string
}

export interface ZineFontResource {
  family: string
  fontFamily: string
  url: string
  hasGlyph: (codePoint: number) => boolean
}

export interface ZineFontRun {
  content: string
  fontFamily: string
}

export type ZineFontStack = readonly ZineFontResource[]

const familyRequests = new Map<string, Promise<ZineFontResource>>()
const fontResources = new Map<string, Promise<ZineFontResource>>()
const browserFonts = new Map<string, Promise<void>>()
const graphemeSegmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
const invisibleCharacter = /^[\r\n\p{Default_Ignorable_Code_Point}]$/u

export function normalizeZineFontFamily(fontFamily?: string) {
  return (fontFamily?.trim().replace(/^(['"])(.*)\1$/, '$2') || DEFAULT_ZINE_TEXT_FONT_FAMILY).toLowerCase()
}

function absoluteFontURL(path: string) {
  return new URL(path, typeof location === 'undefined' ? 'http://localhost/' : location.href)
}

function isZineFontInfo(value: unknown): value is ZineFontInfo {
  if (!value || typeof value !== 'object') return false
  const info = value as Record<string, unknown>
  return typeof info.found === 'boolean'
    && typeof info.family === 'string'
    && typeof info.postscriptName === 'string'
    && typeof info.url === 'string'
}

function errorDetail(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

async function fetchZineFont(fontFamily: string): Promise<ZineFontResource> {
  const metadataURL = absoluteFontURL(`/__zine/font-info?family=${encodeURIComponent(fontFamily)}`)
  let response: Response
  try {
    response = await fetch(metadataURL)
  } catch (error) {
    throw new Error(`无法读取字体「${fontFamily}」。请重新启动桌面客户端后重试。${errorDetail(error)}`)
  }
  if (!response.ok) {
    const detail = (await response.text()).trim()
    throw new Error(`字体「${fontFamily}」无法嵌入 PDF。请选择可嵌入的已安装字体。${detail}`)
  }
  const info: unknown = await response.json().catch(() => null)
  if (!isZineFontInfo(info)) {
    throw new Error('系统字体服务不可用。请在桌面客户端中重新打开项目后导出。')
  }
  if (!info.found) {
    throw new Error(`未安装字体「${fontFamily}」。请安装该字体并重新启动客户端，或在文本工具栏选择其他已安装字体。`)
  }
  const resourceURL = absoluteFontURL(info.url)
  const version = resourceURL.searchParams.get('v')
  if (resourceURL.origin !== metadataURL.origin || resourceURL.pathname !== '/__zine/font' || !version || !/^[\da-f]{64}$/i.test(version)) {
    throw new Error(`字体「${fontFamily}」返回了无效的字体资源。请重新启动客户端后重试。`)
  }
  let resource = fontResources.get(version)
  if (!resource) {
    resource = registerFontResource(info, resourceURL.href, version)
    fontResources.set(version, resource)
    void resource.catch(() => fontResources.delete(version))
  }
  return resource
}

async function registerFontResource(info: ZineFontInfo, url: string, version: string): Promise<ZineFontResource> {
  // Load the PDF engine lazily. Its parsed font also owns glyph coverage, so
  // preview and export cannot disagree about which fallback is needed.
  const { Font } = await import('@react-pdf/renderer')
  const fontFamily = `Zine-${version}`
  if (!Font.getRegisteredFonts()[fontFamily]) {
    Font.register({ family: fontFamily, src: url, fontWeight: 400, fontStyle: 'normal' })
  }
  try {
    await Font.load({ fontFamily })
    const data = Font.getFont({ fontFamily }).data
    if (!data || data.type === 'STANDARD' || typeof data.hasGlyphForCodePoint !== 'function') {
      throw new Error('字体未包含可嵌入的字形')
    }
    const hasGlyph = data.hasGlyphForCodePoint.bind(data)
    const layout = data.layout.bind(data)
    // textkit 6.3 selects fonts for LF/CR before removing them from a line.
    // Its Helvetica fallback leaves an empty, unembedded font run in the PDF.
    // Keep controls in this owned font and remove their .notdef advance so a
    // trailing line break cannot cause an extra wrap in a narrow text frame.
    data.hasGlyphForCodePoint = (codePoint: number) => codePoint === 10 || codePoint === 13 || hasGlyph(codePoint)
    data.layout = (...args: Parameters<typeof data.layout>) => {
      const run = layout(...args)
      const controls = typeof args[0] === 'string' ? args[0].match(/[\r\n]+$/)?.[0].length ?? 0 : 0
      for (let index = Math.max(0, run.positions.length - controls); index < run.positions.length; index++) {
        run.positions[index].xAdvance = 0
        run.positions[index].yAdvance = 0
      }
      return run
    }
    return { family: info.family, fontFamily, url, hasGlyph }
  } catch (error) {
    const source = Font.getFont({ fontFamily })
    if (!source.data) source.loadResultPromise = null
    throw new Error(`无法载入字体「${info.family}」的字形。请选择其他已安装字体。${errorDetail(error)}`)
  }
}

export function loadZineFont(fontFamily: string): Promise<ZineFontResource> {
  const key = normalizeZineFontFamily(fontFamily)
  let request = familyRequests.get(key)
  if (!request) {
    request = fetchZineFont(key)
    familyRequests.set(key, request)
    void request.catch(() => familyRequests.delete(key))
  }
  return request
}

function segments(content: string) {
  return Array.from(graphemeSegmenter.segment(content), ({ segment }) => segment)
}

function coversSegment(font: ZineFontResource, segment: string) {
  return Array.from(segment).every((character) => invisibleCharacter.test(character) || font.hasGlyph(character.codePointAt(0)!))
}

function describeMissingCharacters(fonts: ZineFontStack, content: string) {
  const characters = Array.from(new Set(Array.from(content).filter((character) => (
    !invisibleCharacter.test(character) && !fonts.some((font) => font.hasGlyph(character.codePointAt(0)!))
  ))))
  const display = (characters.length ? characters : Array.from(content)).slice(0, 8)
  return display.map((character) => `「${character}」(U+${character.codePointAt(0)!.toString(16).toUpperCase().padStart(4, '0')})`).join('、')
}

export async function loadZineFontStack(fontFamily: string, content: string): Promise<ZineFontStack> {
  const primary = await loadZineFont(fontFamily)
  const missing = segments(content).filter((segment) => !coversSegment(primary, segment))
  if (missing.length === 0) return [primary]

  const familyName = `${fontFamily} ${primary.family}`
  const serif = !/sans/i.test(familyName) && /serif|times|georgia|garamond|baskerville|cambria|simsun|songti|宋|明朝/i.test(familyName)
  let fallback: ZineFontResource
  try {
    fallback = await loadZineFont(serif ? '__zine-cjk-serif' : '__zine-cjk-sans')
  } catch {
    throw new Error(`字体「${fontFamily}」缺少 ${describeMissingCharacters([primary], missing.join(''))}，且没有可用的中文后备字体。请选择包含这些字符的已安装字体。`)
  }
  const stack = primary.fontFamily === fallback.fontFamily ? [primary] : [primary, fallback]
  const unsupported = missing.filter((segment) => !stack.some((font) => coversSegment(font, segment)))
  if (unsupported.length) {
    throw new Error(`字体「${fontFamily}」及中文后备字体缺少 ${describeMissingCharacters(stack, unsupported.join(''))}。请更换包含这些字符的字体，或修改文本。`)
  }
  return stack
}

export function getZineFontRuns(fonts: ZineFontStack, content: string): ZineFontRun[] {
  const runs: ZineFontRun[] = []
  for (const segment of segments(content.replace(/\r\n?/g, '\n'))) {
    const font = fonts.find((candidate) => coversSegment(candidate, segment))
    if (!font) {
      throw new Error(`文本含有当前字体无法显示的字符：${describeMissingCharacters(fonts, segment)}。请更换字体后重新导出。`)
    }
    const previous = runs[runs.length - 1]
    if (previous?.fontFamily === font.fontFamily) {
      previous.content += segment
    } else {
      runs.push({ content: segment, fontFamily: font.fontFamily })
    }
  }
  return runs
}

export function loadZineBrowserFont(font: ZineFontResource): Promise<void> {
  if (typeof document === 'undefined' || typeof FontFace === 'undefined') return Promise.resolve()
  let loaded = browserFonts.get(font.fontFamily)
  if (!loaded) {
    loaded = (async () => {
      const face = new FontFace(font.fontFamily, `url(${JSON.stringify(font.url)})`, { weight: '400', style: 'normal' })
      await face.load()
      document.fonts.add(face)
    })()
    browserFonts.set(font.fontFamily, loaded)
    void loaded.catch(() => browserFonts.delete(font.fontFamily))
  }
  return loaded
}
