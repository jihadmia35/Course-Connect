'use client';
export default function FacultyProfileError({ reset }: { reset: () => void }) {
  return (
    <div className="page-container">
      <div className="panel empty-state">
        <h1>We couldn’t load this faculty profile.</h1>
        <p>The directory is temporarily unavailable. Try again in a moment.</p>
        <button type="button" className="button button-primary" onClick={reset}>
          Try again
        </button>
        <button
          type="button"
          className="text-link invite-help"
          onClick={() => window.location.reload()}
        >
          Reload page
        </button>
      </div>
    </div>
  );
}
