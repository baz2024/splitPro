import { useTheme } from 'next-themes';
import { Toaster as Sonner } from 'sonner';

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  // Follow the app's Light/Dark/System choice; resolvedTheme turns "system" into the actual
  // scheme. Before next-themes mounts it is undefined, so fall back to the dark default.
  const { resolvedTheme } = useTheme();
  const theme: ToasterProps['theme'] = 'light' === resolvedTheme ? 'light' : 'dark';

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      // Sonner reads these variables for its normal toasts; map them to the app tokens so toasts
      // sit on the themed overlay surface instead of sonner's stock white / near-black.
      style={
        {
          '--normal-bg': 'var(--overlay)',
          '--normal-text': 'var(--overlay-foreground)',
          '--normal-border': 'var(--border)',
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast:
            'group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg',
          description: 'group-[.toast]:text-muted-foreground',
          actionButton: 'group-[.toast]:bg-primary group-[.toast]:text-primary-foreground',
          cancelButton: 'group-[.toast]:bg-muted group-[.toast]:text-muted-foreground',
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
