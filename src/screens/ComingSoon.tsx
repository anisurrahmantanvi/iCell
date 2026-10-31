export function ComingSoon({ title, note }: { title: string; note: string }) {
  return (
    <section className="soon" aria-label={`${title} (coming soon)`}>
      <span className="soon__badge">Coming soon</span>
      <h2>{title}</h2>
      <p>{note}</p>
    </section>
  )
}
