/// Compile-time environment configuration.
///
/// Override at build time with:
/// `flutter run --dart-define-from-file=env.json`
/// (see `env.example.json`). Defaults point at the same Supabase project the
/// BOX SCORE web app uses; the publishable key is safe to ship in clients
/// because all data access is guarded by Row Level Security.
abstract final class Env {
  static const supabaseUrl = String.fromEnvironment(
    'SUPABASE_URL',
    defaultValue: 'https://sbqnrxqgahfhbmlevtgf.supabase.co',
  );

  static const supabasePublishableKey = String.fromEnvironment(
    'SUPABASE_PUBLISHABLE_KEY',
    defaultValue: 'sb_publishable_0bvxzS5v5zv2x64iKgFLsQ_Prmyjy3f',
  );
}
