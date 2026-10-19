# Supplied UMS source analysis

Inspected file: `/home/jihadmia/Downloads/UMS - naim.html` (1,839,600 bytes). Reference screenshot: supplied dark-theme Advising Table screen. The original visual reference was used during initial development. At the owner’s request, the interface now uses an independent student workspace with instant section search, direct group actions, browser-local saved sections, and responsive side/bottom navigation. The source remains the authority for advising data; unrelated UMS functionality is excluded.

The complete file contains 10,293 divs, 9 script elements, 5 images, and no table elements. It is the serialized DOM of an Angular application: scripts originally loaded data dynamically, but the offered rows are already present in the saved file. The scripts refer to external Angular bundles, analytics, and local saved assets; the importer never executes or fetches them. The faculty images requested by the new app are not in this file. Existing images are university branding and the logged-in student's account imagery, which are not repurposed as faculty photos.

## Extraction inventory

| Attribute                          | Interpretation                                                              |
| ---------------------------------- | --------------------------------------------------------------------------- |
| `ACT141.1`, etc.                   | Split the final dot: course code `ACT141`, section identifier `1`           |
| Title                              | Course-level title, whitespace normalized                                   |
| Credits                            | Course-level decimal number                                                 |
| `[FZC] Dr. Faieza Chowdhury`, etc. | Faculty initials and full name; allow multiple assignments                  |
| Available                          | Snapshot seat availability, not an enrollment guarantee                     |
| `SUN # 08:30 ~ 09:50 @ SEU516`     | Separate meeting: weekday, local start/end, room                            |
| Additional day/time/room lines     | Additional meetings for the same section                                    |
| Advising type + letter grade       | Personalized saved-user eligibility/grade information, excluded             |
| Note                               | Privately retained source note; never interpreted as global advising policy |
| Semester                           | Absent in file; owner confirmed Fall - 2026                                 |
| Faculty department                 | Absent; optional manual assignment                                          |
| Faculty photograph                 | Absent; optional manual upload                                              |

All 496 offered records parse without invalid rows or duplicate section identifiers. There are 69 unique course codes, 122 unique faculty initials, and 805 listed meetings (796 distinct). Credits and names are preserved as source values, without expanding initials or inferring departments from course prefixes. `data/advising-snapshot.json` enumerates every extracted course, faculty, section, seat count, room, and meeting. `tests/fixtures/advising.html` preserves only the sanitized offered rows for repeatable parser/import tests.

Sections with missing faculty: CSE343.1, CSE343.2, CSE343.3, CSE359.6, CSE359.7, CSE381.1, CSE381.2, ECO461.7, ENG102.3, ENG103.5, ENG105.10, MGT281.4, MGT281.5.

There is no source semester, academic year, published course-to-department mapping, capacity, verified faculty contact information, Messenger URL, or faculty photograph to import. The application does not invent these. The owner explicitly confirmed **Fall - 2026** during implementation. The snapshot uses that confirmation; it does not infer the term from the October 2026 save timestamp.

The separate Advised Sections grid and personal account name/student ID do not describe a public course catalog and are intentionally excluded. Course title tooltips duplicate offered titles. Personal retake/grade labels are not imported into course or section entities. Unknown malformed faculty/schedule text is reported as invalid instead of silently dropped. Scripts, templates, iframes, objects, SVGs, and style nodes are removed from the parse tree. Extracted text is validated and rendered through React escaping, never through `dangerouslySetInnerHTML`.

## Relationships

A course is independent of semester. A semester offers many course sections. A section belongs to one course and one semester. The teaching assignment table permits more than one faculty per section; the source's current named rows have one faculty each. Meetings belong to sections and can have different days, times, or rooms. Faculty and courses may optionally belong to manually managed departments. Messenger invites and reports belong to the concrete semester-specific section, never just a reusable course code.

## Repeated source meetings

Nine sections repeat an identical meeting line twice: CSE264.6, CSE264.12, CSE264.15, CSE376.6, CSE444.8, CSE444.11, CSE444.12, EEE242.13, EEE242.14. The source snapshot retains all 805 listed lines for provenance. The preview and importer deduplicate these to 796 distinct meetings, and import summaries include `duplicateMeetings: 9`. No distinct day, time, or room is dropped.
