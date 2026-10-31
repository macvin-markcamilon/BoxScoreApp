import 'dart:math' as math;

import 'package:flutter/material.dart';

/// Stylised top-down basketball court used as placeholder imagery.
class CourtArtPainter extends CustomPainter {
  const CourtArtPainter(this.color);
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final rect = Offset.zero & size;
    canvas.drawRect(
      rect,
      Paint()
        ..shader = LinearGradient(
          colors: [color, Color.lerp(color, Colors.black, 0.35)!],
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
        ).createShader(rect),
    );

    final line = Paint()
      ..color = Colors.white.withValues(alpha: 0.55)
      ..style = PaintingStyle.stroke
      ..strokeWidth = math.max(1.2, size.shortestSide / 70);

    final inset = size.shortestSide * 0.08;
    final court = rect.deflate(inset);
    canvas.drawRect(court, line);

    // Half-court line + center circle
    final cx = court.center.dx;
    canvas.drawLine(Offset(cx, court.top), Offset(cx, court.bottom), line);
    canvas.drawCircle(court.center, court.height * 0.16, line);

    // Keys & three-point arcs on both ends
    final keyW = court.width * 0.18;
    final keyH = court.height * 0.36;
    for (final left in [true, false]) {
      final x = left ? court.left : court.right - keyW;
      canvas.drawRect(Rect.fromLTWH(x, court.center.dy - keyH / 2, keyW, keyH), line);
      final arcRect = Rect.fromCircle(
        center: Offset(left ? court.left : court.right, court.center.dy),
        radius: court.height * 0.42,
      );
      canvas.drawArc(
        arcRect,
        left ? -math.pi / 2 : math.pi / 2,
        math.pi,
        false,
        line,
      );
    }
  }

  @override
  bool shouldRepaint(CourtArtPainter old) => old.color != color;
}

/// Fake city map for the courts preview.
class MockMapPainter extends CustomPainter {
  const MockMapPainter();

  @override
  void paint(Canvas canvas, Size size) {
    canvas.drawRect(Offset.zero & size, Paint()..color = const Color(0xFFE8EEF3));

    // Park & water blobs
    canvas.drawRRect(
      RRect.fromRectAndRadius(
        Rect.fromLTWH(size.width * 0.62, size.height * 0.08, size.width * 0.24, size.height * 0.3),
        const Radius.circular(18),
      ),
      Paint()..color = const Color(0xFFCDE8D3),
    );
    final water = Path()
      ..moveTo(0, size.height * 0.78)
      ..quadraticBezierTo(size.width * 0.3, size.height * 0.68, size.width * 0.55, size.height)
      ..lineTo(0, size.height)
      ..close();
    canvas.drawPath(water, Paint()..color = const Color(0xFFC9DDF2));

    final minor = Paint()
      ..color = Colors.white
      ..strokeWidth = 6;
    for (var x = 0.0; x < size.width; x += 46) {
      canvas.drawLine(Offset(x, 0), Offset(x + 30, size.height), minor);
    }
    for (var y = 0.0; y < size.height; y += 40) {
      canvas.drawLine(Offset(0, y), Offset(size.width, y - 12), minor);
    }

    final major = Paint()
      ..color = const Color(0xFFFFE7A3)
      ..strokeWidth = 10
      ..strokeCap = StrokeCap.round;
    canvas.drawLine(Offset(0, size.height * 0.55), Offset(size.width, size.height * 0.35), major);
    canvas.drawLine(Offset(size.width * 0.35, 0), Offset(size.width * 0.45, size.height), major);
  }

  @override
  bool shouldRepaint(MockMapPainter oldDelegate) => false;
}

class PinTailPainter extends CustomPainter {
  const PinTailPainter(this.color);
  final Color color;

  @override
  void paint(Canvas canvas, Size size) {
    final path = Path()
      ..moveTo(0, 0)
      ..lineTo(size.width, 0)
      ..lineTo(size.width / 2, size.height)
      ..close();
    canvas.drawPath(path, Paint()..color = color);
  }

  @override
  bool shouldRepaint(PinTailPainter old) => old.color != color;
}
