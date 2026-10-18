import fs from 'node:fs/promises';
import path from 'node:path';

/** Archivio oggetti. L'implementazione locale salva su disco; sostituibile con S3/R2 mantenendo l'interfaccia. */
export interface ObjectStorage {
  put(key: string, data: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<void>;
}

export class DiskStorage implements ObjectStorage {
  constructor(private root: string) {}

  private resolve(key: string) {
    if (!/^[a-z0-9/_.-]+$/i.test(key) || key.includes('..')) throw new Error('Chiave di storage non valida');
    return path.join(this.root, key);
  }

  async put(key: string, data: Buffer) {
    const file = this.resolve(key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, data);
  }

  async get(key: string) {
    try {
      return await fs.readFile(this.resolve(key));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw err;
    }
  }

  async delete(key: string) {
    await fs.rm(this.resolve(key), { force: true });
  }
}
