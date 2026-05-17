import { deleteFaceRows } from "./seed";

export default async function globalTeardown(): Promise<void> {
  await deleteFaceRows();
}
