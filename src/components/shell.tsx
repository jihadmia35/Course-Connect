'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import {
  BookOpen,
  Users,
  Search,
  Bookmark,
  ArrowUpRight,
  Plus,
  ShieldCheck,
  HelpCircle,
  MessageCircle,
  Layers,
  LayoutDashboard,
  Flag,
  ArrowLeft,
} from 'lucide-react';
const nav = [
  {
    href: '/',
    label: 'Find a group',
    mobile: 'Find groups',
    accessible: 'Find a group',
    icon: Search,
  },
  {
    href: '/courses',
    label: 'Courses',
    mobile: 'Courses',
    accessible: 'Course directory',
    icon: BookOpen,
  },
  {
    href: '/faculty',
    label: 'Faculty',
    mobile: 'Faculty',
    accessible: 'Faculty directory',
    icon: Users,
  },
  {
    href: '/saved',
    label: 'Saved sections',
    mobile: 'Saved',
    accessible: 'Saved sections',
    icon: Bookmark,
  },
];
const adminNav = [
  {
    href: '/admin',
    label: 'Overview',
    mobile: 'Overview',
    accessible: 'Admin overview',
    icon: LayoutDashboard,
  },
  {
    href: '/admin/faculty',
    label: 'Faculty',
    mobile: 'Faculty',
    accessible: 'Manage faculty',
    icon: Users,
  },
  {
    href: '/admin/courses',
    label: 'Courses',
    mobile: 'Courses',
    accessible: 'Manage courses',
    icon: BookOpen,
  },
  {
    href: '/admin/sections',
    label: 'Sections & schedules',
    mobile: 'Sections',
    accessible: 'Manage sections',
    icon: Layers,
  },
  {
    href: '/admin/groups',
    label: 'Messenger groups',
    mobile: 'Groups',
    accessible: 'Manage groups',
    icon: MessageCircle,
  },
  {
    href: '/admin/reports',
    label: 'Student reports',
    mobile: 'Reports',
    accessible: 'Manage reports',
    icon: Flag,
  },
];
function ViewportSync() {
  useEffect(() => {
    const viewport = window.visualViewport;
    const root = document.documentElement;
    function update() {
      root.style.setProperty(
        '--visual-viewport-height',
        `${viewport?.height ?? window.innerHeight}px`,
      );
      root.style.setProperty('--visual-viewport-offset-top', `${viewport?.offsetTop ?? 0}px`);
      root.toggleAttribute(
        'data-keyboard-open',
        window.innerWidth <= 760 &&
          window.innerHeight - (viewport?.height ?? window.innerHeight) > 120,
      );
    }
    update();
    viewport?.addEventListener('resize', update);
    viewport?.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      viewport?.removeEventListener('resize', update);
      viewport?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      root.style.removeProperty('--visual-viewport-height');
      root.style.removeProperty('--visual-viewport-offset-top');
      root.removeAttribute('data-keyboard-open');
    };
  }, []);
  return null;
}
export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname.startsWith('/admin');
  const isLogin = pathname === '/login';
  const navigation = isAdmin ? adminNav : nav;
  const mobileNavigation = isAdmin
    ? adminNav.filter((item) => !['/admin/courses', '/admin/sections'].includes(item.href))
    : nav;
  const active = (href: string) =>
    href === '/admin'
      ? pathname === '/admin'
      : href === '/'
        ? pathname === '/' || pathname.startsWith('/sections')
        : pathname.startsWith(href);
  return (
    <div className={`app-shell ${isLogin ? 'auth-shell' : ''} ${isAdmin ? 'admin-shell' : ''}`}>
      <ViewportSync />
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <aside className="workspace-sidebar">
        <Link prefetch={false} href="/" className="brand" aria-label="SEU Course Connect home">
          <span className="brand-mark">
            <Layers size={25} strokeWidth={2.2} />
          </span>
          <span>
            <strong>
              course<span>connect</span>
            </strong>
            <small>SOUTHEAST UNIVERSITY</small>
          </span>
        </Link>
        <div className="sidebar-caption">
          {isAdmin ? 'ADMINISTRATION WORKSPACE' : 'YOUR CAMPUS, CONNECTED'}
        </div>
        <nav className="primary-nav" aria-label="Main navigation">
          {navigation.map((item) => (
            <Link
              prefetch={false}
              href={item.href}
              aria-label={item.accessible}
              aria-current={active(item.href) ? 'page' : undefined}
              className={`nav-item ${active(item.href) ? 'active' : ''}`}
              key={item.href}
            >
              <item.icon size={19} />
              <span>{item.label}</span>
              {active(item.href) && <span className="nav-active-dot" />}
            </Link>
          ))}
        </nav>
        {!isAdmin && (
          <div className="sidebar-community">
            <span className="community-symbol">
              <MessageCircle size={22} />
            </span>
            <h3>
              Someone’s looking
              <br />
              for your class.
            </h3>
            <p>Have a group invite? Make it easier for them to join.</p>
            <Link prefetch={false} href="/submit">
              Share an invite <ArrowUpRight size={16} />
            </Link>
          </div>
        )}
        <div className="sidebar-bottom">
          <Link prefetch={false} href="/about">
            <HelpCircle size={17} />
            About this directory
          </Link>
          <Link prefetch={false} href={isAdmin ? '/' : '/admin'}>
            {isAdmin ? <ArrowLeft size={17} /> : <ShieldCheck size={17} />}
            {isAdmin ? 'Student portal' : 'Administration'}
          </Link>
          <p>
            An independent student resource.
            <br />
            Built for the SEU community.
          </p>
        </div>
      </aside>
      <div className="main-shell">
        <header className="workspace-topbar">
          <Link
            prefetch={false}
            href="/"
            className="mobile-brand"
            aria-label="SEU Course Connect home"
          >
            <span className="brand-mark">
              <Layers size={21} />
            </span>
            <strong>
              course<span>connect</span>
            </strong>
          </Link>
          <div className="campus-context">
            <span className="campus-monogram">SEU</span>
            <div>
              <strong>Southeast University</strong>
              <span>
                {isAdmin || isLogin ? 'Directory administration' : 'Student community workspace'}
              </span>
            </div>
          </div>
          <div className="topbar-right">
            {!isAdmin && !isLogin && (
              <span className="public-badge">
                <span className="status-dot" />
                No sign-in needed
              </span>
            )}
            {isAdmin || isLogin ? (
              <Link
                prefetch={false}
                className="button button-outline header-share portal-return"
                href="/"
              >
                <ArrowLeft size={17} />
                <span>Student portal</span>
              </Link>
            ) : (
              <Link prefetch={false} className="button button-primary header-share" href="/submit">
                <Plus size={17} />
                <span>Share a group</span>
              </Link>
            )}
          </div>
        </header>
        <main id="main">{children}</main>
        <footer className="page-footer">
          <span>Find your class. Bring your people.</span>
          <div className="footer-links">
            <Link prefetch={false} href="/about">
              Student-shared invites · About & sources <ArrowUpRight size={13} />
            </Link>
            <Link prefetch={false} href="/admin">
              Administration
            </Link>
          </div>
        </footer>
      </div>
      {!isLogin && (
        <nav
          className="bottom-nav"
          aria-label={isAdmin ? 'Mobile administration navigation' : 'Mobile navigation'}
        >
          {mobileNavigation.map((item) => (
            <Link
              prefetch={false}
              key={item.href}
              href={item.href}
              aria-label={item.accessible}
              aria-current={active(item.href) ? 'page' : undefined}
              className={active(item.href) ? 'active' : ''}
            >
              <item.icon size={21} />
              <span>{item.mobile}</span>
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
