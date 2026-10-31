import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

Color hexToColor(String? hex, {Color fallback = const Color(0xFF8B0D0E)}) {
  if (hex == null) return fallback;
  var h = hex.replaceAll('#', '').trim();
  if (h.length == 3) h = h.split('').map((c) => '$c$c').join();
  if (h.length == 6) h = 'FF$h';
  final v = int.tryParse(h, radix: 16);
  return v == null ? fallback : Color(v);
}

abstract final class Fmt {
  static final _date = DateFormat('MMM d, yyyy');
  static final _shortDate = DateFormat('EEE, MMM d');
  static final _time = DateFormat('h:mm a');

  static String date(DateTime? d) => d == null ? '—' : _date.format(d);
  static String shortDate(DateTime? d) => d == null ? 'TBA' : _shortDate.format(d);
  static String time(DateTime? d) => d == null ? '' : _time.format(d);

  static String dateRange(DateTime? a, DateTime? b) {
    if (a == null && b == null) return 'Dates TBA';
    final f = DateFormat('MMM d');
    if (a != null && b != null && a.year == b.year) {
      return '${f.format(a)} – ${f.format(b)}, ${b.year}';
    }
    return '${date(a)} – ${date(b)}';
  }

  static String relative(DateTime? d) {
    if (d == null) return 'TBA';
    final now = DateTime.now();
    final today = DateTime(now.year, now.month, now.day);
    final day = DateTime(d.year, d.month, d.day);
    final diff = day.difference(today).inDays;
    final t = time(d);
    final hasTime = d.hour != 0 || d.minute != 0;
    final suffix = hasTime ? ' · $t' : '';
    if (diff == 0) return 'Today$suffix';
    if (diff == 1) return 'Tomorrow$suffix';
    if (diff == -1) return 'Yesterday$suffix';
    return '${shortDate(d)}$suffix';
  }

  static String oneDecimal(double v) => v.toStringAsFixed(1);
  static String pct(double? v) => v == null ? '—' : '${(v * 100).round()}%';

  static String compactNum(num? v) {
    if (v == null) return '—';
    return v % 1 == 0 ? v.toInt().toString() : v.toStringAsFixed(1);
  }
}

String greetingFor(DateTime now) {
  final h = now.hour;
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}
