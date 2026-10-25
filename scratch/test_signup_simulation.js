// Inspect what happens when signUp email confirmation is required:
// data.session is null!
// data.user is created in auth.users, BUT client has NO active session/token.
// Therefore, auth.uid() is NULL when the insert/upsert to public.profiles executes!
// With auth.uid() = NULL, RLS check (auth.uid() = id) evaluates to FALSE (42501 permission denied).
console.log("RLS check (auth.uid() = id) fails when email confirmation is enabled because auth.uid() is null at registration time.");
