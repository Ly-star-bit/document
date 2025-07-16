import { createSignal } from 'ranuts/utils';

interface DocumentState {
  fileName: string;
  file?: File;
  url?: string | URL;
  s3Key?: string;
}

let currentFile: File | undefined;

export const [getDocmentObj, setDocmentObj] = createSignal<DocumentState>({
  fileName: '',
  get file() {
    return currentFile;
  },
  set file(value: File | undefined) {
    currentFile = value;
  },
  url: undefined,
  s3Key: undefined,
});
