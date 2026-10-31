import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';
import 'package:intl/intl.dart';

import '../../core/theme/app_colors.dart';
import '../../core/widgets/user_avatar.dart';
import '../../data/models/user_profile.dart';
import '../../data/providers.dart';

class EditProfileScreen extends ConsumerStatefulWidget {
  const EditProfileScreen({super.key});

  @override
  ConsumerState<EditProfileScreen> createState() => _EditProfileScreenState();
}

class _EditProfileScreenState extends ConsumerState<EditProfileScreen> {
  final _formKey = GlobalKey<FormState>();
  final _picker = ImagePicker();

  late TextEditingController _firstNameController;
  late TextEditingController _lastNameController;
  late TextEditingController _phoneController;
  late TextEditingController _addressController;
  late TextEditingController _heightController;
  late TextEditingController _weightController;
  late TextEditingController _jerseyController;
  late TextEditingController _bioController;

  DateTime? _birthday;
  List<PlayerPosition> _positions = [];
  List<AccountRole> _roles = [];
  String? _avatarUrl;
  bool _isSaving = false;

  @override
  void initState() {
    super.initState();
    final p = ref.read(profileProvider).valueOrNull;
    _firstNameController = TextEditingController(text: p?.firstName ?? '');
    _lastNameController = TextEditingController(text: p?.lastName ?? '');
    _phoneController = TextEditingController(text: p?.phone ?? '');
    _addressController = TextEditingController(text: p?.address ?? '');
    _heightController = TextEditingController(
        text: p?.heightCm != null ? '${p!.heightCm!.round()}' : '');
    _weightController = TextEditingController(
        text: p?.weightKg != null ? '${p!.weightKg!.round()}' : '');
    _jerseyController = TextEditingController(
        text: p?.jerseyNumber != null ? '${p!.jerseyNumber}' : '');
    _bioController = TextEditingController(text: p?.bio ?? '');

    _birthday = p?.birthday;
    _positions = List.from(p?.positions ?? []);
    _roles = List.from(p?.accountRoles ?? []);
    _avatarUrl = p?.avatarUrl;
  }

  @override
  void dispose() {
    _firstNameController.dispose();
    _lastNameController.dispose();
    _phoneController.dispose();
    _addressController.dispose();
    _heightController.dispose();
    _weightController.dispose();
    _jerseyController.dispose();
    _bioController.dispose();
    super.dispose();
  }

  Future<void> _pickAvatar() async {
    final image = await _picker.pickImage(
      source: ImageSource.gallery,
      maxWidth: 600,
      maxHeight: 600,
      imageQuality: 85,
    );

    if (image != null) {
      final bytes = await image.readAsBytes();
      final base64String = base64Encode(bytes);
      setState(() {
        _avatarUrl = 'data:image/jpeg;base64,$base64String';
      });
    }
  }

  Future<void> _pickBirthday() async {
    final now = DateTime.now();
    final initialDate = _birthday ?? DateTime(now.year - 20, 1, 1);
    final picked = await showDatePicker(
      context: context,
      initialDate: initialDate,
      firstDate: DateTime(1940),
      lastDate: now,
    );

    if (picked != null) {
      setState(() {
        _birthday = picked;
      });
    }
  }

  void _togglePosition(PlayerPosition pos) {
    setState(() {
      if (_positions.contains(pos)) {
        _positions.remove(pos);
      } else {
        _positions.add(pos);
      }
    });
  }

  void _toggleRole(AccountRole role) {
    setState(() {
      if (_roles.contains(role)) {
        _roles.remove(role);
      } else {
        _roles.add(role);
      }
    });
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;
    if (_positions.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Please select at least one basketball position.')),
      );
      return;
    }

    final current = ref.read(profileProvider).valueOrNull;
    if (current == null) return;

    setState(() => _isSaving = true);

