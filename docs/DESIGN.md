# Student workspace redesign

The primary task is finding a section’s Messenger invite. The homepage is therefore the finder itself, rather than a promotional page above the directories.

## Main interaction paths

- Type `CSE361.9` on the homepage. The matching section and every available invite appear immediately. Joining requires one link click after entering the query, without a submit button or a details page.
- Open Courses and tap a section number. Its faculty, meetings, and invite actions appear inline. The course page remains in place.
- Open a faculty profile. Assigned sections include the same direct join and share actions.
- Share from a section. The semester, course, and section are already selected. A compact summary replaces three repeated selectors; students paste the invite. “Change class” exposes the selectors when needed.
- Save a section with its bookmark. Saved sections persist on this browser and remain isolated by the section’s semester-specific database identity. No account or server-side student profile is created. Storage failures are reported honestly.

All invite links receive equal treatment. Multiple groups remain visible together, with no ranking, primary-group selection, or membership claims.

## Layout and visual language

A compact persistent sidebar provides four primary destinations on desktop: Find a group, Courses, Faculty, and Saved sections. On phones these become a fixed bottom navigation, avoiding a menu-opening step. Administration and source details remain available outside the main student task.

The palette combines a warm neutral workspace, deep green navigation, white information surfaces, and muted orange for section identifiers and saved states. Green join actions use text labels as well as color. Content density favors readable class information over decorative cards or large marketing sections. Self-hosted DM Sans and Manrope avoid external font requests.

Search accepts course codes, full section identifiers, title words, faculty names, and initials. Explicit identifiers match section 9 precisely rather than accidentally including section 90. Semester, subject, and group-availability filters compose with the search. Keyboard users can focus search with `/` or Control/Command+K, clear it with Escape, and operate all actions with visible focus indicators. Dialogs retain Radix focus management.

The right-hand desktop column contains optional course shortcuts and saved classes. It disappears when space narrows; essential search, section-number shortcuts, and all join/share actions stay in the main content. Mobile controls use readable input text, touch targets, safe-area padding, and a scrollable dialog when needed. Motion respects the system’s reduced-motion preference.

## Phone and tablet refinements — 20 October 2026

On phones the finder keeps availability controls visible and moves semester/subject settings behind a labeled Filters disclosure. The active semester remains visible beside the search label. Pressing the keyboard’s Search/Enter key dismisses it without another navigation or submit step. Section shortcuts use a single horizontally scrollable row; the selected section stays visible.

Class information uses larger text and full-width invite actions. Primary phone controls have at least 44px touch targets. Sharing and editing open in bottom sheets with a separate scrollable body, a persistent header/close button, safe-area padding, and height tied to the visual viewport. Closing returns focus to the originating control. The bottom navigation hides when a reduced visual viewport indicates the software keyboard is open. Inputs remain 16px, and page zoom stays enabled.

Administration has its own navigation, a compact management picker, and labeled record cards on phones and narrow tablets. Desktop tables remain available on larger screens. Sign-in has a password visibility toggle and retains entered values when an error is returned. The public bottom navigation is omitted on the sign-in screen.

## Verification scope

Behavior is covered by search unit tests and browser scenarios for immediate results, exact section identifiers, sharing with a known class, course expansion, saved-section persistence, direct mobile navigation, empty states, and multiple viewport widths. A disposable PostgreSQL-compatible database exercises anonymous sharing, canonical URL duplicates, the existing-group warning, Submit Anyway, reports, and rate limiting. Browser checks of the actual imported catalog are read-only.

This design is based on the task requirements and observed navigation structure. It has not yet been evaluated in usability sessions with SEU students; it does not claim measured improvements in student completion time.
