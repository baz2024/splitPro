import Document, { type DocumentContext, Head, Html, Main, NextScript } from 'next/document';
import { getLocaleDirection } from '~/utils/i18n/client';

interface Props {
  locale: string;
}

/**
 * Renders `lang` and `dir` on <html> on the server so right-to-left locales
 * (Arabic, Hebrew, ...) are laid out correctly on first paint.
 */
class AppDocument extends Document<Props> {
  static async getInitialProps(ctx: DocumentContext) {
    const initialProps = await Document.getInitialProps(ctx);
    const locale = !ctx.locale || 'default' === ctx.locale ? 'en' : ctx.locale;
    return { ...initialProps, locale };
  }

  render() {
    const { locale } = this.props;
    return (
      <Html lang={locale} dir={getLocaleDirection(locale)}>
        <Head />
        <body>
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}

export default AppDocument;
