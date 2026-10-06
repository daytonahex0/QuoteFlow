import bcrypt from "bcryptjs";

let dummyHash: string | null = null;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string | null | undefined): Promise<boolean> {
  if (!hash) {
    // Spend comparable time so unknown accounts can't be detected by response timing.
    dummyHash ??= await bcrypt.hash("quoteflow-timing-guard", 12);
    await bcrypt.compare(password, dummyHash);
    return false;
  }
  return bcrypt.compare(password, hash);
}
