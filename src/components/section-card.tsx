'use client';
import Link from 'next/link';
import {
  Bookmark,
  Check,
  ArrowUpRight,
  Users,
  CalendarDays,
  MapPin,
  MessageCircle,
  ArrowRight,
} from 'lucide-react';
import type { Catalog, Meeting, SectionView } from '@/lib/types';
import { GroupDialog, ReportDialog } from './group-form';
import { useSavedSections } from './saved-sections';
function meetingGroups(meetings: Meeting[]) {
  const groups = new Map<
    string,
    { days: string[]; startTime: string; endTime: string; room: string }
  >();
  for (const m of meetings) {
    const key = `${m.startTime}|${m.endTime}|${m.room}`;
    const found = groups.get(key);
    if (found) {
      if (!found.days.includes(m.day)) found.days.push(m.day);
    } else
      groups.set(key, { days: [m.day], startTime: m.startTime, endTime: m.endTime, room: m.room });
  }
  return [...groups.values()];
}
export function SectionCard({
  section,
  catalog,
  showGroups = true,
}: {
  section: SectionView;
  catalog: Catalog;
  showGroups?: boolean;
}) {
  const course = catalog.courses.find((c) => c.id === section.courseId)!;
  const faculty = catalog.faculty.filter((f) => section.facultyIds.includes(f.id));
  const { ids, toggle } = useSavedSections();
  const saved = ids.includes(section.id);
  const label = `${course.code}.${section.number}`;
  const meetings = meetingGroups(section.schedules);
  return (
    <article
      className={`section-card ${section.groups.length ? 'has-groups' : ''}`}
      aria-label={label}
    >
      <div className="section-information">
        <div className="section-identity">
          <Link className="section-code" href={`/sections/${section.id}`}>
            {course.code}
            <span>.{section.number}</span>
          </Link>
          <span className="section-credit">
            {course.credits} {course.credits === 1 ? 'credit' : 'credits'}
          </span>
          <button
            className={`save-section icon-button ${saved ? 'is-saved' : ''}`}
            aria-label={`${saved ? 'Unsave' : 'Save'} ${label}`}
            aria-pressed={saved}
            title={saved ? 'Remove saved section' : 'Save on this device'}
            onClick={() => toggle(section.id)}
          >
            <Bookmark size={19} fill={saved ? 'currentColor' : 'none'} />
          </button>
        </div>
        <h3>{course.title}</h3>
        <div className="section-faculty">
          <Users size={15} />
          {faculty.length ? (
            faculty.map((f) => (
              <Link key={f.id} href={`/faculty/${f.id}?semester=${section.semesterId}`}>
                <strong>{f.initials}</strong>
                <span>{f.name}</span>
              </Link>
            ))
          ) : (
            <span>Faculty unassigned</span>
          )}
        </div>
        <div className="meetings">
          {meetings.length ? (
            meetings.map((meeting, i) => (
              <div key={i}>
                <CalendarDays size={14} />
                <span className="meeting-days">
                  {meeting.days.map((day) => day.charAt(0) + day.slice(1).toLowerCase()).join(', ')}
                </span>
                <span className="meeting-time">
                  {meeting.startTime}–{meeting.endTime}
                </span>
                <span className="meeting-room">
                  <MapPin size={13} />
                  <span>{meeting.room || 'Room not provided'}</span>
                </span>
              </div>
            ))
          ) : (
            <p className="muted">Schedule not provided</p>
          )}
        </div>
      </div>
      {showGroups && (
        <div className="section-connect">
          <div className={`connection-status ${section.groups.length ? 'available' : ''}`}>
            <span />
            {section.groups.length
              ? `${section.groups.length} group${section.groups.length === 1 ? '' : 's'} available`
              : 'No invite shared yet'}
          </div>
          {section.groups.length ? (
            <div className="inline-groups">
              {section.groups.map((group, i) => (
                <div className="inline-group" key={group.id}>
                  <a
                    className="button button-join"
                    href={group.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                  >
                    {section.groups.length > 1 ? `Join group ${i + 1}` : 'Join group'}
                    <ArrowUpRight size={16} />
                  </a>
                  <ReportDialog groupId={group.id} compact />
                </div>
              ))}
            </div>
          ) : (
            <p>Have the link? Help your classmates find it.</p>
          )}
          <GroupDialog
            catalog={catalog}
            sectionId={section.id}
            label={section.groups.length ? 'Add another invite' : 'Add group link'}
          />
        </div>
      )}
      <div className="section-card-footer">
        <Link href={`/sections/${section.id}`} className="text-link">
          View section <ArrowRight size={13} />
        </Link>
        {saved && (
          <span className="saved-note">
            <Check size={12} />
            Saved on this device
          </span>
        )}
        {section.groups.length > 0 && showGroups && (
          <span className="shared-note">
            <MessageCircle size={12} />
            Student-shared
          </span>
        )}
      </div>
    </article>
  );
}
