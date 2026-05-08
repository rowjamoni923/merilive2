import { getCurrentAdminId } from "@/utils/adminSession";

export const getAdminActorId = (): string | null => getCurrentAdminId();
