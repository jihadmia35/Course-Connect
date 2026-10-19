'use client';
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <div className="page-container">
      <div className="panel empty-state">
        <h1>We couldn’t load the directory.</h1>
        <p>
          Please try again. If this continues, an administrator should check the database
          configuration.
        </p>
        <button className="button button-primary" onClick={reset}>
          Try again
        </button>
      </div>
    </div>
  );
}
