import { seedFaceRows } from "./seed";

export default async function globalSetup(): Promise<void> {
  await seedFaceRows();
}
