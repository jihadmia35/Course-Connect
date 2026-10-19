import type { Metadata, Viewport } from 'next';
import { Toaster } from 'sonner';
import { Shell } from '@/components/shell';
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/manrope';
import './globals.css';
export const metadata: Metadata = {
  title: {
    default: 'SEU Course Connect — Find your course community',
    template: '%s · SEU Course Connect',
  },
  description:
    'Find Southeast University faculty, course sections, class schedules, and student-shared Messenger groups.',
};
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  interactiveWidget: 'resizes-visual',
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Shell>{children}</Shell>
        <Toaster theme="light" richColors position="top-right" />
      </body>
    </html>
  );
}
