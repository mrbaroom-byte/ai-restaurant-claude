/**
 * A tiny XML tree and a canonical serialiser.
 *
 * ZATCA hashes the *canonicalised* (C14N 1.1) form of the invoice. Rather than generate loose
 * XML and then run a canonicalisation pass over it — which is where most implementations get
 * their hash mismatches — we build a tree and serialise it in canonical form directly:
 *
 *   • no XML declaration, no comments, no processing instructions
 *   • empty elements written as `<a></a>`, never `<a/>`
 *   • namespace declarations only on the root, in prefix order
 *   • attributes sorted: default namespace, then prefixed namespaces, then attributes by name
 *   • text escapes `&`, `<`, `>` and CR; attribute values also escape `"`, TAB, LF and CR
 *
 * The one deviation from a general C14N implementation is that we never emit an element in a
 * namespace that was not declared at the root — the UBL invoice we produce has a fixed,
 * closed set of namespaces, so that is exhaustive for this document type.
 */

export interface XmlElement {
  name: string
  attrs?: Record<string, string | undefined>
  children?: XmlNode[]
  text?: string
}

export type XmlNode = XmlElement | null | undefined | false

export function el(name: string, attrs?: Record<string, string | undefined>, children?: XmlNode[]): XmlElement {
  return { name, attrs, children }
}

/** Leaf element with text content. Returns `null` when the value is absent, so callers can
 *  spread optional fields into a children array without a conditional at every site. */
export function leaf(name: string, value?: string | number | null, attrs?: Record<string, string | undefined>): XmlElement | null {
  if (value === undefined || value === null || value === '') return null
  return { name, attrs, text: String(value) }
}

export function escapeText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\r/g, '&#xD;')
}

export function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/"/g, '&quot;')
    .replace(/\t/g, '&#x9;')
    .replace(/\n/g, '&#xA;')
    .replace(/\r/g, '&#xD;')
}

function sortAttrs(attrs: Record<string, string | undefined>): [string, string][] {
  const entries = Object.entries(attrs).filter((e): e is [string, string] => e[1] !== undefined)
  const isNs = (k: string) => k === 'xmlns' || k.startsWith('xmlns:')
  return entries.sort((a, b) => {
    const [ka] = a
    const [kb] = b
    if (isNs(ka) !== isNs(kb)) return isNs(ka) ? -1 : 1
    if (isNs(ka) && isNs(kb)) {
      if (ka === 'xmlns') return -1
      if (kb === 'xmlns') return 1
    }
    return ka < kb ? -1 : ka > kb ? 1 : 0
  })
}

function isElement(node: XmlNode): node is XmlElement {
  return !!node && typeof node === 'object'
}

/** Canonical serialisation — this exact byte sequence is what gets hashed and signed. */
export function serialize(node: XmlElement): string {
  const attrs = node.attrs ? sortAttrs(node.attrs) : []
  const attrString = attrs.map(([k, v]) => ` ${k}="${escapeAttr(v)}"`).join('')
  const children = (node.children ?? []).filter(isElement)

  let inner = ''
  if (node.text !== undefined) inner = escapeText(node.text)
  else inner = children.map(serialize).join('')

  return `<${node.name}${attrString}>${inner}</${node.name}>`
}

/** Pretty form for the UI, for the stored copy a human may need to read, and for support. */
export function serializePretty(node: XmlElement, indent = 0): string {
  const pad = '    '.repeat(indent)
  const attrs = node.attrs ? sortAttrs(node.attrs) : []
  const attrString = attrs.map(([k, v]) => ` ${k}="${escapeAttr(v)}"`).join('')
  const children = (node.children ?? []).filter(isElement)

  if (node.text !== undefined) {
    return `${pad}<${node.name}${attrString}>${escapeText(node.text)}</${node.name}>`
  }
  if (children.length === 0) return `${pad}<${node.name}${attrString}></${node.name}>`

  const inner = children.map((c) => serializePretty(c, indent + 1)).join('\n')
  return `${pad}<${node.name}${attrString}>\n${inner}\n${pad}</${node.name}>`
}

/** Full document with declaration, for storage and for submission bodies. */
export function toDocument(node: XmlElement, pretty = false): string {
  const body = pretty ? serializePretty(node) : serialize(node)
  return `<?xml version="1.0" encoding="UTF-8"?>\n${body}`
}

/** Deep copy with a predicate-driven filter, used to strip elements before hashing. */
export function pruneTree(node: XmlElement, shouldRemove: (n: XmlElement) => boolean): XmlElement {
  const children = (node.children ?? [])
    .filter(isElement)
    .filter((c) => !shouldRemove(c))
    .map((c) => pruneTree(c, shouldRemove))
  return { name: node.name, attrs: node.attrs, text: node.text, children }
}

/** First descendant with the given qualified name. */
export function findElement(node: XmlElement, name: string): XmlElement | undefined {
  if (node.name === name) return node
  for (const child of (node.children ?? []).filter(isElement)) {
    const found = findElement(child, name)
    if (found) return found
  }
  return undefined
}

/** Text of the first descendant with the given qualified name. */
export function textOf(node: XmlElement, name: string): string | undefined {
  return findElement(node, name)?.text
}