    try {
      final updated = current.copyWith(
        firstName: _firstNameController.text.trim(),
        lastName: _lastNameController.text.trim(),
        phone: _phoneController.text.trim().isEmpty ? null : _phoneController.text.trim(),
        birthday: _birthday,
        address: _addressController.text.trim(),
        heightCm: double.tryParse(_heightController.text.trim()),
        weightKg: double.tryParse(_weightController.text.trim()),
        jerseyNumber: int.tryParse(_jerseyController.text.trim()),
        positions: _positions,
        accountRoles: _roles,
        bio: _bioController.text.trim().isEmpty ? null : _bioController.text.trim(),
        avatarUrl: _avatarUrl,
      );

      await ref.read(profileProvider.notifier).save(updated);
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Profile saved successfully!')),
        );
        Navigator.of(context).pop();
      }
    } catch (err) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to update profile: $err')),
        );
      }
    } finally {
      if (mounted) setState(() => _isSaving = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final current = ref.watch(profileProvider).valueOrNull;

    return Scaffold(
      appBar: AppBar(
        title: const Text('EDIT ATHLETE PROFILE'),
        actions: [
          TextButton(
            onPressed: _isSaving ? null : _save,
            child: _isSaving
                ? const SizedBox(
                    width: 18,
                    height: 18,
                    child: CircularProgressIndicator(strokeWidth: 2),
                  )
                : const Text(
                    'SAVE',
                    style: TextStyle(
                      color: AppColors.brandRed,
                      fontWeight: FontWeight.w900,
                      letterSpacing: 1,
                    ),
                  ),
          ),
        ],
      ),
      body: Form(
        key: _formKey,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(20, 16, 20, 40),
          children: [
            // Avatar picker
            Center(
              child: Stack(
                children: [
                  UserAvatar(
                    profile: current?.copyWith(avatarUrl: _avatarUrl),
                    radius: 50,
                  ),
                  Positioned(
                    right: 0,
                    bottom: 0,
                    child: InkWell(
                      onTap: _pickAvatar,
                      child: Container(
                        padding: const EdgeInsets.all(8),
                        decoration: const BoxDecoration(
                          color: AppColors.brandNavy,
                          shape: BoxShape.circle,
                        ),
                        child: const Icon(Icons.camera_alt, color: Colors.white, size: 18),
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: 8),
            Center(
              child: TextButton.icon(
                onPressed: _pickAvatar,
                icon: const Icon(Icons.upload, size: 18),
                label: const Text('Change Profile Photo'),
              ),
            ),
            const SizedBox(height: 24),

            // Names
            Row(
              children: [
                Expanded(
                  child: TextFormField(
                    controller: _firstNameController,
                    decoration: const InputDecoration(
                      labelText: 'First Name *',
                      prefixIcon: Icon(Icons.person_outline),
                    ),
                    validator: (v) => (v == null || v.trim().isEmpty) ? 'Required' : null,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: TextFormField(
                    controller: _lastNameController,
                    decoration: const InputDecoration(
                      labelText: 'Last Name *',
                      prefixIcon: Icon(Icons.person_outline),
                    ),
                    validator: (v) => (v == null || v.trim().isEmpty) ? 'Required' : null,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),

            // Phone & Jersey
            Row(
              children: [
                Expanded(
                  flex: 3,
                  child: TextFormField(
                    controller: _phoneController,
                    keyboardType: TextInputType.phone,
                    decoration: const InputDecoration(
                      labelText: 'Phone Number',
                      prefixIcon: Icon(Icons.phone_outlined),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  flex: 2,
                  child: TextFormField(
                    controller: _jerseyController,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                      labelText: 'Jersey #',
                      prefixIcon: Icon(Icons.tag),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),

            // Birthday Picker Field
            InkWell(
              onTap: _pickBirthday,
              borderRadius: BorderRadius.circular(12),
              child: InputDecorator(
                decoration: const InputDecoration(
                  labelText: 'Birthday',
                  prefixIcon: Icon(Icons.calendar_month_outlined),
                  suffixIcon: Icon(Icons.arrow_drop_down),
                ),
                child: Text(
                  _birthday != null ? DateFormat('MMMM d, yyyy').format(_birthday!) : 'Select your birthday',
                  style: TextStyle(
                    color: _birthday != null ? AppColors.textStrong : AppColors.textMuted,
                  ),
                ),
              ),
            ),
            const SizedBox(height: 14),

            // Height and Weight
            Row(
              children: [
                Expanded(
                  child: TextFormField(
                    controller: _heightController,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                      labelText: 'Height (cm)',
                      prefixIcon: Icon(Icons.height),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: TextFormField(
                    controller: _weightController,
                    keyboardType: TextInputType.number,
                    decoration: const InputDecoration(
                      labelText: 'Weight (kg)',
                      prefixIcon: Icon(Icons.scale),
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 14),

            // Home Court Address
            TextFormField(
              controller: _addressController,
              maxLines: 2,
              decoration: const InputDecoration(
                labelText: 'Home / Court Address',
                hintText: 'Street, Barangay, City / Province',
                prefixIcon: Icon(Icons.place_outlined),
                helperText: 'Used to suggest nearby tournaments and courts.',
              ),
            ),
            const SizedBox(height: 24),

            // Basketball Position
            const Text(
              'BASKETBALL POSITION (MULTI-SELECT) *',
              style: TextStyle(fontWeight: FontWeight.w900, fontSize: 13, color: AppColors.brandNavy),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                for (final pos in PlayerPosition.values)
                  Expanded(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 3),
                      child: InkWell(
                        onTap: () => _togglePosition(pos),
                        borderRadius: BorderRadius.circular(10),
                        child: Container(
                          padding: const EdgeInsets.symmetric(vertical: 12),
                          decoration: BoxDecoration(
                            color: _positions.contains(pos) ? AppColors.brandRed : Colors.white,
                            borderRadius: BorderRadius.circular(10),
                            border: Border.all(
                              color: _positions.contains(pos) ? AppColors.brandRed : AppColors.border,
                            ),
                          ),
                          child: Column(
                            children: [
                              Text(
                                pos.code,
                                style: TextStyle(
                                  fontWeight: FontWeight.w900,
                                  fontSize: 16,
                                  color: _positions.contains(pos) ? Colors.white : AppColors.textStrong,
                                ),
                              ),
                              const SizedBox(height: 2),
                              Text(
                                pos.label.split(' ').first,
                                style: TextStyle(
                                  fontSize: 9,
                                  fontWeight: FontWeight.w700,
                                  color: _positions.contains(pos) ? Colors.white70 : AppColors.textMuted,
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 24),

            // Account Roles
            const Text(
              'ARE YOU A PLAYER, COACH, REFEREE, OR MANAGER?',
              style: TextStyle(fontWeight: FontWeight.w900, fontSize: 13, color: AppColors.brandNavy),
            ),
            const SizedBox(height: 8),
            for (final role in AccountRole.values)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: CheckboxListTile(
                  value: _roles.contains(role),
                  onChanged: (_) => _toggleRole(role),
                  title: Text(role.value, style: const TextStyle(fontWeight: FontWeight.w900)),
                  subtitle: Text(role.description, style: const TextStyle(fontSize: 12, color: AppColors.textMuted)),
                  activeColor: AppColors.brandNavy,
                  tileColor: Colors.white,
                  shape: RoundedRectangleBorder(
                    borderRadius: BorderRadius.circular(12),
                    side: const BorderSide(color: AppColors.border),
                  ),
                ),
              ),
            const SizedBox(height: 20),

            // Bio
            TextFormField(
              controller: _bioController,
              maxLines: 4,
              decoration: const InputDecoration(
                labelText: 'Bio & Playing Experience',
                hintText: 'Share your background, varsity experience, favorite moves, or coaching accolades.',
              ),
            ),
            const SizedBox(height: 32),

            FilledButton(
              onPressed: _isSaving ? null : _save,
              child: _isSaving
                  ? const CircularProgressIndicator(color: Colors.white)
                  : const Text('SAVE PROFILE CHANGES'),
            ),
          ],
        ),
      ),
    );
  }
}
