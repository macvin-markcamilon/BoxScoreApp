import 'dart:convert';
import 'dart:typed_data';

import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

/// Renders images from the web app, which may be `https://` URLs or inline
/// `data:image/...;base64,` strings. Decoded data URLs are memoised.
class AppImage extends StatelessWidget {
  const AppImage({
    super.key,
    required this.url,
    required this.fallback,
    this.fit = BoxFit.cover,
    this.width,
    this.height,
  });

  final String? url;
  final Widget fallback;
  final BoxFit fit;
  final double? width;
  final double? height;

  static final _cache = <int, Uint8List>{};

  static Uint8List? _decode(String dataUrl) {
    final key = dataUrl.hashCode;
    final cached = _cache[key];
    if (cached != null) return cached;
    final comma = dataUrl.indexOf(',');
    if (comma < 0) return null;
    try {
      final bytes = base64Decode(dataUrl.substring(comma + 1));
      if (_cache.length > 64) _cache.remove(_cache.keys.first);
      return _cache[key] = bytes;
    } on FormatException {
      return null;
    }
  }

  static ImageProvider? provider(String? url) {
    final u = url?.trim();
    if (u == null || u.isEmpty) return null;
    if (u.startsWith('data:image')) {
      final bytes = _decode(u);
      return bytes != null ? MemoryImage(bytes) : null;
    }
    if (u.startsWith('http')) {
      return CachedNetworkImageProvider(u);
    }
    return null;
  }

  @override
  Widget build(BuildContext context) {
    final u = url?.trim();
    if (u == null || u.isEmpty) return fallback;

    if (u.startsWith('data:image')) {
      final bytes = _decode(u);
      if (bytes == null) return fallback;
      return Image.memory(
        bytes,
        fit: fit,
        width: width,
        height: height,
        gaplessPlayback: true,
        errorBuilder: (_, _, _) => fallback,
      );
    }
    if (u.startsWith('http')) {
      return CachedNetworkImage(
        imageUrl: u,
        fit: fit,
        width: width,
        height: height,
        placeholder: (_, _) => fallback,
        errorWidget: (_, _, _) => fallback,
      );
    }
    return fallback;
  }
}
