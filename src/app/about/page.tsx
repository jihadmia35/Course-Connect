export const metadata = { title: 'About the source data' };
export default function About() {
  return (
    <div className="page-container prose-page">
      <span className="eyebrow">TRANSPARENT BY DESIGN</span>
      <h1>About this directory</h1>
      <div className="panel">
        <h2>The advising snapshot</h2>
        <p>
          The supplied UMS HTML contains 69 courses, 496 sections, 122 named faculty members, and
          805 listed class meetings (796 distinct). Thirteen sections have no named faculty. The
          source does not identify a semester, faculty department assignments, or faculty
          photographs. The owner confirmed that this snapshot belongs to Fall - 2026.
        </p>
        <p>
          Administrators must select Fall - 2026 when importing this file. The unconfigured preview
          labels these records as a source snapshot and cannot save group submissions. Faculty
          placeholders display source initials; they are not photographs.
        </p>
        <h2>Privacy and accuracy</h2>
        <p>
          The directory excludes the saved account owner’s name, student ID, personal advised
          sections, and personalized grades or retake annotations. It does not execute the original
          page’s scripts. Class schedules are interpreted in Asia/Dhaka time.
        </p>
        <h2>Student shared groups</h2>
        <p>
          Messenger invites are submitted by students. We do not access private Messenger APIs,
          verify membership, retrieve member counts, or rank groups. Please report broken,
          misassigned, or abusive invites.
        </p>
        <p>
          This is an independent student resource and does not claim official university
          affiliation.
        </p>
      </div>
    </div>
  );
}
