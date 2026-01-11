/**
 * Privacy Strip Utility
 * 
 * Removes GPS/location data from images before upload.
 * This utility preserves other EXIF data like camera settings, date taken, etc.
 */

// GPS-related EXIF tags to remove (IFD GPS tags)
const GPS_TAGS_TO_REMOVE = [
  'GPSVersionID',
  'GPSLatitudeRef',
  'GPSLatitude',
  'GPSLongitudeRef',
  'GPSLongitude',
  'GPSAltitudeRef',
  'GPSAltitude',
  'GPSTimeStamp',
  'GPSSatellites',
  'GPSStatus',
  'GPSMeasureMode',
  'GPSDOP',
  'GPSSpeedRef',
  'GPSSpeed',
  'GPSTrackRef',
  'GPSTrack',
  'GPSImgDirectionRef',
  'GPSImgDirection',
  'GPSMapDatum',
  'GPSDestLatitudeRef',
  'GPSDestLatitude',
  'GPSDestLongitudeRef',
  'GPSDestLongitude',
  'GPSDestBearingRef',
  'GPSDestBearing',
  'GPSDestDistanceRef',
  'GPSDestDistance',
  'GPSProcessingMethod',
  'GPSAreaInformation',
  'GPSDateStamp',
  'GPSDifferential',
  'GPSHPositioningError',
]

/**
 * Strips GPS/location data from a JPEG image while preserving other EXIF data.
 * For non-JPEG images, returns the original file unchanged.
 * 
 * @param file - The image file to process
 * @returns A new File with GPS data removed (for JPEG) or the original file
 */
export async function stripGpsData(file: File): Promise<File> {
  // Only process JPEG images (EXIF is primarily in JPEG)
  if (!file.type.includes('jpeg') && !file.type.includes('jpg')) {
    return file
  }

  try {
    const arrayBuffer = await file.arrayBuffer()
    const dataView = new DataView(arrayBuffer)
    
    // Check for JPEG magic number
    if (dataView.getUint16(0) !== 0xFFD8) {
      return file
    }

    // Find and process EXIF data
    const strippedBuffer = await removeGpsFromJpeg(arrayBuffer)
    
    if (strippedBuffer) {
      return new File([strippedBuffer], file.name, {
        type: file.type,
        lastModified: Date.now(),
      })
    }
    
    return file
  } catch (error) {
    console.warn('Failed to strip GPS data, returning original file:', error)
    return file
  }
}

/**
 * Removes GPS IFD from JPEG EXIF data
 */
async function removeGpsFromJpeg(buffer: ArrayBuffer): Promise<ArrayBuffer | null> {
  const data = new Uint8Array(buffer)
  let offset = 2 // Skip SOI marker
  
  while (offset < data.length - 1) {
    // Check for marker
    if (data[offset] !== 0xFF) {
      offset++
      continue
    }
    
    const marker = data[offset + 1]
    
    // End of image
    if (marker === 0xD9) break
    
    // APP1 marker (EXIF)
    if (marker === 0xE1) {
      const segmentLength = (data[offset + 2] << 8) | data[offset + 3]
      
      // Check for "Exif\0\0" identifier
      if (
        data[offset + 4] === 0x45 && // E
        data[offset + 5] === 0x78 && // x
        data[offset + 6] === 0x69 && // i
        data[offset + 7] === 0x66 && // f
        data[offset + 8] === 0x00 &&
        data[offset + 9] === 0x00
      ) {
        // Found EXIF segment, process it
        const exifStart = offset + 10 // Start of TIFF header
        const processedExif = processExifSegment(data, exifStart, segmentLength - 8)
        
        if (processedExif) {
          // Rebuild the JPEG with modified EXIF
          const newBuffer = new Uint8Array(buffer.byteLength)
          
          // Copy everything before EXIF segment
          newBuffer.set(data.subarray(0, offset + 4), 0)
          
          // Write "Exif\0\0"
          newBuffer.set([0x45, 0x78, 0x69, 0x66, 0x00, 0x00], offset + 4)
          
          // Write processed EXIF
          newBuffer.set(processedExif, offset + 10)
          
          // Update segment length
          const newSegmentLength = processedExif.length + 8
          newBuffer[offset + 2] = (newSegmentLength >> 8) & 0xFF
          newBuffer[offset + 3] = newSegmentLength & 0xFF
          
          // Copy rest of the file
          const restStart = offset + 2 + segmentLength
          const newRestStart = offset + 10 + processedExif.length
          newBuffer.set(data.subarray(restStart), newRestStart)
          
          // Trim to actual size
          const actualSize = newRestStart + (data.length - restStart)
          return newBuffer.buffer.slice(0, actualSize)
        }
      }
    }
    
    // Skip to next marker
    if (marker >= 0xD0 && marker <= 0xD9) {
      // Standalone markers (RST, SOI, EOI)
      offset += 2
    } else {
      // Markers with length
      const length = (data[offset + 2] << 8) | data[offset + 3]
      offset += 2 + length
    }
  }
  
  return null
}

