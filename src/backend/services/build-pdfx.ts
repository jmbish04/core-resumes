
    // NOTE: This export registers remote font files from jsDelivr via Font.register().
// For locked-down or offline production environments, self-host these fonts or switch to built-in fonts.

import { Font } from '@react-pdf/renderer';

const FONT_CDN = 'https://cdn.jsdelivr.net/npm/@fontsource';

function fontSrc(
  pkg: string,
  family: string,
  weight: number,
  style: 'normal' | 'italic' = 'normal'
): string {
  return `${FONT_CDN}/${pkg}@4/files/${family}-latin-${weight}-${style}.woff`;
}

Font.register({
  family: 'Roboto',
  fonts: [
      { src: fontSrc('roboto', 'roboto', 400, 'normal'), fontWeight: 400 },
      { src: fontSrc('roboto', 'roboto', 400, 'italic'), fontWeight: 400, fontStyle: 'italic' },
      { src: fontSrc('roboto', 'roboto', 500, 'normal'), fontWeight: 500 },
      { src: fontSrc('roboto', 'roboto', 700, 'normal'), fontWeight: 700 }
  ],
});

interface PdfxTheme {
  name: string;
  primitives: {
    typography: Record<string, number>;
    spacing: Record<string | number, number>;
    fontWeights: { regular: number; medium: number; semibold: number; bold: number };
    lineHeights: { tight: number; normal: number; relaxed: number };
    borderRadius: { none: number; sm: number; md: number; lg: number; full: number };
    letterSpacing: { tight: number; normal: number; wide: number; wider: number };
  };
  colors: {
    foreground: string;
    background: string;
    muted: string;
    mutedForeground: string;
    primary: string;
    primaryForeground: string;
    border: string;
    accent: string;
    destructive: string;
    success: string;
    warning: string;
    info: string;
  };
  typography: {
    body: { fontFamily: string; fontSize: number; lineHeight: number };
    heading: {
      fontFamily: string;
      fontWeight: number;
      lineHeight: number;
      fontSize: { h1: number; h2: number; h3: number; h4: number; h5: number; h6: number };
    };
  };
  spacing: {
    page: { marginTop: number; marginRight: number; marginBottom: number; marginLeft: number };
    sectionGap: number;
    paragraphGap: number;
    componentGap: number;
  };
  page: {
    size: 'A4' | 'LETTER' | 'LEGAL';
    orientation: 'portrait' | 'landscape';
  };
}

export const theme: PdfxTheme = {
  name: "modern",
  primitives: {
    typography: {
      xs: 10,
      sm: 12,
      base: 15,
      lg: 18,
      xl: 22,
      '2xl': 28,
      '3xl': 36,
    },
    spacing: {
      0: 0,
      0.5: 2,
      1: 4,
      2: 8,
      3: 12,
      4: 16,
      5: 20,
      6: 24,
      8: 32,
      10: 40,
      12: 48,
      16: 64,
    },
    fontWeights: {
      regular: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
    },
    lineHeights: {
      tight: 1.2,
      normal: 1.4,
      relaxed: 1.6,
    },
    borderRadius: {
      none: 0,
      sm: 2,
      md: 4,
      lg: 8,
      full: 9999,
    },
    letterSpacing: {
      tight: -0.025,
      normal: 0,
      wide: 0.025,
      wider: 0.05,
    },
  },
  colors: {
    foreground: "#0f172a",
    background: "#ffffff",
    muted: "#f1f5f9",
    mutedForeground: "#64748b",
    primary: "#334155",
    primaryForeground: "#ffffff",
    border: "#e2e8f0",
    accent: "#6366f1",
    destructive: "#ef4444",
    success: "#22c55e",
    warning: "#f59e0b",
    info: "#3b82f6",
  },
  typography: {
    body: {
      fontFamily: "Roboto",
      fontSize: 11,
      lineHeight: 1.6,
    },
    heading: {
      fontFamily: "Roboto",
      fontWeight: 600,
      lineHeight: 1.25,
      fontSize: {
        h1: 28,
        h2: 22,
        h3: 18,
        h4: 16,
        h5: 14,
        h6: 12,
      },
    },
  },
  spacing: {
    page: {
      marginTop: 40,
      marginRight: 40,
      marginBottom: 40,
      marginLeft: 40,
    },
    sectionGap: 24,
    paragraphGap: 10,
    componentGap: 12,
  },
  page: {
    size: "LETTER",
    orientation: "portrait",
  },
};
