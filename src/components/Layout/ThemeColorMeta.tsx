import { useTheme } from 'next-themes';
import Head from 'next/head';
import React from 'react';

/** Keeps the browser/PWA status bar colour in step with the active theme background. */
export const ThemeColorMeta: React.FC = () => {
  const { resolvedTheme } = useTheme();

  return (
    <Head>
      <meta
        key="theme-color"
        name="theme-color"
        content={'light' === resolvedTheme ? '#f2f5f9' : '#0b1626'}
      />
    </Head>
  );
};
