import fs from 'node:fs';

export function getDirectoryStatus(path: string) {
  let dirFiles;
  try {
    dirFiles = fs.readdirSync(path);
  } catch(error) {
    const { code } = error as NodeJS.ErrnoException;
    if (code === 'ENOENT') {
      // Directory does not exist, so it is available
      return 'available';
    }
    if (code === 'ENOTDIR') {
      return 'not-directory';
    }
    return 'other-error';
  }
  if (dirFiles.length > 0) {
    return 'not-empty';
  }

  return 'empty';
}
