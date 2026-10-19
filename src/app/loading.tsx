export default function Loading() {
  return (
    <div className="page-container" aria-busy="true" aria-label="Loading directory">
      <div className="skeleton skeleton-heading" />
      <div className="skeleton skeleton-toolbar" />
      <div className="finder-section-list">
        {Array.from({ length: 4 }, (_, i) => (
          <div className="skeleton skeleton-card" key={i} />
        ))}
      </div>
    </div>
  );
}
