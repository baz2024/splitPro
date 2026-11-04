import { initialImportTarget, parseImportGroupId } from './importTarget';

describe('parseImportGroupId', () => {
  it('should read a positive whole number', () => {
    expect(parseImportGroupId('42')).toBe(42);
  });

  it('should ignore anything else', () => {
    const invalid = [undefined, '', '0', '-1', '1.5', 'abc', ['1', '2'], '99999999999999999'];
    invalid.forEach((value) => {
      expect(parseImportGroupId(value)).toBeNull();
    });
  });
});

describe('initialImportTarget', () => {
  it('should preselect the project when one is given', () => {
    expect(initialImportTarget(42)).toEqual({ targetType: 'group', groupId: 42 });
  });

  it('should default to personal without a project', () => {
    expect(initialImportTarget(null)).toEqual({ targetType: 'personal', groupId: null });
  });
});
