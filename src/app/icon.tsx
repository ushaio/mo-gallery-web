import { ImageResponse } from 'next/og'

export const size = {
  width: 256,
  height: 256,
}

export const contentType = 'image/png'

export default async function Icon() {
  const logoUrl = new URL('../../public/logo.png', import.meta.url).toString()
  const logo = await fetch(logoUrl).then((response) => response.arrayBuffer())
  const logoData = `data:image/png;base64,${Buffer.from(logo).toString('base64')}`

  return new ImageResponse(
    <img
      src={logoData}
      alt="MO Gallery"
      width={256}
      height={256}
      style={{ objectFit: 'contain' }}
    />,
    size,
  )
}
