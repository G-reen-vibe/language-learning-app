import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { QueryProvider } from "@/components/query-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Linguo — Language Learning",
  description: "Spaced repetition language learning app with SM-2 and FSRS-5 algorithms.",
  keywords: ["language learning", "spaced repetition", "SM-2", "FSRS-5", "flashcards"],
  authors: [{ name: "Linguo" }],
};

// Inline script to apply saved theme before paint (avoids flash of wrong theme).
// Must mirror the theme definitions in src/lib/themes.ts.
const themeInitScript = `
(function() {
  try {
    var t = localStorage.getItem('langlearn.theme');
    if (!t || t === 'default') return;
    var darkThemes = ['forest','ocean','berry','slate'];
    var themes = {
      forest: {"--background":"oklch(0.16 0.02 150)","--foreground":"oklch(0.92 0.02 150)","--card":"oklch(0.21 0.025 150)","--card-foreground":"oklch(0.92 0.02 150)","--popover":"oklch(0.21 0.025 150)","--popover-foreground":"oklch(0.92 0.02 150)","--primary":"oklch(0.65 0.18 150)","--primary-foreground":"oklch(0.12 0.02 150)","--secondary":"oklch(0.28 0.03 150)","--secondary-foreground":"oklch(0.92 0.02 150)","--muted":"oklch(0.26 0.02 150)","--muted-foreground":"oklch(0.7 0.03 150)","--accent":"oklch(0.28 0.03 150)","--accent-foreground":"oklch(0.92 0.02 150)","--destructive":"oklch(0.65 0.2 25)","--border":"oklch(0.3 0.02 150)","--input":"oklch(0.3 0.02 150)","--ring":"oklch(0.65 0.18 150)","--chart-1":"oklch(0.6 0.2 150)","--chart-2":"oklch(0.6 0.15 110)","--chart-3":"oklch(0.55 0.18 180)"},
      sunset: {"--background":"oklch(0.97 0.01 35)","--foreground":"oklch(0.2 0.02 35)","--card":"oklch(0.99 0.005 35)","--card-foreground":"oklch(0.2 0.02 35)","--popover":"oklch(0.99 0.005 35)","--popover-foreground":"oklch(0.2 0.02 35)","--primary":"oklch(0.58 0.22 35)","--primary-foreground":"oklch(0.98 0 0)","--secondary":"oklch(0.93 0.02 35)","--secondary-foreground":"oklch(0.25 0.03 35)","--muted":"oklch(0.94 0.015 35)","--muted-foreground":"oklch(0.5 0.03 35)","--accent":"oklch(0.9 0.05 35)","--accent-foreground":"oklch(0.25 0.05 35)","--border":"oklch(0.88 0.02 35)","--input":"oklch(0.9 0.02 35)","--ring":"oklch(0.58 0.22 35)","--chart-1":"oklch(0.65 0.25 35)","--chart-2":"oklch(0.6 0.2 15)","--chart-3":"oklch(0.7 0.18 60)"},
      ocean: {"--background":"oklch(0.15 0.02 230)","--foreground":"oklch(0.92 0.02 230)","--card":"oklch(0.2 0.025 230)","--card-foreground":"oklch(0.92 0.02 230)","--popover":"oklch(0.2 0.025 230)","--popover-foreground":"oklch(0.92 0.02 230)","--primary":"oklch(0.65 0.16 230)","--primary-foreground":"oklch(0.12 0.02 230)","--secondary":"oklch(0.27 0.03 230)","--secondary-foreground":"oklch(0.92 0.02 230)","--muted":"oklch(0.25 0.02 230)","--muted-foreground":"oklch(0.7 0.03 230)","--accent":"oklch(0.27 0.03 230)","--accent-foreground":"oklch(0.92 0.02 230)","--destructive":"oklch(0.65 0.2 25)","--border":"oklch(0.29 0.02 230)","--input":"oklch(0.29 0.02 230)","--ring":"oklch(0.65 0.16 230)","--chart-1":"oklch(0.6 0.2 230)","--chart-2":"oklch(0.55 0.18 200)","--chart-3":"oklch(0.6 0.15 260)"},
      berry: {"--background":"oklch(0.15 0.025 340)","--foreground":"oklch(0.92 0.02 340)","--card":"oklch(0.2 0.03 340)","--card-foreground":"oklch(0.92 0.02 340)","--popover":"oklch(0.2 0.03 340)","--popover-foreground":"oklch(0.92 0.02 340)","--primary":"oklch(0.62 0.22 340)","--primary-foreground":"oklch(0.12 0.02 340)","--secondary":"oklch(0.27 0.03 340)","--secondary-foreground":"oklch(0.92 0.02 340)","--muted":"oklch(0.25 0.025 340)","--muted-foreground":"oklch(0.7 0.03 340)","--accent":"oklch(0.27 0.03 340)","--accent-foreground":"oklch(0.92 0.02 340)","--destructive":"oklch(0.65 0.2 25)","--border":"oklch(0.29 0.025 340)","--input":"oklch(0.29 0.025 340)","--ring":"oklch(0.62 0.22 340)","--chart-1":"oklch(0.55 0.25 340)","--chart-2":"oklch(0.55 0.2 300)","--chart-3":"oklch(0.6 0.18 20)"},
      rose: {"--background":"oklch(0.97 0.01 15)","--foreground":"oklch(0.2 0.02 15)","--card":"oklch(0.99 0.005 15)","--card-foreground":"oklch(0.2 0.02 15)","--popover":"oklch(0.99 0.005 15)","--popover-foreground":"oklch(0.2 0.02 15)","--primary":"oklch(0.55 0.2 15)","--primary-foreground":"oklch(0.98 0 0)","--secondary":"oklch(0.93 0.02 15)","--secondary-foreground":"oklch(0.25 0.03 15)","--muted":"oklch(0.94 0.015 15)","--muted-foreground":"oklch(0.5 0.03 15)","--accent":"oklch(0.9 0.05 15)","--accent-foreground":"oklch(0.25 0.05 15)","--border":"oklch(0.88 0.02 15)","--input":"oklch(0.9 0.02 15)","--ring":"oklch(0.55 0.2 15)","--chart-1":"oklch(0.65 0.22 15)","--chart-2":"oklch(0.6 0.18 350)","--chart-3":"oklch(0.65 0.2 40)"},
      slate: {"--background":"oklch(0.18 0.01 250)","--foreground":"oklch(0.95 0.01 250)","--card":"oklch(0.23 0.015 250)","--card-foreground":"oklch(0.95 0.01 250)","--popover":"oklch(0.23 0.015 250)","--popover-foreground":"oklch(0.95 0.01 250)","--primary":"oklch(0.7 0.12 230)","--primary-foreground":"oklch(0.15 0.01 250)","--secondary":"oklch(0.3 0.02 250)","--secondary-foreground":"oklch(0.95 0.01 250)","--muted":"oklch(0.28 0.015 250)","--muted-foreground":"oklch(0.72 0.02 250)","--accent":"oklch(0.3 0.02 250)","--accent-foreground":"oklch(0.95 0.01 250)","--destructive":"oklch(0.65 0.2 25)","--border":"oklch(1 0 0 / 12%)","--input":"oklch(1 0 0 / 15%)","--ring":"oklch(0.7 0.12 230)"}
    };
    var vars = themes[t];
    if (vars) {
      var keys = [];
      for (var k in vars) { document.documentElement.style.setProperty(k, vars[k]); keys.push(k); }
      document.documentElement.setAttribute('data-theme-vars', keys.join(','));
    }
    if (darkThemes.indexOf(t) >= 0) {
      document.documentElement.classList.add('dark');
    }
    document.documentElement.setAttribute('data-theme', t);
  } catch(e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <QueryProvider>
          {children}
          <Toaster />
        </QueryProvider>
      </body>
    </html>
  );
}
