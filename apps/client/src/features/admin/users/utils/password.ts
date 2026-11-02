const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;

type PasswordLengthProblem = "short" | "long";

export function getPasswordLengthProblem(password: string): PasswordLengthProblem | null {
  if (password.length < PASSWORD_MIN_LENGTH) return "short";
  if (password.length > PASSWORD_MAX_LENGTH) return "long";
  return null;
}
