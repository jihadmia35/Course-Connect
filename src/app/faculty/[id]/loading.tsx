export default function LoadingFacultyProfile() {
  return (
    <div className="page-container" aria-busy="true" aria-label="Loading faculty profile">
      <h1>Loading faculty profile…</h1>
      <p className="muted">Getting courses, sections and schedules.</p>
      <div className="skeleton skeleton-toolbar" />
      <div className="finder-section-list">
        {Array.from({ length: 3 }, (_, i) => (
          <div className="skeleton skeleton-card" key={i} />
        ))}
      </div>
    </div>
  );
}
