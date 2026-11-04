/** @jest-environment node */

import { saveText } from './transfer';

describe('saveText', () => {
  afterEach(() => {
    jest.restoreAllMocks();
    Reflect.deleteProperty(globalThis, 'window');
    Reflect.deleteProperty(globalThis, 'document');
  });

  describe('inside the mobile app', () => {
    it('should hand the file to the native bridge instead of downloading it', async () => {
      const postMessage = jest.fn();
      const createObjectURL = jest.spyOn(URL, 'createObjectURL');
      Object.assign(globalThis, { window: { ReactNativeWebView: { postMessage } } });

      await saveText('a,b\n1,é', 'report.csv', 'text/csv;charset=utf-8');

      expect(postMessage).toHaveBeenCalledTimes(1);
      const message = JSON.parse(postMessage.mock.calls[0][0] as string) as {
        type: string;
        fileName: string;
        mimeType: string;
        base64: string;
      };
      expect(message).toMatchObject({ type: 'file-download', fileName: 'report.csv' });
      expect(message.mimeType).toContain('text/csv');
      expect(Buffer.from(message.base64, 'base64').toString('utf8')).toBe('a,b\n1,é');
      expect(createObjectURL).not.toHaveBeenCalled();
    });
  });

  describe('in a browser', () => {
    it('should download the file through a link', async () => {
      jest.useFakeTimers();
      const link = { click: jest.fn(), remove: jest.fn(), style: {} } as {
        click: jest.Mock;
        remove: jest.Mock;
        style: Record<string, string>;
        download?: string;
      };
      const appendChild = jest.fn();
      Object.assign(globalThis, {
        window: {},
        document: { createElement: () => link, body: { appendChild } },
      });
      jest.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
      jest.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);

      await saveText('a,b', 'report.csv', 'text/csv');

      expect(link.download).toBe('report.csv');
      expect(appendChild).toHaveBeenCalledWith(link);
      expect(link.click).toHaveBeenCalledTimes(1);
      jest.useRealTimers();
    });
  });
});
