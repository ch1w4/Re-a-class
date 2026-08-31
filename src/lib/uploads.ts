import path from 'path';

export function getUploadRoot() {
  return process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');
}

export function getStudentNoteImageDir() {
  return path.join(getUploadRoot(), 'student-note-images');
}
