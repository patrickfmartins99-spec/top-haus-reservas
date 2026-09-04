// WhatsApp uses single asterisks for bold. Render only that formatting, never HTML.
export function MessageText({ text }: { text: string }) {
  return <>{text.split(/(\*[^*\n]+\*)/g).map((part, index) => part.startsWith('*') && part.endsWith('*') ? <strong key={index}>{part.slice(1, -1)}</strong> : part)}</>;
}
