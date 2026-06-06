export type FieldTraceUserRole = "admin" | "boss" | "terrain" | "sse";

export type FieldTraceUser = {
  id: string;
  label: string;
  role: FieldTraceUserRole;
};

export const FIELDTRACE_USERS: FieldTraceUser[] = [
  { id: "william-bourget", label: "William Bourget", role: "admin" },
  { id: "gaetan-soredi", label: "Gaëtan SOREDI", role: "boss" },
  { id: "sullivan-avril", label: "Sullivan Avril", role: "terrain" },
  { id: "caroline-thebaud", label: "Caroline Thebaud", role: "sse" },
];

export const DEFAULT_FIELDTRACE_USER_ID = "gaetan-soredi";
export const FIELDTRACE_USER_STORAGE_KEY = "fieldtrace:current-user";

export function getFieldTraceUser(userId: string) {
  return (
    FIELDTRACE_USERS.find((user) => user.id === userId) ||
    FIELDTRACE_USERS.find((user) => user.id === DEFAULT_FIELDTRACE_USER_ID) ||
    FIELDTRACE_USERS[0]
  );
}
