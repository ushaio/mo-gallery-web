import {
  decodePDFRawStream,
  PDFArray,
  PDFBool,
  PDFDict,
  PDFDocument,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFRawStream,
  PDFString,
} from 'pdf-lib'

import { getSpreadSize } from '@/lib/zine/page-sizes'
import { buildPrintPageSequence, CROP_MARK_AREA_MM, getProjectBleedMm } from '@/lib/zine/print'
import { getSrgbIccProfile } from '@/lib/zine/srgb-profile'
import type { PDFObject } from 'pdf-lib'
import type { ZineProject } from '@/lib/zine/types'

const POINTS_PER_MM = 72 / 25.4
const PAGE_SIZE_TOLERANCE_PT = 0.01

function invalidPdf(message: string): never {
  throw new Error(`Zine PDF: ${message}`)
}

function requireDictionary(value: PDFObject | undefined, location: string): PDFDict {
  if (!(value instanceof PDFDict)) invalidPdf(`${location} is missing or invalid.`)
  return value
}

function optionalDictionary(owner: PDFDict, key: string, location: string): PDFDict | undefined {
  const reference = owner.get(PDFName.of(key))
  return reference === undefined ? undefined : requireDictionary(owner.context.lookup(reference), location)
}

function requireStream(value: PDFObject | undefined, location: string): PDFRawStream {
  if (!(value instanceof PDFRawStream) || value.getContentsSize() === 0) invalidPdf(`${location} has no embedded data.`)
  return value
}

function numberValue(owner: PDFDict, key: string, location: string, fallback?: number): number {
  const value = owner.lookup(PDFName.of(key))
  if (value === undefined && fallback !== undefined) return fallback
  if (!(value instanceof PDFNumber) || !Number.isFinite(value.asNumber())) invalidPdf(`${location} has an invalid ${key}.`)
  return value.asNumber()
}

function decodedBytes(stream: PDFRawStream, location: string): Uint8Array {
  try {
    const bytes = decodePDFRawStream(stream).getBytes(0, false)
    if (!bytes.length) invalidPdf(`${location} has empty embedded data.`)
    return new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  } catch (cause) {
    throw new Error(`Zine PDF: ${location} has unreadable embedded data.`, { cause })
  }
}

function validateFont(font: PDFDict, location: string) {
  const subtype = font.lookup(PDFName.of('Subtype'))?.toString()
  if (subtype === '/Type0') {
    const descendants = font.lookup(PDFName.of('DescendantFonts'))
    if (!(descendants instanceof PDFArray) || descendants.size() !== 1) invalidPdf(`${location} has invalid descendant fonts.`)
    const descendant = requireDictionary(descendants.lookup(0), `${location} descendant`)
    const descendantType = descendant.lookup(PDFName.of('Subtype'))?.toString()
    if (descendantType !== '/CIDFontType0' && descendantType !== '/CIDFontType2') invalidPdf(`${location} has an invalid CID font.`)
    // The renderer's Unicode mapping must survive finalization as well as its glyphs.
    decodedBytes(requireStream(font.lookup(PDFName.of('ToUnicode')), `${location} Unicode map`), `${location} Unicode map`)
    font = descendant
  } else if (subtype !== '/TrueType' && subtype !== '/Type1' && subtype !== '/MMType1') {
    invalidPdf(`${location} uses an unsupported font type (${subtype ?? 'missing'}).`)
  }

  const descriptor = requireDictionary(font.lookup(PDFName.of('FontDescriptor')), `${location} font descriptor`)
  const programs = ['FontFile', 'FontFile2', 'FontFile3'].filter((key) => descriptor.has(PDFName.of(key)))
  if (programs.length !== 1) invalidPdf(`${location} must contain exactly one embedded font program.`)
  decodedBytes(requireStream(descriptor.lookup(PDFName.of(programs[0])), `${location} font program`), `${location} font program`)
}

