import Link from 'next/link';
export default function NotFound() {
  return (
    <div className="page-container">
      <div className="panel empty-state">
        <h1>That page isn’t in the directory.</h1>
        <p>The record may have been removed or the link may be incomplete.</p>
        <Link href="/" className="button button-primary">
          Back to overview
        </Link>
      </div>
    </div>
  );
}
