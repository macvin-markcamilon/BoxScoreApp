import 'package:flutter/material.dart';

/// Mock data for the Courts tab (design preview — no backend yet).
enum CourtType { indoor, outdoor }

class MockCourt {
  const MockCourt({
    required this.name,
    required this.address,
    required this.distanceKm,
    required this.rating,
    required this.reviews,
    required this.type,
    required this.surface,
    required this.hours,
    required this.pricePerHour,
    required this.color,
    this.openNow = true,
    this.featured = false,
    this.amenities = const [],
    this.activeGames = 0,
  });

  final String name;
  final String address;
  final double distanceKm;
  final double rating;
  final int reviews;
  final CourtType type;
  final String surface;
  final String hours;
  final int? pricePerHour; // null = free
  final Color color;
  final bool openNow;
  final bool featured;
  final List<String> amenities;
  final int activeGames;

  // Position on the mock map, 0..1
  Offset get mapPos => Offset(
        ((name.hashCode % 80).abs() + 10) / 100,
        ((address.hashCode % 70).abs() + 15) / 100,
      );
}

const mockCourts = <MockCourt>[
  MockCourt(
    name: 'Ronac Art Center Gym',
    address: 'Ortigas Ave, San Juan City',
    distanceKm: 1.2,
    rating: 4.8,
    reviews: 312,
    type: CourtType.indoor,
    surface: 'Hardwood',
    hours: '6:00 AM – 11:00 PM',
    pricePerHour: 1800,
    color: Color(0xFF8B0D0E),
    featured: true,
    amenities: ['Aircon', 'Scoreboard', 'Showers', 'Parking'],
    activeGames: 2,
  ),
  MockCourt(
    name: 'Brgy. Kapitolyo Covered Court',
    address: 'United St, Kapitolyo, Pasig City',
    distanceKm: 2.6,
    rating: 4.4,
    reviews: 128,
    type: CourtType.outdoor,
    surface: 'Covered Gym',
    hours: '5:00 AM – 10:00 PM',
    pricePerHour: null,
    color: Color(0xFF0B2F5C),
    featured: true,
    amenities: ['Lights', 'Bleachers'],
    activeGames: 1,
  ),
  MockCourt(
    name: 'Gilas Training Center',
    address: 'Meralco Ave, Pasig City',
    distanceKm: 3.9,
    rating: 4.9,
    reviews: 540,
    type: CourtType.indoor,
    surface: 'Hardwood',
    hours: '7:00 AM – 10:00 PM',
    pricePerHour: 2500,
    color: Color(0xFF059669),
    featured: true,
    amenities: ['Aircon', 'Locker Room', 'Video Wall'],
  ),
  MockCourt(
    name: 'BGC Sports Park',
    address: '28th St, Bonifacio Global City, Taguig',
    distanceKm: 5.4,
    rating: 4.6,
    reviews: 221,
    type: CourtType.outdoor,
    surface: 'Acrylic Outdoor',
    hours: '24 hours',
    pricePerHour: 600,
    color: Color(0xFFD97706),
    amenities: ['Lights', 'Water Station'],
  ),
  MockCourt(
    name: 'Marikina Sports Complex',
    address: 'Shoe Ave, Marikina City',
    distanceKm: 8.1,
    rating: 4.3,
    reviews: 96,
    type: CourtType.indoor,
    surface: 'Sport Court',
    hours: '8:00 AM – 9:00 PM',
    pricePerHour: 1200,
    color: Color(0xFF7C3AED),
    openNow: false,
    amenities: ['Bleachers', 'Parking'],
  ),
  MockCourt(
    name: 'Tondo Liga Court',
    address: 'Moriones St, Tondo, Manila',
    distanceKm: 9.7,
    rating: 4.1,
    reviews: 64,
    type: CourtType.outdoor,
    surface: 'Acrylic Outdoor',
    hours: '5:00 AM – 12:00 AM',
    pricePerHour: null,
    color: Color(0xFF0E7490),
    amenities: ['Lights'],
    activeGames: 1,
  ),
];
