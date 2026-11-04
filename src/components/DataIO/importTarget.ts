/** Reads `?groupId=` from the project page's Import link. The server checks membership. */
export const parseImportGroupId = (value: string | string[] | undefined): number | null => {
  if ('string' !== typeof value || !/^[1-9]\d*$/.test(value)) {
    return null;
  }
  const groupId = Number(value);
  return Number.isSafeInteger(groupId) ? groupId : null;
};

export const initialImportTarget = (groupId: number | null) =>
  null === groupId
    ? { targetType: 'personal' as const, groupId: null }
    : { targetType: 'group' as const, groupId };
