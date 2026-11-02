import { statementTableProblem } from './statementColumns';

const HEADERS = ['Date', 'Description', 'Amount'];
const ROW = ['2026-01-15', 'NETFLIX.COM', '-15.99'];

describe('statementTableProblem', () => {
  describe('files with nothing to scan', () => {
    it('should call a file with no headers or rows empty', () => {
      expect(statementTableProblem({ headers: [], rows: [] })).toBe('empty_file');
    });

    it('should call a file with only headers empty', () => {
      expect(statementTableProblem({ headers: HEADERS, rows: [] })).toBe('empty_file');
    });

    it('should call a file with only blank rows empty', () => {
      expect(statementTableProblem({ headers: HEADERS, rows: [['', ' ', '']] })).toBe('empty_file');
    });
  });

  describe('files that are not statements', () => {
    it('should reject plain text, which has too few columns to ever map', () => {
      expect(
        statementTableProblem({
          headers: ['this is not a spreadsheet'],
          rows: [['j@#$ %^&*( 12 3'], ['~~~ just text ~~~']],
        }),
      ).toBe('not_statement');
    });

    it('should reject binary data with a .csv name', () => {
      expect(
        statementTableProblem({
          headers: ['\u0001��', '�\u0002', '�'],
          rows: [['��\u0003', 'ab', '��']],
        }),
      ).toBe('not_statement');
    });
  });

  describe('real statements', () => {
    it('should accept date, description and amount columns', () => {
      expect(statementTableProblem({ headers: HEADERS, rows: [ROW] })).toBeNull();
    });

    it('should tolerate one badly encoded character', () => {
      expect(
        statementTableProblem({
          headers: HEADERS,
          rows: [['2026-01-15', 'Caf� de la Gare, Dublin', '-4.50'], ROW, ROW],
        }),
      ).toBeNull();
    });
  });
});