function validateJpeg(stream: PDFRawStream, width: number, height: number, bits: number, components: number, location: string) {
  const bytes = stream.getContents()
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) invalidPdf(`${location} has invalid JPEG data.`)
  let offset = 2
  while (offset + 3 < bytes.length) {
    if (bytes[offset++] !== 0xff) break
    while (bytes[offset] === 0xff) offset++
    const marker = bytes[offset++]
    if (marker === 0xda || marker === 0xd9) break
    const length = (bytes[offset] << 8) | bytes[offset + 1]
    if (length < 2 || offset + length > bytes.length) break
    const isFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)
    if (isFrame && length >= 8) {
      const encodedBits = bytes[offset + 2]
      const encodedHeight = (bytes[offset + 3] << 8) | bytes[offset + 4]
      const encodedWidth = (bytes[offset + 5] << 8) | bytes[offset + 6]
      const encodedComponents = bytes[offset + 7]
      if (length !== 8 + 3 * encodedComponents) invalidPdf(`${location} has a malformed JPEG frame.`)
      if (encodedComponents === 4) invalidPdf(`${location} contains CMYK JPEG data; convert the original to sRGB before export.`)
      if (encodedWidth !== width || encodedHeight !== height || encodedBits !== bits || encodedComponents !== components) {
        invalidPdf(`${location} JPEG data does not match its PDF dimensions or color space.`)
      }
      return
    }
    offset += length
  }
  invalidPdf(`${location} has no readable JPEG frame.`)
}

function validateImageData(stream: PDFRawStream, width: number, height: number, bits: number, components: number, location: string) {
  const filter = stream.dict.lookup(PDFName.of('Filter'))
  const filterName = filter instanceof PDFArray && filter.size() === 1 ? filter.lookup(0)?.toString() : filter?.toString()
  if (filterName === '/DCTDecode') {
    validateJpeg(stream, width, height, bits, components, location)
    return
  }
  if (filter !== undefined && filterName !== '/FlateDecode') invalidPdf(`${location} uses an unexpected image encoding.`)

  const decodeParameters = stream.dict.lookup(PDFName.of('DecodeParms'))
  const parameters = decodeParameters instanceof PDFArray ? decodeParameters.lookup(0) : decodeParameters
  const dictionary = parameters === undefined ? undefined : requireDictionary(parameters, `${location} decode parameters`)
  const predictor = dictionary ? numberValue(dictionary, 'Predictor', location, 1) : 1
  if (![1, 2, 10, 11, 12, 13, 14, 15].includes(predictor)) invalidPdf(`${location} has an invalid image predictor.`)
  if (predictor !== 1 && dictionary && (
    numberValue(dictionary, 'Colors', location, 1) !== components
    || numberValue(dictionary, 'BitsPerComponent', location, 8) !== bits
    || numberValue(dictionary, 'Columns', location, 1) !== width
  )) invalidPdf(`${location} has inconsistent image decode parameters.`)

  const rowBytes = Math.ceil(width * components * bits / 8) + (predictor >= 10 ? 1 : 0)
  const bytes = decodedBytes(stream, location)
  if (bytes.length !== rowBytes * height) invalidPdf(`${location} pixel data does not match its PDF dimensions.`)
  if (predictor >= 10) {
    for (let row = 0; row < height; row++) {
      if (bytes[row * rowBytes] > 4) invalidPdf(`${location} contains an invalid PNG prediction row.`)
    }
  }
}

