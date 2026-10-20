import katex from 'katex'
import { useMemo } from 'react'

function preprocessFractions(tex: string): string {
  return tex.replace(/\d+(?:\/\d+)+/g, (chain) => {
    const parts = chain.split('/')
    if (parts.length !== 2) return chain
    return `\\frac{${parts[0]}}{${parts[1]}}`
  })
}

interface MathSegment {
  kind: 'text' | 'math'
  value: string
  display: boolean
}

function tokenize(text: string): MathSegment[] {
  const segments: MathSegment[] = []
  const pattern = /\$\$([\s\S]+?)\$\$|\$([^$]+?)\$/g
  let lastIndex = 0
  let match = pattern.exec(text)
  while (match !== null) {
    if (match.index > lastIndex) {
      segments.push({ kind: 'text', value: text.slice(lastIndex, match.index), display: false })
    }
    const display = match[1] !== undefined
    segments.push({ kind: 'math', value: (display ? match[1] : match[2]) ?? '', display })
    lastIndex = match.index + match[0].length
    match = pattern.exec(text)
  }
  if (lastIndex < text.length) {
    segments.push({ kind: 'text', value: text.slice(lastIndex), display: false })
  }
  return segments
}

function KatexSegment({ tex, displayMode }: { tex: string; displayMode: boolean }) {
  const html = useMemo(
    () =>
      katex.renderToString(preprocessFractions(tex.trim()), {
        throwOnError: false,
        displayMode,
      }),
    [tex, displayMode],
  )
  return <span dangerouslySetInnerHTML={{ __html: html }} />
}

interface MathTextProps {
  text: string
  className?: string
}

export function MathText({ text, className }: MathTextProps) {
  const segments = useMemo(() => tokenize(text), [text])
  return (
    <span className={className}>
      {segments.map((segment, index) =>
        segment.kind === 'math' ? (
          <KatexSegment key={index} tex={segment.value} displayMode={segment.display} />
        ) : (
          <span key={index}>{segment.value}</span>
        ),
      )}
    </span>
  )
}
