const invalidUsername = /[^A-Za-z0-9_-]/;

export function validUsername(username: string) {
  return username.length >= 3 && username.length <= 32 && !invalidUsername.test(username);
}

export function validPassword(password: string) {
  if (password.length < 10 || password.length > 256) return false;
  const length = Array.from(password).length;
  return length >= 10 && length <= 128;
}