function finalizeResources(document: PDFDocument, profileBytes: Uint8Array) {
  const { context } = document
  const profile = context.register(context.flateStream(profileBytes, { N: 3, Alternate: 'DeviceRGB' }))
  const srgb = context.obj(['ICCBased', profile])
  const visitedResources = new Set<PDFDict>()
  const validatedFonts = new Set<PDFDict>()
  const validatedImages = new Set<PDFRawStream>()
  const activeImages = new Set<PDFRawStream>()

  function colorSpace(value: PDFObject | undefined, resources: PDFDict, location: string, depth = 0): { space: PDFObject; components: number } {
    if (depth > 8) invalidPdf(`${location} contains a circular color space.`)
    if (value instanceof PDFName) {
      const name = value.asString()
      if (name === '/DeviceRGB') return { space: srgb, components: 3 }
      if (name === '/DeviceGray') return { space: value, components: 1 }
      if (name === '/DeviceCMYK') invalidPdf(`${location} is CMYK; convert the original to sRGB before export.`)
      const colors = optionalDictionary(resources, 'ColorSpace', `${location} color resources`)
      const resolved = colors?.lookup(value)
      if (resolved !== undefined) return colorSpace(resolved, resources, location, depth + 1)
    }
    if (value instanceof PDFArray) {
      const name = value.lookup(0)?.toString()
      if (name === '/ICCBased' && value.size() === 2) {
        const embeddedProfile = requireStream(value.lookup(1), `${location} ICC profile`)
        const components = numberValue(embeddedProfile.dict, 'N', location)
        if (components === 4) invalidPdf(`${location} has a CMYK ICC profile; convert the original to sRGB before export.`)
        const bytes = decodedBytes(embeddedProfile, `${location} ICC profile`)
        if (components !== 3 || bytes.length !== profileBytes.length || !bytes.every((byte, index) => byte === profileBytes[index])) {
          invalidPdf(`${location} has an unexpected ICC profile; normalize the source to sRGB before export.`)
        }
        return { space: srgb, components: 3 }
      }
      if (name === '/Indexed' && value.size() === 4) {
        const base = colorSpace(value.lookup(1), resources, location, depth + 1)
        if (base.space instanceof PDFArray && base.space.lookup(0)?.toString() === '/Indexed') invalidPdf(`${location} has a nested indexed color space.`)
        const maximum = value.lookup(2)
        const palette = value.lookup(3)
        const paletteBytes = palette instanceof PDFRawStream ? decodedBytes(palette, `${location} palette`)
          : palette instanceof PDFString || palette instanceof PDFHexString ? palette.asBytes() : undefined
        if (!(maximum instanceof PDFNumber) || !Number.isInteger(maximum.asNumber()) || maximum.asNumber() < 0 || maximum.asNumber() > 255
          || !paletteBytes || paletteBytes.length < (maximum.asNumber() + 1) * base.components) {
          invalidPdf(`${location} has an invalid indexed color palette.`)
        }
        return { space: context.obj(['Indexed', base.space, maximum, value.get(3)]), components: 1 }
      }
    }
    invalidPdf(`${location} has a missing or unsupported color space.`)
  }

  function visitImage(stream: PDFRawStream, resources: PDFDict, location: string, mask: 'soft' | 'stencil' | null = null) {
    const { dict } = stream
    if (dict.lookup(PDFName.of('Subtype'))?.toString() !== '/Image') invalidPdf(`${location} is not an image resource.`)
    const width = numberValue(dict, 'Width', location)
    const height = numberValue(dict, 'Height', location)
    if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0) invalidPdf(`${location} has invalid image dimensions.`)
    const imageMask = dict.lookup(PDFName.of('ImageMask'))
    if (imageMask !== undefined && !(imageMask instanceof PDFBool)) invalidPdf(`${location} has an invalid image mask flag.`)
    const isStencil = imageMask === PDFBool.True
    const bits = numberValue(dict, 'BitsPerComponent', location, isStencil ? 1 : undefined)
    if (![1, 2, 4, 8, 16].includes(bits)) invalidPdf(`${location} has an invalid image bit depth.`)
    const sourceColorSpace = dict.lookup(PDFName.of('ColorSpace'))
    if (isStencil && (bits !== 1 || sourceColorSpace !== undefined)) invalidPdf(`${location} has an invalid stencil mask.`)
    const color = isStencil ? null : colorSpace(sourceColorSpace, resources, location)
    if (mask === 'soft' && (isStencil || color?.space.toString() !== '/DeviceGray')) invalidPdf(`${location} must be a grayscale soft mask.`)
    if (mask === 'stencil' && !isStencil) invalidPdf(`${location} must be a stencil mask.`)
    if (validatedImages.has(stream)) return
    if (activeImages.has(stream)) invalidPdf(`${location} has a circular image mask.`)
    activeImages.add(stream)

    validateImageData(stream, width, height, bits, color?.components ?? 1, location)
    if (color) dict.set(PDFName.of('ColorSpace'), color.space)
    const decode = dict.lookup(PDFName.of('Decode'))
    if (decode !== undefined && (!(decode instanceof PDFArray) || decode.size() !== (color?.components ?? 1) * 2
      || !decode.asArray().every((item) => item instanceof PDFNumber && Number.isFinite(item.asNumber())))) {
      invalidPdf(`${location} has an invalid image decode array.`)
    }
    const softMaskReference = dict.get(PDFName.of('SMask'))
    if (softMaskReference !== undefined) visitImage(requireStream(context.lookup(softMaskReference), `${location} soft mask`), resources, `${location} soft mask`, 'soft')
    const stencilMaskReference = dict.get(PDFName.of('Mask'))
    const stencilMask = context.lookup(stencilMaskReference)
    if (stencilMask instanceof PDFArray) {
      if (stencilMask.size() !== (color?.components ?? 1) * 2
        || !stencilMask.asArray().every((item) => item instanceof PDFNumber && Number.isInteger(item.asNumber()) && item.asNumber() >= 0 && item.asNumber() < 2 ** bits)) {
        invalidPdf(`${location} has an invalid color-key mask.`)
      }
    } else if (stencilMaskReference !== undefined) {
      visitImage(requireStream(stencilMask, `${location} mask`), resources, `${location} mask`, 'stencil')
    }
    activeImages.delete(stream)
    validatedImages.add(stream)
  }

  function visitForm(stream: PDFRawStream, resources: PDFDict, location: string) {
    if (stream.dict.lookup(PDFName.of('Subtype'))?.toString() !== '/Form') invalidPdf(`${location} is not a form resource.`)
    const ownResources = optionalDictionary(stream.dict, 'Resources', `${location} resources`)
    const formResources = ownResources ?? resources
    const group = optionalDictionary(stream.dict, 'Group', `${location} transparency group`)
    const groupColorSpace = group?.lookup(PDFName.of('CS'))
    if (group && groupColorSpace !== undefined) group.set(PDFName.of('CS'), colorSpace(groupColorSpace, formResources, location).space)
    // A form without its own resource dictionary uses its caller's resources.
    if (ownResources) visitResources(ownResources, location)
  }

  function visitResources(resources: PDFDict, location: string) {
    if (visitedResources.has(resources)) return
    visitedResources.add(resources)
    const colors = optionalDictionary(resources, 'ColorSpace', `${location} color resources`) ?? context.obj({})
    colors.set(PDFName.of('DefaultRGB'), srgb)
    resources.set(PDFName.of('ColorSpace'), colors)

    const fonts = optionalDictionary(resources, 'Font', `${location} fonts`)
    for (const [name, reference] of fonts?.entries() ?? []) {
      const font = requireDictionary(context.lookup(reference), `${location} font ${name}`)
      if (validatedFonts.has(font)) continue
      validateFont(font, `${location} font ${name}`)
      validatedFonts.add(font)
    }
    const xObjects = optionalDictionary(resources, 'XObject', `${location} XObjects`)
    for (const [name, reference] of xObjects?.entries() ?? []) {
      const objectLocation = `${location} ${name}`
      const stream = requireStream(context.lookup(reference), objectLocation)
      const subtype = stream.dict.lookup(PDFName.of('Subtype'))?.toString()
      if (subtype === '/Image') visitImage(stream, resources, objectLocation)
      else if (subtype === '/Form') visitForm(stream, resources, objectLocation)
      else invalidPdf(`${objectLocation} has an unsupported XObject type.`)
    }
    const states = optionalDictionary(resources, 'ExtGState', `${location} graphics states`)
    for (const [name, reference] of states?.entries() ?? []) {
      const stateLocation = `${location} ${name}`
      const state = requireDictionary(context.lookup(reference), stateLocation)
      const mask = state.lookup(PDFName.of('SMask'))
      if (mask === undefined || mask.toString() === '/None') continue
      const maskDictionary = requireDictionary(mask, `${stateLocation} soft mask`)
      visitForm(requireStream(maskDictionary.lookup(PDFName.of('G')), `${stateLocation} soft-mask form`), resources, stateLocation)
    }
  }

  document.getPages().forEach((page, index) => {
    const resources = page.node.Resources() ?? context.obj({})
    page.node.set(PDFName.of('Resources'), resources)
    visitResources(resources, `page ${index + 1}`)
    const group = optionalDictionary(page.node, 'Group', `page ${index + 1} transparency group`)
    const groupColorSpace = group?.lookup(PDFName.of('CS'))
    if (group && groupColorSpace !== undefined) group.set(PDFName.of('CS'), colorSpace(groupColorSpace, resources, `page ${index + 1}`).space)
  })
}

