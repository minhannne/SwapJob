import { useState } from 'react'

type Props = {
  src: string | null
  name: string
  large?: boolean
}

export default function Avatar({ src, name, large = false }: Props) {
  const [failedSource, setFailedSource] = useState<string | null>(null)
  const showImage = Boolean(src && src !== failedSource)

  return (
    <div className={`avatar${large ? ' avatar-large' : ''}`}>
      {showImage ? (
        <img
          src={src!}
          alt={`Ảnh đại diện của ${name}`}
          onError={() => setFailedSource(src)}
        />
      ) : (
        <span>{name.trim().slice(0, 1).toUpperCase() || '?'}</span>
      )}
    </div>
  )
}