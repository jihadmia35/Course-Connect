import { MessageCircle } from 'lucide-react';
import { getCatalog } from '@/lib/catalog';
import { GroupDialog } from '@/components/group-form';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Share a group link' };
export default async function Submit() {
  const data = await getCatalog();
  return (
    <div className="page-container">
      <div className="breadcrumb">
        Student portal <span>/</span> Share a group link
      </div>
      <div className="submit-layout">
        <div>
          <span className="eyebrow">A SMALL LINK. A BIG CONNECTION.</span>
          <h1>
            Bring your
            <br />
            class together<span className="heading-dot">.</span>
          </h1>
          <p className="intro-copy">
            Help students from every batch find the people in their course section.
          </p>
          <ol className="submit-steps">
            <li>
              <span>1</span>
              <div>
                <h3>Choose your class</h3>
                <p>Select the semester, course, and section from your advising.</p>
              </div>
            </li>
            <li>
              <span>2</span>
              <div>
                <h3>Copy your Messenger invite</h3>
                <p>Open your group in Messenger and copy its invite link.</p>
              </div>
            </li>
            <li>
              <span>3</span>
              <div>
                <h3>Make the connection</h3>
                <p>Share it here so everyone in your section can find it.</p>
              </div>
            </li>
          </ol>
          <div className="submit-benefit">
            <MessageCircle size={23} />
            <div>
              <h3>Already a group for your section?</h3>
              <p>You can join an existing group or share a different invite. No account needed.</p>
            </div>
          </div>
        </div>
        <div className="panel submit-panel">
          <h2>Share a Messenger group</h2>
          <p className="muted">Choose your course section and paste the invite.</p>
          <GroupDialog catalog={data} fullPage />
        </div>
      </div>
    </div>
  );
}