/** Finalize renderer output whose image samples have already been normalized to sRGB. */
export async function finalizeZinePdf(blob: Blob, project: ZineProject, variant: 'spread' | 'print'): Promise<Blob> {
  const document = await PDFDocument.load(await blob.arrayBuffer(), { updateMetadata: false, throwOnInvalidObject: true })
  const expectedPages = variant === 'print' ? buildPrintPageSequence(project).length : project.spreads.length
  if (!expectedPages || document.getPageCount() !== expectedPages) invalidPdf('The exported page count does not match the project.')
  const { pageW, pageH, spreadW, spreadH } = getSpreadSize(project.pageSize, project.pageOrientation, project.customSizeMm)
  const bleed = variant === 'print' ? getProjectBleedMm(project) : 0
  const marks = variant === 'print' ? CROP_MARK_AREA_MM : 0
  const trimWidth = (variant === 'print' ? pageW : spreadW) * POINTS_PER_MM
  const trimHeight = (variant === 'print' ? pageH : spreadH) * POINTS_PER_MM
  const trimInset = (marks + bleed) * POINTS_PER_MM
  const bleedInset = marks * POINTS_PER_MM
  const mediaWidth = trimWidth + trimInset * 2
  const mediaHeight = trimHeight + trimInset * 2
  if (![trimWidth, trimHeight, mediaWidth, mediaHeight].every((value) => Number.isFinite(value) && value > 0)) invalidPdf('The project has invalid page dimensions.')

  document.getPages().forEach((page, index) => {
    const media = page.getMediaBox()
    if (Math.abs(media.width - mediaWidth) > PAGE_SIZE_TOLERANCE_PT || Math.abs(media.height - mediaHeight) > PAGE_SIZE_TOLERANCE_PT
      || media.x !== 0 || media.y !== 0 || page.getRotation().angle !== 0 || numberValue(page.node, 'UserUnit', `page ${index + 1}`, 1) !== 1) {
      invalidPdf(`Page ${index + 1} dimensions do not match the project; its content cannot be safely retagged.`)
    }
    page.setMediaBox(0, 0, mediaWidth, mediaHeight)
    page.setCropBox(0, 0, mediaWidth, mediaHeight)
    page.setTrimBox(trimInset, trimInset, trimWidth, trimHeight)
    page.setBleedBox(bleedInset, bleedInset, mediaWidth - bleedInset * 2, mediaHeight - bleedInset * 2)
  })
  finalizeResources(document, getSrgbIccProfile())
  // Do not regenerate appearances or overwrite existing Info/XMP metadata.
  const bytes = await document.save({ addDefaultPage: false, updateFieldAppearances: false })
  return new Blob([new Uint8Array(bytes)], { type: 'application/pdf' })
}
