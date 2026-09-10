/**
 * LittleCMS 2.19 built-in sRGB ICC v4.4 profile, generated with Pillow 12.3.0.
 * Its copyright tag reads: "No copyright, use freely".
 * This is an RGB source profile, not a printer/output profile.
 *
 * Regenerate the 588 bytes (normalizing the creation date for reproducibility):
 *   from PIL import ImageCms
 *   import base64, struct
 *   data = bytearray(ImageCms.ImageCmsProfile(ImageCms.createProfile('sRGB')).tobytes())
 *   data[24:36] = struct.pack('>6H', 2026, 9, 6, 0, 0, 0)
 *   print(base64.b64encode(data).decode())
 * SHA-256: 3f6523cfe6f31a2c8330a9a2d762f0d38fa55e2c9972598208e74873d93a3411
 */
const SRGB_ICC_BASE64 = 'AAACTGxjbXMEQAAAbW50clJHQiBYWVogB+oACQAGAAAAAAAAYWNzcE1TRlQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPbWAAEAAAAA0y1sY21zAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAALZGVzYwAAAQgAAAA2Y3BydAAAAUAAAABMd3RwdAAAAYwAAAAUY2hhZAAAAaAAAAAsclhZWgAAAcwAAAAUYlhZWgAAAeAAAAAUZ1hZWgAAAfQAAAAUclRSQwAAAggAAAAgZ1RSQwAAAggAAAAgYlRSQwAAAggAAAAgY2hybQAAAigAAAAkbWx1YwAAAAAAAAABAAAADGVuVVMAAAAaAAAAHABzAFIARwBCACAAYgB1AGkAbAB0AC0AaQBuAABtbHVjAAAAAAAAAAEAAAAMZW5VUwAAADAAAAAcAE4AbwAgAGMAbwBwAHkAcgBpAGcAaAB0ACwAIAB1AHMAZQAgAGYAcgBlAGUAbAB5WFlaIAAAAAAAAPbWAAEAAAAA0y1zZjMyAAAAAAABDEIAAAXe///zJQAAB5MAAP2Q///7of///aIAAAPcAADAblhZWiAAAAAAAABvoAAAOPUAAAOQWFlaIAAAAAAAACSfAAAPhAAAtsNYWVogAAAAAAAAYpcAALeHAAAY2XBhcmEAAAAAAAMAAAACZmYAAPKnAAANWQAAE9AAAApbY2hybQAAAAAAAwAAAACj1wAAVHsAAEzNAACZmgAAJmYAAA9c'

export function getSrgbIccProfile(): Uint8Array {
  return Uint8Array.from(atob(SRGB_ICC_BASE64), (character) => character.charCodeAt(0))
}