/**
 * Process EXIF segment to remove GPS IFD
 */
function processExifSegment(
  data: Uint8Array,
  exifStart: number,
  exifLength: number
): Uint8Array | null {
  try {
    // Copy EXIF data to work with
    const exifData = data.slice(exifStart, exifStart + exifLength)
    const view = new DataView(exifData.buffer, exifData.byteOffset, exifData.byteLength)
    
    // Determine byte order
    const byteOrder = view.getUint16(0)
    const littleEndian = byteOrder === 0x4949 // "II" = Intel = little endian
    
    // Verify TIFF magic number
    if (view.getUint16(2, littleEndian) !== 0x002A) {
      return null
    }
    
    // Get IFD0 offset
    const ifd0Offset = view.getUint32(4, littleEndian)
    
    // Process IFD0 to find and nullify GPS IFD pointer
    const numEntries = view.getUint16(ifd0Offset, littleEndian)
    
    for (let i = 0; i < numEntries; i++) {
      const entryOffset = ifd0Offset + 2 + i * 12
      const tag = view.getUint16(entryOffset, littleEndian)
      
      // GPS IFD Pointer tag (0x8825)
      if (tag === 0x8825) {
        // Zero out the GPS IFD pointer value
        // This effectively removes the GPS data reference
        view.setUint32(entryOffset + 8, 0, littleEndian)
        
        // Also zero out the GPS IFD data if we can find it
        const gpsIfdOffset = view.getUint32(entryOffset + 8, littleEndian)
        if (gpsIfdOffset > 0 && gpsIfdOffset < exifData.length - 2) {
          const gpsNumEntries = view.getUint16(gpsIfdOffset, littleEndian)
          // Zero out GPS IFD entries
          for (let j = 0; j < gpsNumEntries && gpsIfdOffset + 2 + j * 12 + 12 <= exifData.length; j++) {
            const gpsEntryOffset = gpsIfdOffset + 2 + j * 12
            // Zero out each GPS entry
            for (let k = 0; k < 12; k++) {
              exifData[gpsEntryOffset + k] = 0
            }
          }
        }
        
        break
      }
    }
    
    return exifData
  } catch (error) {
    console.warn('Error processing EXIF segment:', error)
    return null
  }
}

/**
 * Strips GPS data from multiple files
 * 
 * @param files - Array of files to process
 * @param onProgress - Optional progress callback
 * @returns Array of processed files
 */
export async function stripGpsDataBatch(
  files: File[],
  onProgress?: (current: number, total: number) => void
): Promise<File[]> {
  const results: File[] = []
  
  for (let i = 0; i < files.length; i++) {
    results.push(await stripGpsData(files[i]))
    onProgress?.(i + 1, files.length)
  }
  
  return results
}

/**
 * Check if a file likely contains GPS data
 * This is a quick check, not a full parse
 * 
 * @param file - The file to check
 * @returns true if GPS data might be present
 */
export async function mightContainGpsData(file: File): Promise<boolean> {
  if (!file.type.includes('jpeg') && !file.type.includes('jpg')) {
    return false
  }

  try {
    // Read first 64KB which should contain EXIF
    const slice = file.slice(0, 65536)
    const buffer = await slice.arrayBuffer()
    const data = new Uint8Array(buffer)
    
    // Look for GPS IFD tag (0x8825) in the data
    // This is a simplified check
    for (let i = 0; i < data.length - 1; i++) {
      // Check for GPS IFD tag in both byte orders
      if ((data[i] === 0x88 && data[i + 1] === 0x25) ||
          (data[i] === 0x25 && data[i + 1] === 0x88)) {
        return true
      }
    }
    
    return false
  } catch {
    return false
  }
}